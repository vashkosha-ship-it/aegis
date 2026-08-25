"""Общие фикстуры для интеграционных тестов.

Тесты идут по HTTP через ASGI-транспорт и работают с настоящей БД, а не с
моками: почти все проверки здесь — про безопасность, а её ломают как раз
детали (типы колонок, транзакции, зависимости FastAPI), которые мок скрывает.

Тесты идут в отдельной СХЕМЕ (`aegis_test`) той же базы. Отдельную базу
создать нельзя: у пользователя приложения нет права CREATEDB. Схема даёт ту же
изоляцию — боевые таблицы лежат в `public` и тестами не затрагиваются: схема
целиком удаляется до и после прогона.
"""
from __future__ import annotations

import os
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.security import hash_password
from app.db.session import Base, get_db
from app.main import app
from app.models.book import Book
from app.models.quiz import QuizQuestion
from app.models.user import User, UserRole


TEST_SCHEMA = "aegis_test"


def _test_db_url() -> str:
    explicit = os.getenv("TEST_DATABASE_URL")
    if explicit:
        return explicit
    from app.core.config import settings

    return settings.DATABASE_URL


def _sync_db_url() -> str:
    """Синхронный URL для создания схемы.

    Схему готовим обычным (не async) движком: у pytest-asyncio на каждый тест
    свой event loop, и session-scoped async-движок к нему «не привязывается»
    («attached to a different loop»). Синхронный движок от этого свободен.
    """
    from app.core.config import settings

    sync = getattr(settings, "DATABASE_URL_SYNC", None)
    if sync:
        return sync
    return _test_db_url().replace("postgresql+asyncpg", "postgresql+psycopg2")


@pytest.fixture(scope="session", autouse=True)
def db_schema():
    """Один раз за прогон: создать тестовую схему со всеми таблицами."""
    eng = create_engine(_sync_db_url())
    with eng.begin() as conn:
        conn.execute(text(f"DROP SCHEMA IF EXISTS {TEST_SCHEMA} CASCADE"))
        conn.execute(text(f"CREATE SCHEMA {TEST_SCHEMA}"))
        conn.execute(text(f"SET search_path TO {TEST_SCHEMA}"))
        Base.metadata.create_all(conn)
    yield
    with eng.begin() as conn:
        conn.execute(text(f"DROP SCHEMA IF EXISTS {TEST_SCHEMA} CASCADE"))
    eng.dispose()


@pytest_asyncio.fixture
async def engine(db_schema):
    """Свой async-движок на каждый тест — чтобы жить в текущем event loop.

    NullPool: соединения не переиспользуются между тестами и не утекают в
    чужой цикл событий.
    """
    eng = create_async_engine(
        _test_db_url(),
        echo=False,
        poolclass=NullPool,
        connect_args={"server_settings": {"search_path": TEST_SCHEMA}},
    )
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def db(engine) -> AsyncGenerator[AsyncSession, None]:
    """Чистая сессия на каждый тест.

    Таблицы чистим ДО теста, а не после: если тест упал, мусор не помешает
    следующему, и не приходится трогать БД во время teardown.
    """
    async with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())

    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        yield session
        await session.close()


@pytest_asyncio.fixture
async def client(db) -> AsyncGenerator[AsyncClient, None]:
    """HTTP-клиент поверх приложения с подменённой зависимостью БД."""

    async def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test/api") as ac:
        yield ac
    app.dependency_overrides.clear()


def _clear_limiters() -> None:
    """Сбросить счётчики и в памяти, и в Redis.

    В CI Redis поднят, поэтому чистить только память недостаточно: счётчики
    переживут тест и следующий получит чужой лимит.
    """
    from app.core import rate_limit
    from app.core.rate_limit import (
        email_send_limiter,
        login_limiter,
        otp_attempt_limiter,
    )

    for limiter in (email_send_limiter, otp_attempt_limiter, login_limiter):
        limiter._store.clear()

    if rate_limit._redis is not None:
        try:
            for key in rate_limit._redis.scan_iter("rl:*"):
                rate_limit._redis.delete(key)
        except Exception:  # noqa: BLE001 — Redis недоступен, хватит и памяти
            pass


@pytest.fixture(autouse=True)
def reset_rate_limiters():
    """Лимитеры общие на процесс — обнуляем, чтобы тесты не влияли друг на друга."""
    _clear_limiters()
    yield
    _clear_limiters()


# --------------------------------------------------------------------------
# Фабрики пользователей
# --------------------------------------------------------------------------


async def make_user(
    db: AsyncSession,
    *,
    username: str = "reader",
    password: str = "TestPass123!",
    email: str | None = None,
    is_verified: bool = True,
    is_approved: bool = True,
    is_active: bool = True,
    role: UserRole = UserRole.READER,
    full_name: str | None = "Тест Тестович",
) -> User:
    user = User(
        username=username,
        email=email or f"{username}@example.com",
        password_hash=hash_password(password),
        full_name=full_name,
        role=role,
        is_verified=is_verified,
        is_approved=is_approved,
        is_active=is_active,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def auth_headers(user: User) -> dict[str, str]:
    from app.core.security import create_access_token

    token = create_access_token(
        user.id, user.role.value, token_version=user.token_version
    )
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def approved_user(db) -> User:
    return await make_user(db, username="approved")


@pytest_asyncio.fixture
async def pending_user(db) -> User:
    """Email подтверждён, но админ ещё не одобрил доступ."""
    return await make_user(db, username="pending", is_approved=False)


@pytest_asyncio.fixture
async def admin_user(db) -> User:
    return await make_user(db, username="admin", role=UserRole.ADMIN)


# --------------------------------------------------------------------------
# Книга с тестом
# --------------------------------------------------------------------------


@pytest_asyncio.fixture
async def book_with_quiz(db) -> Book:
    """Книга и 20 вопросов — больше QUIZ_SERVE_COUNT+3, чтобы не дёргалась AI-генерация."""
    book = Book(title="Тестовая книга", author="Автор", description="")
    db.add(book)
    await db.commit()
    await db.refresh(book)

    for i in range(20):
        db.add(QuizQuestion(
            book_id=book.id,
            question=f"Вопрос {i}",
            options=["A", "B", "C", "D"],
            correct_index=i % 4,
            source="static",
        ))
    await db.commit()
    return book


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def in_minutes(minutes: int) -> datetime:
    return utcnow() + timedelta(minutes=minutes)
