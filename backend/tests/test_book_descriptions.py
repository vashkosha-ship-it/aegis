from unittest.mock import AsyncMock

import pytest

from app.services import book_descriptions


@pytest.mark.asyncio
async def test_generate_book_description_uses_guarded_prompt(monkeypatch):
    completion = AsyncMock(
        return_value="Описание: Книга посвящена защите приложений. "
    )
    monkeypatch.setattr(book_descriptions, "chat_completion", completion)

    result = await book_descriptions.generate_book_description(
        title="Безопасный код",
        author="И. Иванов",
        categories=["AppSec", "Secure Coding"],
    )

    assert result == "Книга посвящена защите приложений."
    messages = completion.await_args.args[0]
    assert "Безопасный код" in messages[0]["content"]
    assert "AppSec, Secure Coding" in messages[0]["content"]
    assert "Не выдумывай" in completion.await_args.kwargs["system_prompt"]


@pytest.mark.asyncio
async def test_generate_book_description_limits_stored_text(monkeypatch):
    monkeypatch.setattr(
        book_descriptions,
        "chat_completion",
        AsyncMock(return_value="x" * 2500),
    )

    result = await book_descriptions.generate_book_description(
        title="Книга", author="—", categories=[]
    )

    assert len(result) == 2000
