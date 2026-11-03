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
    # Какой ИИ отвечает пользователям: deepseek или gigachat. Нужен
    # интерфейсу, чтобы честно назвать сервис, куда уходят сообщения.
    ai_provider: str
    # Лимиты на файл книги — чтобы админка проверяла размер до загрузки
    # по тем же числам, что и сервер.
    max_pdf_size_mb: int
    max_epub_size_mb: int


ProviderId = Literal["deepseek", "gigachat"]


class SettingsUpdate(BaseModel):
    assistant_enabled: bool | None = None
    # Общение с пользователями и тесты
    ai_provider_assistant: ProviderId | None = None
    # Обработка книг: описания, карточки, темы
    ai_provider_books: ProviderId | None = None


class AiProviderOption(BaseModel):
    id: str
    label: str
    model: str
    # Ключ задан в настройках сервера — переключиться можно.
    configured: bool


class AiTaskChoice(BaseModel):
    task: str
    label: str
    # Выбрано в админке
    selected: str
    # Работает на самом деле (если выбранный не подключён — другой)
    effective: str


class AiProviderSettings(BaseModel):
    options: list[AiProviderOption]
    tasks: list[AiTaskChoice]


async def _public(db: AsyncSession) -> PublicSettings:
    return PublicSettings(
        assistant_enabled=await app_settings.assistant_enabled(db),
        ai_provider=ai_provider.effective(await ai_provider.read(db, ai_provider.ASSISTANT)),
        max_pdf_size_mb=config.MAX_PDF_SIZE_MB,
        max_epub_size_mb=config.MAX_EPUB_SIZE_MB,
    )


async def _ai_settings(db: AsyncSession) -> AiProviderSettings:
    ready = ai_provider.configured()
    models = {ai_provider.DEEPSEEK: config.DEEPSEEK_MODEL, ai_provider.GIGACHAT: config.GIGACHAT_MODEL}
    tasks = []
    for task in ai_provider.TASKS:
        selected = await ai_provider.read(db, task)
        tasks.append(AiTaskChoice(
            task=task, label=ai_provider.TASK_LABELS[task],
            selected=selected, effective=ai_provider.effective(selected),
        ))
    return AiProviderSettings(
        options=[
            AiProviderOption(id=pid, label=ai_provider.LABELS[pid], model=models[pid], configured=ready[pid])
            for pid in ai_provider.PROVIDERS
        ],
        tasks=tasks,
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
    changes = {
        ai_provider.ASSISTANT: payload.ai_provider_assistant,
        ai_provider.BOOKS: payload.ai_provider_books,
    }
    ready = ai_provider.configured()
    for task, provider in changes.items():
        if provider is None:
            continue
        if not ready[provider]:
            raise HTTPException(
                status_code=400,
                detail=f"{ai_provider.LABELS[provider]} не подключён: на сервере не задан ключ",
            )
        previous = await ai_provider.read(db, task)
        await app_settings.set_setting(db, ai_provider.SETTING_KEYS[task], provider)
        if previous != provider:
            await log_admin_action(
                db,
                admin,
                "ai_provider_switch",
                request=request,
                target=f"settings:{ai_provider.SETTING_KEYS[task]}",
                detail=(
                    f"{ai_provider.TASK_LABELS[task]}: "
                    f"{ai_provider.LABELS[previous]} → {ai_provider.LABELS[provider]}"
                ),
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
    for task, provider in changes.items():
        if provider is not None:
            ai_provider.remember(task, provider)
    return await _public(db)


@router.get("/admin/settings/ai", response_model=AiProviderSettings)
async def read_ai_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> AiProviderSettings:
    """Какой ИИ какую работу делает и какие сервисы подключены."""
    return await _ai_settings(db)
