"""Схемы личного кабинета: пароль, email, удаление аккаунта, публичный профиль."""
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.security import validate_new_password


class ReencryptedAnnotation(BaseModel):
    """Заметка, перешифрованная ключом от нового пароля (на устройстве)."""

    id: int
    selected_text: str = Field(..., max_length=60000)
    note_text: str | None = Field(default=None, max_length=30000)


class EncryptedAnnotation(BaseModel):
    id: int
    selected_text: str
    note_text: str | None = None


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)
    # Заметки шифруются ключом из пароля. Чтобы они не пропали, устройство
    # перешифровывает их новым ключом и присылает вместе со сменой пароля:
    # пароль и заметки меняются одной транзакцией.
    reencrypted_annotations: list[ReencryptedAnnotation] = Field(default_factory=list, max_length=20000)

    @field_validator("new_password")
    @classmethod
    def _password_policy(cls, value: str) -> str:
        return validate_new_password(value)


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
