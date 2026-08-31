"""Гонки МЕЖДУ разными сессиями.

Предыдущие тесты проверяли параллельные запросы по одному токену — там
спасала блокировка строки сессии. Здесь запросы идут по разным строкам:
две вкладки с отдельно открытым тестом, два экзамена по одной теме, две
книги одновременно. Блокировка сессии в таких случаях не срабатывает вовсе,
потому что блокируются разные строки.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.session import get_db
from app.main import app
from app.models.certificate import Certificate
from app.models.exam_session import ExamSession
from app.models.quiz import QuizAttempt, QuizQuestion
from app.services import reading_progress
from tests.conftest import auth_headers


@pytest_asyncio.fixture
async def parallel_client(engine, db):
    """Клиент, выдающий каждому запросу отдельную сессию БД.

    Такая же, как в test_concurrency.py. Импортировать фикстуру из соседнего
    модуля нельзя — pytest подхватит её, но линтер увидит переопределение имени
    в каждом тесте.
    """
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async def _fresh_session():
        async with maker() as session:
            yield session

    app.dependency_overrides[get_db] = _fresh_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="https://test/api") as ac:
        yield ac
    app.dependency_overrides.clear()


class TestQuizSessionsRace:
    async def test_two_sessions_award_xp_once(
        self, parallel_client, db, approved_user, book_with_quiz
    ):
        """Тест, открытый в двух вкладках, не должен давать XP дважды."""
        rows = (await db.scalars(
            select(QuizQuestion).where(QuizQuestion.book_id == book_with_quiz.id)
        )).all()
        correct = {q.id: q.correct_index for q in rows}

        # Две независимые сессии — два токена, две строки в quiz_sessions
        opened = []
        for _ in range(2):
            r = await parallel_client.get(
                f"/books/{book_with_quiz.id}/quiz",
                headers=auth_headers(approved_user),
            )
            assert r.status_code == 200, r.text
            opened.append(
                (r.headers["X-Quiz-Session"], [correct[q["id"]] for q in r.json()])
            )
        assert opened[0][0] != opened[1][0], "сессии должны быть разными"

        xp_before = approved_user.xp

        async def submit(token, answers):
            return await parallel_client.post(
                f"/books/{book_with_quiz.id}/quiz/submit",
                headers=auth_headers(approved_user),
                json={"answers": answers, "session_token": token},
            )

        results = await asyncio.gather(
            *[submit(t, a) for t, a in opened], return_exceptions=True
        )
        ok = [r for r in results
              if not isinstance(r, Exception) and r.status_code == 201]
        assert len(ok) == 2, "обе сессии валидны — обе должны быть приняты"

        await db.refresh(approved_user)
        gained = approved_user.xp - xp_before
        assert gained in (15, 30), f"XP начислен {gained} — засчитано дважды"

        attempts = await db.scalar(
            select(func.count(QuizAttempt.id)).where(
                QuizAttempt.user_id == approved_user.id
            )
        )
        assert attempts == 2, "попытки пишутся обе, дублируется только XP"


class TestExamSessionsRace:
    async def test_two_exams_one_certificate(
        self, parallel_client, db, approved_user
    ):
        """Два экзамена по одной теме — один сертификат, а не два."""
        approved_user.full_name = "Иванов Иван"
        for token in ("race-a", "race-b"):
            db.add(ExamSession(
                token=token,
                user_id=approved_user.id,
                category="Криптография",
                correct=[0] * 50,
                total=50,
                expires_at=datetime.now(UTC) + timedelta(hours=2),
            ))
        await db.commit()

        async def submit(token):
            return await parallel_client.post(
                "/certificates/exam/submit",
                headers=auth_headers(approved_user),
                json={"exam_token": token, "answers": [0] * 50},
            )

        results = await asyncio.gather(
            submit("race-a"), submit("race-b"), return_exceptions=True
        )
        ok = [r for r in results
              if not isinstance(r, Exception) and r.status_code == 200]
        assert len(ok) >= 1, f"ни один экзамен не принят: {results}"

        issued = await db.scalar(
            select(func.count(Certificate.id)).where(
                Certificate.user_id == approved_user.id,
                Certificate.category == "Криптография",
            )
        )
        assert issued == 1, f"выдано сертификатов: {issued}"


class TestProgressAcrossBooksRace:
    async def test_two_books_both_counted(
        self, parallel_client, db, approved_user
    ):
        """Чтение двух книг сразу — обе прибавки должны попасть в счётчик."""
        from app.models.book import Book
        from app.models.library import DailyPagesRead

        books = []
        for title in ("Гонка A", "Гонка B"):
            b = Book(title=title, author="А", description="", total_pages=500)
            db.add(b)
            books.append(b)
        await db.commit()
        for b in books:
            await db.refresh(b)

        # Открываем обе: дальше прибавка считается от страницы 1
        for b in books:
            r = await parallel_client.put(
                f"/books/{b.id}/progress",
                headers=auth_headers(approved_user),
                json={"current_page": 1},
            )
            assert r.status_code in (200, 201), r.text

        # Шаг в пределах потолка засчитываемого продвижения: иначе прибавка
        # обрежется, и тест перестанет измерять то, ради чего написан.
        step = reading_progress.MAX_PAGES_CREDITED_PER_UPDATE

        async def bump(book_id):
            return await parallel_client.put(
                f"/books/{book_id}/progress",
                headers=auth_headers(approved_user),
                json={"current_page": 1 + step},
            )

        await asyncio.gather(*[bump(b.id) for b in books], return_exceptions=True)

        pages = await db.scalar(
            select(DailyPagesRead.pages).where(
                DailyPagesRead.user_id == approved_user.id
            )
        )
        expected = step * len(books)
        # Прежняя реализация теряла одну прибавку: обе транзакции читали одно
        # значение и писали своё.
        assert pages == expected, (
            f"в счётчике {pages} страниц вместо {expected} — прибавка потеряна"
        )
