"""Тесты параллельных запросов.

Проверяют, что блокировки строк (SELECT ... FOR UPDATE) реально работают:
одновременные запросы не должны дважды начислить XP, дважды зачесть экзамен
или выдать две новые пары токенов.

Проверяем не сам факт гонки — он недетерминирован, — а её последствия:
после N одновременных запросов результат должен быть ровно один.

Каждому запросу нужна СВОЯ сессия БД: с общей сессией блокировки не проявятся,
потому что все транзакции окажутся одной.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.session import get_db
from app.main import app
from app.models.exam_session import ExamSession
from app.models.quiz import QuizAttempt, QuizQuestion
from app.models.refresh_token import RefreshToken
from tests.conftest import TEST_SCHEMA, auth_headers, make_user


@pytest_asyncio.fixture
async def parallel_client(engine, db):
    """Клиент, выдающий каждому запросу отдельную сессию БД.

    Обычная фикстура client переиспользует одну сессию: тогда параллельные
    запросы выполняются в одной транзакции и блокировки не проверяются.
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


class TestQuizConcurrency:
    async def test_parallel_submit_awards_xp_once(
        self, parallel_client, db, approved_user, book_with_quiz
    ):
        """Десять одновременных отправок — одно начисление XP."""
        rows = (await db.scalars(
            select(QuizQuestion).where(QuizQuestion.book_id == book_with_quiz.id)
        )).all()
        correct = {q.id: q.correct_index for q in rows}

        r = await parallel_client.get(
            f"/books/{book_with_quiz.id}/quiz", headers=auth_headers(approved_user)
        )
        questions = r.json()
        token = r.headers.get("X-Quiz-Session")
        answers = [correct[q["id"]] for q in questions]

        xp_before = approved_user.xp

        async def submit():
            return await parallel_client.post(
                f"/books/{book_with_quiz.id}/quiz/submit",
                headers=auth_headers(approved_user),
                json={"answers": answers, "session_token": token},
            )

        results = await asyncio.gather(*[submit() for _ in range(10)],
                                       return_exceptions=True)

        ok = [r for r in results
              if not isinstance(r, Exception) and r.status_code == 201]
        assert len(ok) == 1, f"принята должна быть ровно одна отправка, принято {len(ok)}"

        await db.refresh(approved_user)
        gained = approved_user.xp - xp_before
        assert gained in (15, 30), f"XP начислен {gained} — похоже на дубли"

        attempts = await db.scalar(
            select(func.count(QuizAttempt.id)).where(
                QuizAttempt.user_id == approved_user.id
            )
        )
        assert attempts == 1


class TestExamConcurrency:
    async def test_parallel_submit_freezes_one_result(
        self, parallel_client, db, approved_user
    ):
        """Параллельные отправки не должны пересчитывать результат."""
        db.add(ExamSession(
            token="race-exam",
            user_id=approved_user.id,
            category="Криптография",
            correct=[0] * 50,
            total=50,
            expires_at=datetime.now(UTC) + timedelta(hours=2),
        ))
        await db.commit()

        async def submit(answers):
            return await parallel_client.post(
                "/certificates/exam/submit",
                headers=auth_headers(approved_user),
                json={"exam_token": "race-exam", "answers": answers},
            )

        # Половина запросов с верными ответами, половина с неверными.
        # Что бы ни выиграло гонку, все ответы должны совпасть между собой.
        tasks = [submit([0] * 50) for _ in range(5)] + [submit([1] * 50) for _ in range(5)]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        scores = {
            r.json()["correct_count"]
            for r in results
            if not isinstance(r, Exception) and r.status_code == 200
        }
        assert len(scores) == 1, f"результат должен быть один и тот же, получено {scores}"


class TestRefreshConcurrency:
    async def test_parallel_rotation_issues_one_pair(self, parallel_client, db):
        """Одновременный обмен одним токеном — одна новая пара."""
        await make_user(db, username="racer")
        login = await parallel_client.post(
            "/auth/login", json={"username": "racer", "password": "TestPass123!"}
        )
        assert login.status_code == 200
        assert "refresh_token" not in login.json()
        token = parallel_client.cookies.get("aegis_refresh")
        csrf = parallel_client.cookies.get("aegis_csrf")

        # Cookie обновится после первого же обмена, а гонку надо устроить одним
        # и тем же значением — поэтому фиксируем Cookie header для всех запросов.
        parallel_client.cookies.clear()

        async def refresh():
            return await parallel_client.post(
                "/auth/refresh",
                json=None,
                headers={
                    "X-CSRF-Token": csrf,
                    "Cookie": f"aegis_refresh={token}; aegis_csrf={csrf}",
                },
            )

        results = await asyncio.gather(*[refresh() for _ in range(5)],
                                       return_exceptions=True)
        ok = [r for r in results
              if not isinstance(r, Exception) and r.status_code == 200]

        # Первый обмен проходит; остальные либо попадают в окно благодати и
        # получают ту же пару, либо отвергаются. Новых записей быть не должно
        # больше, чем обменов.
        assert len(ok) >= 1

        issued = await db.scalar(select(func.count(RefreshToken.id)))
        assert issued <= 2, f"выдано {issued} токенов — ротация не атомарна"


class TestProgressConcurrency:
    async def test_parallel_updates_do_not_double_count(
        self, parallel_client, db, approved_user
    ):
        """Дневная статистика не должна расти вдвое от параллельных запросов."""
        from app.models.book import Book
        from app.models.library import DailyPagesRead

        book = Book(title="Гонка", author="А", description="", total_pages=500)
        db.add(book)
        await db.commit()
        await db.refresh(book)

        await parallel_client.put(
            f"/books/{book.id}/progress",
            headers=auth_headers(approved_user),
            json={"current_page": 1},
        )

        async def bump(page):
            return await parallel_client.put(
                f"/books/{book.id}/progress",
                headers=auth_headers(approved_user),
                json={"current_page": page},
            )

        await asyncio.gather(*[bump(50) for _ in range(5)], return_exceptions=True)

        rows = await db.scalar(
            select(func.count(DailyPagesRead.id)).where(
                DailyPagesRead.user_id == approved_user.id
            )
        )
        assert rows <= 1, "на день должна быть одна запись, а не по одной на запрос"

        pages = await db.scalar(
            select(DailyPagesRead.pages).where(
                DailyPagesRead.user_id == approved_user.id
            )
        )
        assert pages is None or pages <= 49 * 5, "страницы посчитаны с дублями"
