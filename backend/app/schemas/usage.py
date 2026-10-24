"""Статистика использования: что присылает браузер и что видит админ."""
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


class UsageReport(BaseModel):
    events: list[UsageEvent] = Field(default_factory=list, max_length=100)
    prefs: UiPrefs | None = None


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
