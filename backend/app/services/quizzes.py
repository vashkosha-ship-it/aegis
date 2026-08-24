"""Генерация и подбор вопросов для тестов по книгам.

Логика вынесена из роутера: она не зависит от HTTP и достаточно тяжёлая
(обращение к внешней модели), чтобы её можно было позже перенести в фоновый
воркер — как уже сделано с индексацией PDF.
"""
from __future__ import annotations

import json
import logging
import random

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.quiz_banks import CATEGORY_QUIZZES, GENERIC_QUIZ
from app.models.book import Book
from app.models.quiz import QuizQuestion
from app.services.deepseek_client import DeepSeekError, chat_completion

logger = logging.getLogger(__name__)


_AI_QUIZ_PROMPT = (
    "Ты — методист по информационной безопасности. Составь тест из 15 вопросов "
    "с вариантами ответа по книге. Тема книги: «{title}»"
    "{author}{cats}{desc}.\n\n"
    "Требования:\n"
    "- ровно 15 вопросов;\n"
    "- у каждого 4 варианта ответа;\n"
    "- только один правильный;\n"
    "- вопросы по сути темы книги (кибербезопасность), разной сложности;\n"
    "- не повторяй вопросы, формулируй их по-разному;\n"
    "- на русском языке.\n\n"
    "Верни СТРОГО валидный JSON без markdown и пояснений, в формате:\n"
    '{{"questions":[{{"question":"...","options":["A","B","C","D"],"correct_index":0}}]}}'
)


# Сколько вопросов отдаём пользователю за одну попытку.
QUIZ_SERVE_COUNT = 15


def shuffle_options(item: dict) -> dict:
    """Перемешать варианты ответа, скорректировав correct_index.

    Иначе правильный ответ всегда стоит первым ('A') — его легко угадать.
    """
    opts = list(item["options"])
    correct_text = opts[item["correct_index"]]
    random.shuffle(opts)
    return {
        "question": item["question"],
        "options": opts,
        "correct_index": opts.index(correct_text),
    }


def select_questions(questions: list) -> list:
    """Случайная выборка до QUIZ_SERVE_COUNT вопросов в перемешанном порядке.

    За счёт случайной выборки каждый повторный запрос теста («Пройти заново»)
    даёт новый набор/порядок вопросов, пока пул в БД больше QUIZ_SERVE_COUNT.
    """
    pool = list(questions)
    random.shuffle(pool)
    return pool[:QUIZ_SERVE_COUNT]


async def generate_ai_quiz(book: Book) -> list[dict] | None:
    """Сгенерировать тест через DeepSeek. None при любой неудаче."""
    try:
        cat_names = [c.name for c in (book.categories or [])]
    except Exception:
        cat_names = []

    author = f", автор: {book.author}" if getattr(book, "author", None) else ""
    cats = f", категории: {', '.join(cat_names)}" if cat_names else ""
    desc = ""
    if getattr(book, "description", None):
        desc = f". Описание: {book.description[:1500]}"

    prompt = _AI_QUIZ_PROMPT.format(title=book.title, author=author, cats=cats, desc=desc)

    try:
        raw = await chat_completion(
            [{"role": "user", "content": prompt}],
            system_prompt="Ты генерируешь тесты строго в формате JSON.",
        )
    except DeepSeekError as e:
        logger.warning("AI quiz generation failed for book %s: %s", book.id, e)
        return None

    # Вырезаем JSON (на случай markdown-обёртки ```json ... ```)
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        logger.warning("AI quiz: no JSON braces for book %s", book.id)
        return None
    try:
        data = json.loads(text[start:end + 1])
        questions = data["questions"]
    except (ValueError, KeyError, TypeError) as e:
        logger.warning("AI quiz: bad JSON for book %s: %s", book.id, e)
        return None

    # Валидация структуры
    cleaned: list[dict] = []
    for q in questions:
        try:
            qt = str(q["question"]).strip()
            opts = [str(o).strip() for o in q["options"]]
            ci = int(q["correct_index"])
        except (KeyError, TypeError, ValueError):
            continue
        if qt and len(opts) >= 2 and 0 <= ci < len(opts):
            cleaned.append({"question": qt, "options": opts, "correct_index": ci})

    if len(cleaned) < 5:
        logger.warning("AI quiz: too few valid questions (%d) for book %s", len(cleaned), book.id)
        return None
    return cleaned[:18]


async def ensure_quiz_for_book(db: AsyncSession, book: Book) -> list[QuizQuestion]:
    """Lazily generate static quiz for a book if none exists yet."""
    existing = (
        await db.scalars(select(QuizQuestion).where(QuizQuestion.book_id == book.id))
    ).all()
    if existing:
        return list(existing)

    # 1) Пробуем сгенерировать тест через ИИ (DeepSeek)
    ai_questions = await generate_ai_quiz(book)
    if ai_questions:
        new_questions = [
            QuizQuestion(
                book_id=book.id,
                question=s["question"],
                options=s["options"],
                correct_index=s["correct_index"],
                source="ai",
            )
            for s in (shuffle_options(t) for t in ai_questions)
        ]
        db.add_all(new_questions)
        await db.commit()
        for q in new_questions:
            await db.refresh(q)
        logger.info("AI quiz created for book %s (%d questions)", book.id, len(new_questions))
        return new_questions

    # 2) Fallback: пул из шаблона по категории + общих вопросов (чтобы было >15
    #    и выборка/перемешивание давали разнообразие). Дедуп по тексту вопроса.
    template: list[dict] = []
    try:
        book_cat_names = [c.name for c in (book.categories or [])]
    except Exception:
        book_cat_names = []
    for name in book_cat_names:
        if name in CATEGORY_QUIZZES:
            template = list(CATEGORY_QUIZZES[name])
            break

    pool: list[dict] = list(template) + list(GENERIC_QUIZ)
    # Если книга без совпавшей категории — добираем вопросы из других банков,
    # чтобы пул был заметно больше QUIZ_SERVE_COUNT и выборка давала разнообразие.
    if len(pool) < QUIZ_SERVE_COUNT + 3:
        for _name, _bank in CATEGORY_QUIZZES.items():
            pool += list(_bank)
    seen: set[str] = set()
    unique_pool: list[dict] = []
    for t in pool:
        key = t["question"].strip().lower()
        if key in seen:
            continue
        seen.add(key)
        unique_pool.append(t)

    new_questions = [
        QuizQuestion(
            book_id=book.id,
            question=s["question"],
            options=s["options"],
            correct_index=s["correct_index"],
            source="static",
        )
        for s in (shuffle_options(t) for t in unique_pool)
    ]
    db.add_all(new_questions)
    await db.commit()
    for q in new_questions:
        await db.refresh(q)
    return new_questions
