"""Настройки сервиса: публичное чтение и изменение администратором."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_user
from app.core.config import settings as config
from app.db.session import get_db
from app.models.user import User
from app.services import ai_provider, app_settings
from app.services.admin_audit import log_admin_action

router = APIRouter(tags=["settings"])


class PublicSettings(BaseModel):
    assistant_enabled: bool
    # Какой ИИ отвечает: deepseek или gigachat. Нужен интерфейсу, чтобы
    # честно назвать сервис, куда уходят сообщения ассистенту.
    ai_provider: str
    # Лимиты на файл книги — чтобы админка проверяла размер до загрузки
    # по тем же числам, что и сервер.
    max_pdf_size_mb: int
    max_epub_size_mb: int


class SettingsUpdate(BaseModel):
    assistant_enabled: bool | None = None
    ai_provider: Literal["deepseek", "gigachat"] | None = None


class AiProviderOption(BaseModel):
    id: str
    label: str
    model: str
    # Ключ задан в настройках сервера — переключиться можно.
    configured: bool


class AiProviderSettings(BaseModel):
    current: str
    options: list[AiProviderOption]


async def _public(db: AsyncSession) -> PublicSettings:
    return PublicSettings(
        assistant_enabled=await app_settings.assistant_enabled(db),
        ai_provider=await ai_provider.read(db),
        max_pdf_size_mb=config.MAX_PDF_SIZE_MB,
        max_epub_size_mb=config.MAX_EPUB_SIZE_MB,
    )


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
    if payload.ai_provider is not None:
        if not ai_provider.configured()[payload.ai_provider]:
            raise HTTPException(
                status_code=400,
                detail=f"{ai_provider.LABELS[payload.ai_provider]} не подключён: на сервере не задан ключ",
            )
        previous = await ai_provider.read(db)
        await app_settings.set_setting(db, app_settings.AI_PROVIDER, payload.ai_provider)
        if previous != payload.ai_provider:
            await log_admin_action(
                db,
                admin,
                "ai_provider_switch",
                request=request,
                target="settings:ai_provider",
                detail=f"ИИ: {ai_provider.LABELS[previous]} → {ai_provider.LABELS[payload.ai_provider]}",
            )
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
    if payload.ai_provider is not None:
        ai_provider.remember(payload.ai_provider)
    return await _public(db)


@router.get("/admin/settings/ai", response_model=AiProviderSettings)
async def read_ai_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> AiProviderSettings:
    """Выбранный ИИ и какие из них подключены (ключ задан на сервере)."""
    ready = ai_provider.configured()
    models = {ai_provider.DEEPSEEK: config.DEEPSEEK_MODEL, ai_provider.GIGACHAT: config.GIGACHAT_MODEL}
    return AiProviderSettings(
        current=await ai_provider.read(db),
        options=[
            AiProviderOption(id=pid, label=ai_provider.LABELS[pid], model=models[pid], configured=ready[pid])
            for pid in ai_provider.PROVIDERS
        ],
    )
