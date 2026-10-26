"""Временные тесты, их замена на AI-тесты и проверка качества вопросов.

Раньше книга, по которой ИИ не смог составить тест, навсегда получала общий
набор вопросов про ИБ — даже книга о гейм-дизайне.
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from app.data.quiz_banks import CATEGORY_QUIZZES, GENERIC_QUIZ
from app.models.book import Book, Category
from app.models.book_page import BookPage
from app.models.quiz import QuizQuestion
from app.services import certificates, quizzes
from tests.conftest import auth_headers


def _ai_answer(count=15):
    return json.dumps(
        {
            "questions": [
                {
                    "question": f"Как работает механизм номер {i}?",
                    "options": [f"Так {i}", f"Иначе {i}", f"Никак {i}", f"Случайно {i}"],
                    "correct_index": 0,
                }
                for i in range(count)
            ]
        },
        ensure_ascii=False,
    )


async def _book(db, title, category):
    cat = Category(name=category)
    book = Book(title=title, author="Автор", description="", categories=[cat])
    db.add(book)
    await db.commit()
    await db.refresh(book, attribute_names=["categories"])
    return book


async def _questions(db, book_id):
    return (
        await db.scalars(select(QuizQuestion).where(QuizQuestion.book_id == book_id))
    ).all()


# --- Запасной тест ---------------------------------------------------------

async def test_non_security_book_gets_no_generic_questions(client, db, approved_user):
    book = await _book(db, "Элементы гейм-дизайна", "Разработка игр и XR")

    r = await client.get(f"/books/{book.id}/quiz", headers=auth_headers(approved_user))

    assert r.status_code == 200
    assert r.json() == []
    assert r.headers.get("X-Quiz-Status") == "preparing"
    assert r.headers.get("X-Quiz-Session") is None
    assert await _questions(db, book.id) == []


async def test_security_book_gets_only_its_own_bank(client, db, approved_user):
    book = await _book(db, "Безопасность веб-приложений", "Веб-безопасность")

    r = await client.get(f"/books/{book.id}/quiz", headers=auth_headers(approved_user))

    assert r.status_code == 200
    assert r.json()
    assert r.headers.get("X-Quiz-Status") == "temporary"
    assert r.headers.get("X-Quiz-Session")

    stored = {q.question for q in await _questions(db, book.id)}
    bank = {q["question"] for q in CATEGORY_QUIZZES["Веб-безопасность"]}
    generic = {q["question"] for q in GENERIC_QUIZ}
    assert stored == bank
    assert not (stored & (generic - bank))


async def test_get_quiz_never_calls_the_model(client, db, approved_user, monkeypatch):
    completion = AsyncMock(return_value=_ai_answer())
    monkeypatch.setattr(quizzes, "chat_completion", completion)
    book = await _book(db, "Компьютерные сети", "Компьютерные сети")

    await client.get(f"/books/{book.id}/quiz", headers=auth_headers(approved_user))

    completion.assert_not_awaited()


# --- Замена временного теста на AI-тест -----------------------------------

async def test_upgrade_replaces_temporary_quiz(db, monkeypatch):
    monkeypatch.setattr(quizzes, "chat_completion", AsyncMock(return_value=_ai_answer()))
    book = await _book(db, "Безопасность веб-приложений", "Веб-безопасность")
    await quizzes.ensure_quiz_for_book(db, book)
    assert {q.source for q in await _questions(db, book.id)} == {"static"}

    rows = await quizzes.upgrade_quiz_for_book(db, book)

    assert rows and len(rows) == 15
    stored = await _questions(db, book.id)
    assert {q.source for q in stored} == {"ai"}
    assert len(stored) == 15


async def test_failed_upgrade_keeps_temporary_quiz(db, monkeypatch):
    monkeypatch.setattr(quizzes, "chat_completion", AsyncMock(return_value="не JSON"))
    book = await _book(db, "Безопасность веб-приложений", "Веб-безопасность")
    await quizzes.ensure_quiz_for_book(db, book)
    before = {q.id for q in await _questions(db, book.id)}

    assert await quizzes.upgrade_quiz_for_book(db, book) is None
    assert {q.id for q in await _questions(db, book.id)} == before


async def test_upgrade_is_noop_when_ai_quiz_exists(db, monkeypatch):
    completion = AsyncMock(return_value=_ai_answer())
    monkeypatch.setattr(quizzes, "chat_completion", completion)
    book = await _book(db, "Компьютерные сети", "Компьютерные сети")
    await quizzes.upgrade_quiz_for_book(db, book)
    first = {q.id for q in await _questions(db, book.id)}

    await quizzes.upgrade_quiz_for_book(db, book)

    assert completion.await_count == 1
    assert {q.id for q in await _questions(db, book.id)} == first


async def test_admin_regenerate_falls_back_when_model_fails(client, db, admin_user, monkeypatch):
    monkeypatch.setattr(quizzes, "chat_completion", AsyncMock(return_value="{}"))
    book = await _book(db, "Безопасность веб-приложений", "Веб-безопасность")

    r = await client.post(f"/books/{book.id}/quiz/regenerate", headers=auth_headers(admin_user))

    assert r.status_code == 200
    assert len(r.json()) == len(CATEGORY_QUIZZES["Веб-безопасность"])


async def test_books_needing_ai_quiz_puts_books_without_any_quiz_first(db, monkeypatch):
    monkeypatch.setattr(quizzes, "chat_completion", AsyncMock(return_value=_ai_answer()))
    with_temp = await _book(db, "Безопасность веб-приложений", "Веб-безопасность")
    await quizzes.ensure_quiz_for_book(db, with_temp)
    with_ai = await _book(db, "Компьютерные сети", "Компьютерные сети")
    await quizzes.upgrade_quiz_for_book(db, with_ai)
    without = await _book(db, "Гейм-дизайн", "Разработка игр и XR")
    indexing = await _book(db, "Индексируется", "Программирование")
    indexing.indexing_status = "running"
    await db.commit()

    ids = await quizzes.books_needing_ai_quiz(db, limit=10)

    assert ids == [without.id, with_temp.id]


# --- Фрагменты текста -------------------------------------------------------

async def test_quiz_excerpt_skips_front_matter_and_spans_the_book(db):
    book = Book(title="Длинная книга", author="Автор", description="")
    db.add(book)
    await db.flush()
    db.add_all([
        BookPage(book_id=book.id, page=p, content=f"страница{p:03d} " + "текст " * 60)
        for p in range(1, 101)
    ])
    await db.commit()

    excerpt = await quizzes.load_quiz_excerpt(db, book.id)

    assert "страница001" not in excerpt  # обложка и оглавление пропущены
    assert "страница011" in excerpt
    assert "страница088" in excerpt  # конец книги тоже попадает
    assert len(excerpt) <= quizzes.QUIZ_CONTEXT_MAX_CHARS


# --- Качество вопросов ------------------------------------------------------

@pytest.mark.parametrize("question, options, reason", [
    ("Какова основная цель книги?", ["a", "b", "c", "d"], "about_the_book"),
    ("О чём эта книга?", ["a", "b", "c", "d"], "about_the_book"),
    ("Для какой аудитории предназначена книга?", ["a", "b", "c", "d"], "about_the_book"),
    ("Что такое TCP?", ["a", "b", "c"], "options_count"),
    ("Что такое TCP?", ["a", "a", "c", "d"], "duplicate_options"),
    ("Что такое TCP?", ["a", "b", "c", "Все перечисленные варианты"], "catch_all_option"),
    (
        "Что такое TCP?",
        ["Протокол транспортного уровня с установлением соединения", "UDP", "IP", "ARP"],
        "giveaway_length",
    ),
])
def test_quality_issue_rejects_bad_questions(question, options, reason):
    assert quizzes.quality_issue(question, options, 0) == reason


def test_quality_issue_accepts_a_good_question():
    assert quizzes.quality_issue(
        "Почему RAII упрощает управление памятью в C++?",
        ["Ресурс освобождается в деструкторе", "Отключает исключения",
         "Ускоряет компиляцию", "Заменяет все указатели"],
        0,
    ) is None


def test_clean_questions_drops_duplicates():
    item = {"question": "Что делает yield?", "options": ["a", "b", "c", "d"], "correct_index": 1}
    assert len(quizzes.clean_questions([item, {**item, "question": "что делает  yield?"}])) == 1


def test_exam_parser_uses_the_same_quality_check():
    raw = json.dumps({"questions": [
        {"question": "Какова цель книги?", "options": ["a", "b", "c", "d"], "correct_index": 0},
        {"question": "Что такое XSS?", "options": ["a", "b", "c", "d"], "correct_index": 2},
    ]}, ensure_ascii=False)

    questions, correct = certificates.parse_questions(raw)

    assert [q["question"] for q in questions] == ["Что такое XSS?"]
    assert correct == [2]
