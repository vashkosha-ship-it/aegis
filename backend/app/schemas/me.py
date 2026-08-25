"""Схемы личного кабинета: пароль, email, удаление аккаунта, публичный профиль."""
from pydantic import BaseModel, EmailStr, Field


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


class EmailChangeRequest(BaseModel):
    new_email: EmailStr
    password: str = Field(..., min_length=1)


class EmailChangeConfirm(BaseModel):
    code: str = Field(..., min_length=4, max_length=16)


class AccountDeleteRequest(BaseModel):
    password: str = Field(..., min_length=1)
    confirm: str = Field(..., description="Должно быть 'УДАЛИТЬ' для подтверждения")


class PublicProfile(BaseModel):
    """Профиль другого пользователя. Email маскируется или скрывается совсем."""

    id: int
    username: str
    full_name: str | None
    department: str | None
    cyber_level: str | None
    xp: int
    streak_count: int
    has_avatar: bool
    email_masked: str | None = None  # замаскированный email (или None если скрыт)
    books_count: int = 0
    quizzes_passed: int = 0


class LeaderboardEntry(BaseModel):
    """Строка рейтинга.

    Пользователи, скрывшие профиль, участвуют в рейтинге анонимно: позиция и
    опыт видны, имя — нет. Так настройка приватности соблюдается, но человек
    не выпадает из общей картины.
    """

    place: int
    username: str
    full_name: str | None
    xp: int
    streak_count: int
    # Профиль скрыт настройками приватности — имя не показываем
    is_hidden: bool = False
    # Это сам запрашивающий: его строку подсвечивает интерфейс
    is_self: bool = False
