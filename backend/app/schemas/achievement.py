"""Pydantic schemas for achievements."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AchievementPublic(BaseModel):
    """Каталожная запись — описание самого достижения."""
    id: int
    code: str
    name: str
    description: str
    icon: str
    tier: str

    model_config = ConfigDict(from_attributes=True)


class UserAchievementPublic(BaseModel):
    """Достижение, выданное пользователю — каталожная инфа + дата вручения."""
    code: str
    name: str
    description: str
    icon: str
    tier: str
    awarded_at: datetime
