"""Тесты по книгам должны быть про предмет книги, а не про ИБ «вообще»."""
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.data.quiz_banks import CATEGORY_QUIZZES
from app.services import quizzes


def _book(title="Компьютерные сети", categories=("Компьютерные сети",)):
    return SimpleNamespace(
        id=1,
        title=title,
        author="Л. Петерсон",
        description="",
        categories=[SimpleNamespace(name=name) for name in categories],
    )


def _ai_answer(count=15):
    return json.dumps(
        {
            "questions": [
                {"question": f"Вопрос {i}?", "options": ["a", "b", "c", "d"], "correct_index": 0}
                for i in range(count)
            ]
        },
        ensure_ascii=False,
    )


def test_category_mapping_points_to_existing_banks():
    for bank in quizzes.CATEGORY_TO_QUIZ_BANK.values():
        assert bank in CATEGORY_QUIZZES


@pytest.mark.asyncio
async def test_ai_quiz_prompt_uses_book_subject_and_excerpt(monkeypatch):
    completion = AsyncMock(return_value=_ai_answer())
    monkeypatch.setattr(quizzes, "chat_completion", completion)

    result = await quizzes.generate_ai_quiz(_book(), "TCP устанавливает соединение рукопожатием")

    assert result is not None and len(result) == 15
    prompt = completion.await_args.args[0][0]["content"]
    assert "«Компьютерные сети»" in prompt
    assert "TCP устанавливает соединение" in prompt
    assert "<book_excerpt>" in prompt
    assert "Не подменяй тему кибербезопасностью" in prompt


@pytest.mark.asyncio
async def test_ai_quiz_prompt_without_excerpt(monkeypatch):
    completion = AsyncMock(return_value=_ai_answer())
    monkeypatch.setattr(quizzes, "chat_completion", completion)

    await quizzes.generate_ai_quiz(_book())

    prompt = completion.await_args.args[0][0]["content"]
    assert "<book_excerpt>" not in prompt
