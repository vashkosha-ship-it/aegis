"""Настройки сервиса: публичное чтение и изменение администратором."""
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services import app_settings
from app.services.admin_audit import log_admin_action

router = APIRouter(tags=["settings"])


class PublicSettings(BaseModel):
    assistant_enabled: bool


class SettingsUpdate(BaseModel):
    assistant_enabled: bool | None = None


async def _public(db: AsyncSession) -> PublicSettings:
    return PublicSettings(assistant_enabled=await app_settings.assistant_enabled(db))


@router.get("/settings", response_model=PublicSettings)
async def read_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PublicSettings:
    """Настройки, от которых зависит интерфейс любого пользователя."""
    return await _public(db)


@router.patch("/admin/settings", response_model=PublicSettings)
async def update_settings(
    payload: SettingsUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> PublicSettings:
    """Изменить настройки сервиса. Каждое изменение пишется в журнал."""
    if payload.assistant_enabled is not None:
        await app_settings.set_setting(
            db, app_settings.ASSISTANT_ENABLED, payload.assistant_enabled
        )
        await log_admin_action(
            db,
            admin,
            "assistant_toggle",
            request=request,
            target="settings:assistant_enabled",
            detail="ИИ-ассистент включён" if payload.assistant_enabled else "ИИ-ассистент выключен",
        )
    await db.commit()
    return await _public(db)
