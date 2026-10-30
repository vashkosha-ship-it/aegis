"""Генерация экзаменационных вопросов по категории.

Вынесено из роутера: обращение к внешней модели занимает десятки секунд и
может быть перенесено в фоновый воркер. От HTTP логика не зависит.
"""
from __future__ import annotations

import asyncio
import logging
import random

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Category, book_categories
from app.models.book_page import BookPage
from app.services.deepseek_client import DeepSeekError, chat_completion
from app.services.quizzes import clean_questions, extract_json_questions, shuffle_options

logger = logging.getLogger(__name__)

# Порог прохождения аттестации и размер экзамена
PASS_THRESHOLD = 85
NUM_QUESTIONS = 50
# Меньше — экзамен не выдаём: именной сертификат за 10 вопросов вместо 50
# не подтверждает знание темы.
MIN_QUESTIONS = 40
MAX_BATCH_ATTEMPTS = 10


# Служебная категория: книги, которым тему ещё не назначили. Аттестация
# «по теме Без категории» бессмысленна.
UNCATEGORIZED = "Без категории"


async def certifiable_categories(db: AsyncSession) -> list[str]:
    """Темы, по которым можно собрать экзамен: есть книга с проиндексированным текстом.

    В таблице категорий остались старые и пустые темы («AI», «Hack»,
    «analytics»…). Раньше в списке аттестации были все 55, и выбор пустой
    заканчивался ошибкой «Недостаточно текста».
    """
    has_text = exists(
        select(BookPage.id)
        .join(book_categories, book_categories.c.book_id == BookPage.book_id)
        .where(book_categories.c.category_id == Category.id)
    )
    rows = await db.scalars(
        select(Category.name)
        .where(has_text, Category.name != UNCATEGORIZED)
        .order_by(Category.name.asc())
    )
    return list(rows.all())


async def gather_category_text(db: AsyncSession, category: str, max_chars: int = 12000) -> str:
    """Собирает выдержки текста книг указанной категории для генерации вопросов."""
    cat = await db.scalar(select(Category).where(Category.name == category))
    if not cat:
        return ""
    book_ids = (await db.scalars(
        select(book_categories.c.book_id).where(book_categories.c.category_id == cat.id)
    )).all()
    if not book_ids:
        return ""
    # Берём страницы из книг категории, перемешиваем для разнообразия
    # Случайные страницы по всем книгам темы. Раньше брались первые 400
    # страниц — почти всегда одна-две книги, и вопросы были однобокими.
    pages = (await db.scalars(
        select(BookPage.content)
        .where(BookPage.book_id.in_(book_ids))
        .order_by(func.random())
        .limit(400)
    )).all()
    pages = [p for p in pages if p and len(p.strip()) > 100]
    random.shuffle(pages)
    text = ""
    for p in pages:
        if len(text) >= max_chars:
            break
        text += p.strip()[:2000] + "\n\n"
    return text[:max_chars]


_EXAM_PROMPT = """На основе материалов по теме "{category}" сгенерируй РОВНО {n} вопросов для аттестации.
Каждый вопрос — с 4 вариантами ответа, ровно один правильный.
Это аттестация, вопросы должны быть СЛОЖНЫМИ, для специалиста: не больше
пятой части — на определения, остальные — на применение и анализ (разбор
ситуации или примера, выбор лучшего решения, последствия действия, отличие
близких понятий, типичная ошибка). Неверные варианты — правдоподобные
заблуждения и частично верные утверждения. Вопросы не повторяются.
Правильный и неправильные варианты — одинаковой длины и в одном стиле:
по длине или подробности ответа нельзя угадать правильный.
Не используй варианты «все перечисленное» / «ничего из перечисленного»
и не спрашивай о самой книге, её авторе или главах — только о предмете.
Правильный ответ ставь на разные позиции (0–3).
{extra}
Верни СТРОГО JSON без markdown:
{{"questions":[{{"question":"...","options":["A","B","C","D"],"correct_index":0}}]}}

Материалы:
{text}"""


def parse_questions(raw: str) -> tuple[list[dict], list[int]]:
    """Разобрать JSON-ответ AI в (вопросы без ответов, индексы правильных).

    Вопросы проходят ту же проверку качества, что и тесты по книгам: ровно
    4 разных варианта, без «все перечисленное», без вопросов о книге как
    таковой и без правильного ответа, выдающего себя длиной.
    """
    raw_qs = extract_json_questions(raw)
    if raw_qs is None:
        return [], []
    questions, correct = [], []
    for q in clean_questions(raw_qs):
        # Модель почти всегда ставит правильный ответ на одно и то же место.
        q = shuffle_options(q)
        questions.append({"question": q["question"], "options": q["options"]})
        correct.append(q["correct_index"])
    return questions, correct


async def generate_questions_batch(category: str, text: str, n: int, seen: list[str]) -> tuple[list[dict], list[int]]:
    """Сгенерировать порцию из n вопросов. seen — уже использованные формулировки (для разнообразия)."""
    extra = ""
    if seen:
        sample = "; ".join(seen[-15:])
        extra = f"НЕ повторяй уже заданные вопросы: {sample}"
    prompt = _EXAM_PROMPT.format(category=category, n=n, text=text, extra=extra)
    raw = await chat_completion(
        [{"role": "user", "content": prompt}],
        system_prompt="Ты генерируешь экзаменационные тесты строго в формате JSON.",
        max_tokens=4000,
        timeout=120.0,
    )
    return parse_questions(raw)



# Параллельных запросов к модели за раз. Последовательная генерация пяти
# порций занимала минуты и обрывалась на первой ошибке модели.
EXAM_PARALLEL_BATCHES = 6
EXAM_BATCH_SIZE = 10


async def generate_exam(category: str, text: str) -> tuple[list[dict], list[int]]:
    """Собрать до NUM_QUESTIONS вопросов: порции параллельно, ошибки не фатальны."""
    questions: list[dict] = []
    correct: list[int] = []
    seen: set[str] = set()
    attempts = 0
    failures = 0
    while len(questions) < NUM_QUESTIONS and attempts < MAX_BATCH_ATTEMPTS:
        missing = NUM_QUESTIONS - len(questions)
        # С запасом: часть вопросов отбраковывает проверка качества.
        batches = min(
            EXAM_PARALLEL_BATCHES,
            MAX_BATCH_ATTEMPTS - attempts,
            max(1, -(-missing * 3 // 2) // EXAM_BATCH_SIZE),
        )
        attempts += batches
        known = [q["question"] for q in questions]
        results = await asyncio.gather(
            *(generate_questions_batch(category, text, EXAM_BATCH_SIZE, known) for _ in range(batches)),
            return_exceptions=True,
        )
        for result in results:
            if isinstance(result, BaseException):
                failures += 1
                if not isinstance(result, DeepSeekError):
                    logger.exception("Порция экзамена по %s упала", category, exc_info=result)
                continue
            for q, c in zip(*result, strict=True):
                key = q["question"].casefold()
                if key in seen:
                    continue
                seen.add(key)
                questions.append(q)
                correct.append(c)
    logger.info(
        "Экзамен по %s: %d вопросов, порций %d, ошибок модели %d",
        category, len(questions), attempts, failures,
    )
    return questions[:NUM_QUESTIONS], correct[:NUM_QUESTIONS]
