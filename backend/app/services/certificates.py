"""Генерация экзаменационных вопросов по категории.

Вынесено из роутера: обращение к внешней модели занимает десятки секунд и
может быть перенесено в фоновый воркер. От HTTP логика не зависит.
"""
from __future__ import annotations

import logging
import random

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Category, book_categories
from app.models.book_page import BookPage
from app.services.deepseek_client import chat_completion
from app.services.quizzes import clean_questions, extract_json_questions

logger = logging.getLogger(__name__)

# Порог прохождения аттестации и размер экзамена
PASS_THRESHOLD = 85
NUM_QUESTIONS = 50
# Меньше — экзамен не выдаём: именной сертификат за 10 вопросов вместо 50
# не подтверждает знание темы.
MIN_QUESTIONS = 40
MAX_BATCH_ATTEMPTS = 10


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
    pages = (await db.scalars(
        select(BookPage.content).where(BookPage.book_id.in_(book_ids)).limit(400)
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
Вопросы должны проверять понимание темы, быть разной сложности, не повторяться.
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

