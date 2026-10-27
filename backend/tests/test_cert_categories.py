"""Аттестация: в списке только темы, по которым есть проиндексированный текст."""
from __future__ import annotations

from app.models.book import Book, Category
from app.models.book_page import BookPage
from tests.conftest import auth_headers


async def test_only_categories_with_indexed_books(client, db, approved_user):
    with_text = Category(name="Криптография")
    empty = Category(name="Hack")
    no_pages = Category(name="Сети")
    uncategorized = Category(name="Без категории")
    db.add_all([with_text, empty, no_pages, uncategorized])
    await db.flush()

    indexed = Book(title="Шифры", author="А", description="", categories=[with_text, uncategorized])
    not_indexed = Book(title="Пакеты", author="Б", description="", categories=[no_pages])
    db.add_all([indexed, not_indexed])
    await db.flush()
    db.add(BookPage(book_id=indexed.id, page=1, content="Текст о шифрах " * 20))
    await db.commit()

    r = await client.get("/certificates/categories", headers=auth_headers(approved_user))
    assert r.status_code == 200, r.text
    assert r.json() == ["Криптография"]


async def test_exam_generation_survives_model_errors(monkeypatch):
    """Ошибка одной порции не обрывает экзамен; повторы отбрасываются."""
    from app.services import certificates as cert
    from app.services.deepseek_client import DeepSeekError

    calls = {"n": 0}

    async def fake_batch(category, text, n, seen):
        calls["n"] += 1
        call = calls["n"]
        if call == 1:
            raise DeepSeekError("timeout")
        if call == 2:
            # Повтор вопросов другой порции — должен отбрасываться.
            qs = [{"question": "Вопрос 3-0", "options": ["a", "b", "c", "d"]}]
            return qs, [0]
        qs = [
            {"question": f"Вопрос {call}-{i}", "options": ["a", "b", "c", "d"]}
            for i in range(n)
        ]
        return qs, [i % 4 for i in range(n)]

    monkeypatch.setattr(cert, "generate_questions_batch", fake_batch)
    questions, correct = await cert.generate_exam("Криптография", "текст")
    assert len(questions) == cert.NUM_QUESTIONS
    assert len(correct) == cert.NUM_QUESTIONS
    assert len({q["question"] for q in questions}) == cert.NUM_QUESTIONS
