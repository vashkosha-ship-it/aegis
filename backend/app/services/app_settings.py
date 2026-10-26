"""Чтение и запись настроек сервиса (таблица app_settings)."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting

# ИИ-ассистент для читателей: чат и «Объяснить» в читалке. Это единственное
# место, где в DeepSeek уходит то, что пишет сам человек, поэтому
# администратор может его выключить. Фоновые задачи администратора
# (описания книг, тесты по тексту книги) от настройки не зависят: в них
# уходит текст книг, а не данные пользователей.
ASSISTANT_ENABLED = "assistant_enabled"

DEFAULTS: dict[str, object] = {
    ASSISTANT_ENABLED: True,
}


async def get_setting(db: AsyncSession, key: str) -> object:
    row = await db.scalar(select(AppSetting).where(AppSetting.key == key))
    if row is None:
        return DEFAULTS.get(key)
    return row.value


async def set_setting(db: AsyncSession, key: str, value: object) -> None:
    """Записать значение. Коммит — на стороне вызывающего."""
    row = await db.scalar(select(AppSetting).where(AppSetting.key == key))
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value


async def assistant_enabled(db: AsyncSession) -> bool:
    return bool(await get_setting(db, ASSISTANT_ENABLED))
