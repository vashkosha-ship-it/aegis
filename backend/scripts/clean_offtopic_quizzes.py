"""Убрать из временных тестов вопросы не по теме книги.

До исправления книга, для которой ИИ не смог составить тест, получала общий
набор вопросов «про ИБ вообще» — например, про zero-day и DDoS в книге о
гейм-дизайне. Новые тесты так не собираются, но старые наборы остались в
базе. Скрипт удаляет из них вопросы, которых нет в шаблонном банке темы
самой книги. Если от теста ничего не остаётся, книга показывает «Тест
готовится», а фоновый воркер составит для неё AI-тест.

AI-тесты (source='ai') и история прохождения (quiz_attempts) не трогаются.

Запуск из каталога backend:
    python -m scripts.clean_offtopic_quizzes           # показать, что изменится
    python -m scripts.clean_offtopic_quizzes --apply   # записать
"""
from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.db.session import AsyncSessionLocal
from app.models.book import Book
from app.models.quiz import QuizQuestion
from app.services.quizzes import SOURCE_AI, SOURCE_FALLBACK, fallback_questions


async def plan(db) -> list[tuple[Book, list[int], int]]:
    """(книга, id вопросов к удалению, сколько временных вопросов останется)."""
    books = (
        await db.scalars(select(Book).options(selectinload(Book.categories)).order_by(Book.id))
    ).all()
    result = []
    for book in books:
        rows = (
            await db.scalars(select(QuizQuestion).where(QuizQuestion.book_id == book.id))
        ).all()
        if not rows or any(q.source == SOURCE_AI for q in rows):
            continue
        allowed = {t["question"].strip().casefold() for t in fallback_questions(book)}
        off_topic = [
            q.id for q in rows
            if q.source == SOURCE_FALLBACK and q.question.strip().casefold() not in allowed
        ]
        if off_topic:
            result.append((book, off_topic, len(rows) - len(off_topic)))
    return result


async def main(apply: bool) -> None:
    async with AsyncSessionLocal() as db:
        items = await plan(db)
        if not items:
            print("Вопросов не по теме во временных тестах нет — менять нечего.")
            return

        total = sum(len(ids) for _, ids, _ in items)
        print(f"Книг с вопросами не по теме: {len(items)}, вопросов к удалению: {total}\n")
        for book, ids, left in items:
            tail = f"останется {left} вопросов темы" if left else "тест будет готовиться заново"
            print(f"  #{book.id:<5} {book.title[:70]:<70}  −{len(ids):>3}  ({tail})")

        if not apply:
            print("\nЭто проверка, ничего не записано. Для записи: --apply")
            return

        for _, ids, _ in items:
            await db.execute(delete(QuizQuestion).where(QuizQuestion.id.in_(ids)))
        await db.commit()
        print(f"\nУдалено вопросов: {total}. AI-тесты для этих книг составит фоновый воркер.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="записать изменения")
    asyncio.run(main(parser.parse_args().apply))
