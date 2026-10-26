"""Pydantic schemas for authentication endpoints."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.legal import LEGAL_VERSION
from app.core.security import validate_new_password
from app.models.user import UserRole


class UserRegister(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(min_length=8, max_length=128)
    email: EmailStr  # обязателен — на него приходит код подтверждения
    full_name: str | None = Field(default=None, max_length=128)
    department: str | None = Field(default=None, max_length=64)
    # Две отдельные отметки: принятие Соглашения и Политики и согласие на
    # обработку персональных данных (152-ФЗ требует, чтобы согласие на
    # обработку ПДн было отдельным, а не частью другого документа).
    accept_terms: bool = False
    pd_consent: bool = False

    @field_validator("password")
    @classmethod
    def _password_policy(cls, value: str) -> str:
        return validate_new_password(value)


class LegalConsentRequest(BaseModel):
    """Принять текущую редакцию документов (для зарегистрированных раньше)."""
    accept_terms: Literal[True]
    pd_consent: Literal[True]


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=16)


class ResendCodeRequest(BaseModel):
    email: EmailStr


class RegisterResponse(BaseModel):
    detail: str
    email: str
    verification_required: bool = True


class UserLogin(BaseModel):
    username: str
    password: str


class AccessTokenOnly(BaseModel):
    """Единственная форма ответа с токенами.

    Refresh-токен в теле не возвращается никогда — он живёт только в
    httpOnly-cookie. Раньше рядом стояла вторая схема «для мобильного
    клиента»: она отдавала пару целиком, если запрос приходил с заголовком
    X-Client-Type: mobile. Заголовок может выставить кто угодно, в том числе
    скрипт на странице, — то есть это была не поддержка мобильных, а способ
    попросить refresh-токен в JSON в обход всей защиты.

    Отдельного мобильного приложения нет: установка идёт через PWA, а это тот
    же браузер с обычным cookie-хранилищем, которому токен в теле не нужен.
    """
    access_token: str
    token_type: str = "bearer"


class UserPublic(BaseModel):
    id: int
    username: str
    email: str | None
    role: UserRole
    full_name: str | None
    avatar_url: str | None
    avatar_preset: str | None = None
    has_avatar: bool = False
    xp: int
    streak_count: int
    cyber_level: str | None = None
    topic_scores: dict | None = None
    level_assessed_at: datetime | None = None
    department: str | None = None
    profile_visibility: str = "public"
    is_approved: bool = True
    ui_theme: str | None = None
    ui_accent: str | None = None
    appearance_onboarded: bool = True
    # Человек не принимал текущую редакцию документов — интерфейс покажет окно
    # согласия. По умолчанию False: старый клиент без поля ничего не ломает.
    legal_consent_required: bool = False

    @classmethod
    def model_validate(cls, obj, *, strict=None, from_attributes=None, context=None):
        data = super().model_validate(
            obj, strict=strict, from_attributes=from_attributes, context=context
        )
        if hasattr(obj, 'avatar_url'):
            data.has_avatar = bool(obj.avatar_url or getattr(obj, 'avatar_preset', None))
        if hasattr(obj, 'legal_version'):
            data.legal_consent_required = (
                obj.legal_version != LEGAL_VERSION
                or obj.terms_accepted_at is None
                or obj.pd_consent_at is None
            )
        return data

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    """Поля, которые юзер может менять у себя сам.
    Username и email менять не разрешаем — это отдельные большие истории
    (уникальность, верификация email и т.д.). Только display name."""
    full_name: str | None = Field(default=None, max_length=128)
    department: str | None = Field(default=None, max_length=64)
    profile_visibility: Literal["public", "private"] | None = None
    # Оформление аккаунта: выбирается на экране первого входа и в настройках,
    # применяется на всех устройствах пользователя.
    ui_theme: Literal["dark", "light"] | None = None
    ui_accent: Literal["orange", "blue", "green", "violet"] | None = None
    appearance_onboarded: Literal[True] | None = None
    # Аватар из набора: a01…a15. Убрать аватар (показывать букву) —
    # DELETE /me/avatar.
    avatar_preset: Literal[
        "a01", "a02", "a03", "a04", "a05", "a06", "a07", "a08",
        "a09", "a10", "a11", "a12", "a13", "a14", "a15",
    ] | None = None

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Сброс пароля по коду из письма."""

    email: EmailStr
    code: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _password_policy(cls, value: str) -> str:
        return validate_new_password(value)
