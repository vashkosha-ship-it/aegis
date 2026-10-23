"""Подсказки категорий в админке не должны тянуть теги без книг."""
import pytest

from app.models.book import Book, Category


@pytest.mark.asyncio
async def test_categories_list_skips_categories_without_books(client, db):
    used = Category(name="Компьютерные сети")
    orphan = Category(name="IT Architecture")
    db.add_all([used, orphan])
    await db.flush()
    db.add(Book(title="Сети", author="Автор", description="", categories=[used]))
    await db.commit()

    response = await client.get("/books/categories/all")

    assert response.status_code == 200
    names = response.json()
    assert "Компьютерные сети" in names
    assert "IT Architecture" not in names
