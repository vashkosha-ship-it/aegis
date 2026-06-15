"""Pydantic schemas for authentication endpoints."""
from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole
from datetime import datetime


class UserRegister(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(min_length=8, max_length=128)
    email: EmailStr | None = None
    full_name: str | None = Field(default=None, max_length=128)
    department: str | None = Field(default=None, max_length=64)


class UserLogin(BaseModel):
    username: str
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserPublic(BaseModel):
    id: int
    username: str
    email: str | None
    role: UserRole
    full_name: str | None
    avatar_url: str | None
    has_avatar: bool = False
    xp: int
    streak_count: int
    cyber_level: str | None = None
    topic_scores: dict | None = None
    level_assessed_at: datetime | None = None
    department: str | None = None
    profile_visibility: str = "public"

    @classmethod
    def model_validate(cls, obj, *, strict=None, from_attributes=None, context=None):
        data = super().model_validate(
            obj, strict=strict, from_attributes=from_attributes, context=context
        )
        if hasattr(obj, 'avatar_url'):
            data.has_avatar = bool(obj.avatar_url)
        return data

    class Config:
        from_attributes = True

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    """Поля, которые юзер может менять у себя сам.
    Username и email менять не разрешаем — это отдельные большие истории
    (уникальность, верификация email и т.д.). Только display name."""
    full_name: str | None = Field(default=None, max_length=128)
    department: str | None = Field(default=None, max_length=64)
    profile_visibility: str | None = None
