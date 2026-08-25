"""Тест автоочистки истёкших сессий.

Без неё таблицы растут бесконечно: записи создаются на каждый вход и каждую
попытку теста, но никогда не удаляются.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from app.models.exam_session import ExamSession
from app.models.refresh_token import RefreshToken
from app.worker import KEEP_EXPIRED_DAYS, cleanup_expired_sessions
from tests.conftest import make_user


class TestCleanup:
    async def test_removes_long_expired(self, db, monkeypatch):
        user = await make_user(db, username="cleanup1")

        long_ago = datetime.now(UTC) - timedelta(days=KEEP_EXPIRED_DAYS + 5)
        db.add(ExamSession(
            token="old-exam", user_id=user.id, category="Тест",
            correct=[0], total=1, expires_at=long_ago,
        ))
        db.add(RefreshToken(
            jti="old-token", user_id=user.id, expires_at=long_ago,
        ))
        await db.commit()

        # Задача открывает свою сессию БД — подменяем на тестовую
        import app.worker as worker

        class _Ctx:
            def __init__(self, session):
                self._s = session

            async def __aenter__(self):
                return self._s

            async def __aexit__(self, *a):
                return False

        monkeypatch.setattr(worker, "AsyncSessionLocal", lambda: _Ctx(db))

        removed = await cleanup_expired_sessions({})

        assert removed["exam_sessions"] == 1
        assert removed["refresh_tokens"] == 1
        assert await db.scalar(select(func.count(ExamSession.id))) == 0
        assert await db.scalar(select(func.count(RefreshToken.id))) == 0

    async def test_keeps_recent_and_active(self, db, monkeypatch):
        """Свежие записи и недавно истёкшие остаются: по ним разбирают инциденты."""
        user = await make_user(db, username="cleanup2")

        active = datetime.now(UTC) + timedelta(days=7)
        recently_expired = datetime.now(UTC) - timedelta(days=1)

        db.add(RefreshToken(jti="active", user_id=user.id, expires_at=active))
        db.add(RefreshToken(jti="recent", user_id=user.id, expires_at=recently_expired))
        await db.commit()

        import app.worker as worker

        class _Ctx:
            def __init__(self, session):
                self._s = session

            async def __aenter__(self):
                return self._s

            async def __aexit__(self, *a):
                return False

        monkeypatch.setattr(worker, "AsyncSessionLocal", lambda: _Ctx(db))

        removed = await cleanup_expired_sessions({})

        assert removed["refresh_tokens"] == 0
        assert await db.scalar(select(func.count(RefreshToken.id))) == 2
