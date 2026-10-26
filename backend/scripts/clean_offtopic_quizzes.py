"""Убрать из временных тестов вопросы не по теме книги.

Воркер делает это сам при каждом старте (задача идемпотентна), так что
запускать скрипт вручную обычно не нужно. Он оставлен, чтобы посмотреть,
что будет удалено, или почистить без перезапуска воркера.

AI-тесты (source='ai') и история прохождения (quiz_attempts) не трогаются.

Запуск из каталога backend:
    python -m scripts.clean_offtopic_quizzes           # показать, что изменится
    python -m scripts.clean_offtopic_quizzes --apply   # записать
"""
from __future__ import annotations

import argparse
import asyncio

from app.db.session import AsyncSessionLocal
from app.services.quizzes import remove_offtopic_temporary_questions


async def main(apply: bool) -> None:
    async with AsyncSessionLocal() as db:
        items = await remove_offtopic_temporary_questions(db, apply=apply)
    if not items:
        print("Вопросов не по теме во временных тестах нет — менять нечего.")
        return

    total = sum(item["removed"] for item in items)
    print(f"Книг с вопросами не по теме: {len(items)}, вопросов: {total}\n")
    for item in items:
        tail = f"останется {item['left']} вопросов темы" if item["left"] else "тест будет готовиться заново"
        print(f"  #{item['book_id']:<5} {item['title'][:70]:<70}  −{item['removed']:>3}  ({tail})")

    if apply:
        print(f"\nУдалено вопросов: {total}. AI-тесты для этих книг составит фоновый воркер.")
    else:
        print("\nЭто проверка, ничего не записано. Для записи: --apply")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="записать изменения")
    asyncio.run(main(parser.parse_args().apply))
