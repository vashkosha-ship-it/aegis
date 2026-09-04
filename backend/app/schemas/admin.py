"""Схемы админ-панели: статистика, пользователи, аналитика книг.

Вынесено из app/api/admin.py: роутер отвечает за HTTP, схемы — за контракт
данных. Так их видно из одного места и можно переиспользовать в сервисах.
"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.user import UserRole

# ---------------------------------------------------------------------------
# Дашборд и рейтинг
# ---------------------------------------------------------------------------


class DashboardStats(BaseModel):
    total_books: int
    total_users: int
    total_reviews: int
    total_quiz_attempts: int
    total_views: int
    total_downloads: int


# ---------------------------------------------------------------------------
# Пользователи
# ---------------------------------------------------------------------------


class AdminUserView(BaseModel):
    id: int
    username: str
    email: str | None
    role: UserRole
    full_name: str | None = None
    department: str | None = None
    xp: int
    streak_count: int = 0
    cyber_level: str | None = None
    is_active: bool
    created_at: str | None = None
    # Статистика
    completed_books: int = 0
    quiz_attempts: int = 0
    perfect_quizzes: int = 0
    total_pages_read: int = 0


class PendingUserView(BaseModel):
    """Подтвердил email, но ещё ждёт одобрения администратором."""

    id: int
    username: str
    email: str | None
    full_name: str | None
    department: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CreateUserRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=128)
    department: str | None = Field(default=None, max_length=64)


# ---------------------------------------------------------------------------
# Аналитика книги
# ---------------------------------------------------------------------------


class BookReaderRow(BaseModel):
    """Запись в таблице «кто читает» в детальной аналитике книги."""

    user_id: int
    username: str
    full_name: str | None
    current_page: int
    total_pages: int
    progress_pct: int
    started: bool
    last_read_at: str | None  # ISO


class MyListBreakdown(BaseModel):
    reading: int
    planned: int
    dropped: int
    completed: int
    liked: int
    total: int


class BookAnalytics(BaseModel):
    # Базовая
    book_id: int
    title: str
    author: str
    categories: list[str]
    rating: float
    views: int
    downloads: int
    reviews_count: int
    has_file: bool

    # MyList
    mylist: MyListBreakdown

    # Прогресс читателей
    readers_started: int          # сколько начали (started=true)
    readers_completed: int        # сколько с current_page == total_pages
    avg_progress_pct: int         # средний % по всем started-юзерам
    readers: list[BookReaderRow]  # детальный список

    # Тесты по книге
    quiz_attempts: int            # всего попыток
    quiz_passed: int              # прошедшие (≥60%)
    quiz_avg_percentage: int      # средний % по всем попыткам
