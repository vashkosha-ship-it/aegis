"""«Книги для схем» не должна ставить темы безопасности книгам по программированию."""
import json
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.book import Book, Category
from tests.conftest import auth_headers

TOPICS = ["Веб-безопасность", "Технический оффенсив", "Криптография"]


@pytest.mark.asyncio
async def test_ar_match_prompt_is_strict_and_caps_topics(client, db, admin_user, monkeypatch):
    book = Book(title="Безопасность веб-приложений", author="Э. Хоффман", description="",
                categories=[Category(name="Программирование")])
    db.add(book)
    await db.commit()
    book_id = book.id
    answer = {"matches": [{"id": book_id, "topics": TOPICS}]}
    completion = AsyncMock(return_value=json.dumps(answer, ensure_ascii=False))
    monkeypatch.setattr("app.services.deepseek_client.chat_completion", completion)

    response = await client.post(
        "/books/ai-match-ar-topics", json={"topics": TOPICS}, headers=auth_headers(admin_user),
    )

    assert response.status_code == 200, response.text
    prompt = completion.await_args.args[0][0]["content"]
    assert "Книги по языкам программирования" in prompt
    assert "Если сомневаешься — темы не ставь" in prompt
    db.expire_all()
    saved = await db.scalar(select(Book).options(selectinload(Book.categories)).where(Book.id == book_id))
    names = {c.name for c in saved.categories}
    # Модель «отметила всё» — сохраняются не больше двух тем.
    assert len(names - {"Программирование"}) == 2
