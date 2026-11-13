"""Статистика использования: что присылает браузер и что видит админ."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# Имена экранов и действий — идентификаторы из кода (navigateTo, data-onclick),
# не произвольный текст: так в счётчики не попадёт ничего личного.
USAGE_NAME_PATTERN = r"^[A-Za-z][A-Za-z0-9_:.-]{0,63}$"


class UsageEvent(BaseModel):
    kind: Literal["screen", "action"]
    name: str = Field(pattern=USAGE_NAME_PATTERN)
    count: int = Field(default=1, ge=1, le=100)


class UiPrefs(BaseModel):
    theme: Literal["dark", "light"] | None = None
    accent: Literal["orange", "blue", "green", "violet"] | None = None


class ActivityEvent(BaseModel):
    """Одно действие для журнала пользователя (админка → «Активность»).

    Имя — идентификатор из кода, как и у счётчиков: введённый человеком
    текст сюда не попадает.
    """

    kind: Literal["session", "screen", "action", "book"]
    name: str = Field(pattern=USAGE_NAME_PATTERN)
    book_id: int | None = Field(default=None, ge=1)
    # Время на устройстве, мс с 1970 г. Сервер ограничивает его разумными
    # рамками — неверные часы на телефоне не уводят событие в другой год.
    at: int | None = Field(default=None, ge=0)


class UsageReport(BaseModel):
    events: list[UsageEvent] = Field(default_factory=list, max_length=100)
    prefs: UiPrefs | None = None
    session_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{8,32}$")
    # «app» — установленное приложение (APK, ярлык на экране), «browser» — сайт.
    display: Literal["app", "browser"] | None = None
    activity: list[ActivityEvent] = Field(default_factory=list, max_length=300)


class UsageItem(BaseModel):
    name: str
    count: int


class UsageStats(BaseModel):
    days: int
    screens: list[UsageItem]
    actions: list[UsageItem]
    accents: list[UsageItem]
    themes: list[UsageItem]
    users_with_prefs: int


class ActivityUserSummary(BaseModel):
    user_id: int
    username: str
    last_seen: datetime
    sessions: int
    events: int
    books_opened: int
    device: str | None = None


class ActivityTimelineEvent(BaseModel):
    at: datetime
    kind: str
    name: str
    book_id: int | None = None
    book_title: str | None = None


class ActivitySession(BaseModel):
    session_id: str
    started_at: datetime
    ended_at: datetime
    device: str | None = None
    events: list[ActivityTimelineEvent]


class ActivityUserDetail(BaseModel):
    user_id: int
    username: str
    days: int
    sessions: list[ActivitySession]
    truncated: bool = False
