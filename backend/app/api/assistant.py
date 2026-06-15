"""AI assistant endpoint."""
import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.deps import get_current_user
from app.core.rate_limit import assistant_limiter
from app.models.user import User
from app.services.deepseek_client import (
    DeepSeekError,
    chat_completion,
    chat_completion_stream,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/me/assistant", tags=["assistant"])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=4000)


class BookContext(BaseModel):
    """Контекст книги/страницы, которую сейчас читает пользователь (#8)."""
    title: str | None = Field(None, max_length=300)
    author: str | None = Field(None, max_length=300)
    page: int | None = None
    total_pages: int | None = None
    # Текст текущей страницы/главы (обрезается на клиенте и здесь)
    page_text: str | None = Field(None, max_length=6000)


class LibraryBook(BaseModel):
    title: str = Field(..., max_length=300)
    author: str | None = Field(None, max_length=300)
    categories: list[str] = Field(default_factory=list)
    status: str | None = Field(None, max_length=40)  # reading/completed/planned/...


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=20)
    # Доп. контекст — опционально, чтобы старый клиент тоже работал
    book_context: BookContext | None = None
    library: list[LibraryBook] | None = Field(None, max_length=100)
    department: str | None = Field(None, max_length=120)
    level: str | None = Field(None, max_length=60)


class ChatResponse(BaseModel):
    reply: str


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    current: User = Depends(get_current_user),
) -> ChatResponse:
    """Отправить сообщение AI-ассистенту."""
    # Rate limit (20 запросов/час на юзера)
    allowed, wait = assistant_limiter.check_allowed(current.id)
    if not allowed:
        minutes = max(wait // 60, 1)
        raise HTTPException(
            status_code=429,
            detail=f"Слишком много запросов. Попробуйте через {minutes} мин.",
        )

    # Проверка: последнее сообщение должно быть от user
    if payload.messages[-1].role != "user":
        raise HTTPException(status_code=400, detail="Last message must be from user")

    # Конвертация в формат DeepSeek
    deepseek_messages = [{"role": m.role, "content": m.content} for m in payload.messages]

    # Собираем дополнительный контекст в системный промпт (#8, #9, #10)
    system_prompt = _build_system_prompt(payload)

    try:
        reply = await chat_completion(deepseek_messages, system_prompt=system_prompt)
    except DeepSeekError as e:
        logger.error("DeepSeek error for user %s: %s", current.id, e)
        raise HTTPException(status_code=502, detail=f"Не удалось получить ответ от AI: {e}") from None

    # Записываем что запрос выполнен (только при успехе)
    assistant_limiter.record(current.id)
    logger.info("Assistant request from user %s", current.id)
    return ChatResponse(reply=reply)


@router.post("/chat/stream")
async def chat_stream(
    payload: ChatRequest,
    current: User = Depends(get_current_user),
) -> StreamingResponse:
    """Стриминг ответа AI по кускам (Server-Sent Events).

    Фронт читает поток и печатает ответ «по буквам». Формат строк:
      data: {"delta": "часть текста"}\\n\\n
      data: {"done": true}\\n\\n
      data: {"error": "сообщение"}\\n\\n
    """
    import json as _json

    allowed, wait = assistant_limiter.check_allowed(current.id)
    if not allowed:
        minutes = max(wait // 60, 1)
        raise HTTPException(
            status_code=429,
            detail=f"Слишком много запросов. Попробуйте через {minutes} мин.",
        )

    if payload.messages[-1].role != "user":
        raise HTTPException(status_code=400, detail="Last message must be from user")

    deepseek_messages = [{"role": m.role, "content": m.content} for m in payload.messages]
    system_prompt = _build_system_prompt(payload)

    async def event_gen():
        got_any = False
        try:
            async for piece in chat_completion_stream(deepseek_messages, system_prompt=system_prompt):
                got_any = True
                yield f"data: {_json.dumps({'delta': piece}, ensure_ascii=False)}\n\n"
            # списываем лимит только при успешной генерации
            if got_any:
                assistant_limiter.record(current.id)
            yield f"data: {_json.dumps({'done': True})}\n\n"
        except DeepSeekError as e:
            logger.error("DeepSeek stream error for user %s: %s", current.id, e)
            yield f"data: {_json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # отключаем буферизацию nginx
        },
    )


def _build_system_prompt(payload: ChatRequest) -> str | None:
    """Дополняем базовый системный промпт контекстом, если клиент его прислал."""
    from app.services.deepseek_client import DEFAULT_SYSTEM_PROMPT

    extra: list[str] = []

    if payload.department:
        extra.append(f"Подразделение пользователя: {payload.department}.")
    if payload.level:
        extra.append(f"Уровень знаний пользователя: {payload.level}.")

    bc = payload.book_context
    if bc and (bc.title or bc.page_text):
        head = "Пользователь сейчас читает книгу"
        if bc.title:
            head += f" «{bc.title}»"
        if bc.author:
            head += f" ({bc.author})"
        if bc.page and bc.total_pages:
            head += f", страница {bc.page} из {bc.total_pages}"
        extra.append(head + ".")
        if bc.page_text:
            extra.append(
                "Текст текущей страницы/главы (используй его, если вопрос про эту страницу):\n"
                f"\"\"\"\n{bc.page_text.strip()}\n\"\"\""
            )

    if payload.library:
        lines = []
        for b in payload.library[:60]:
            cat = f" [{', '.join(b.categories)}]" if b.categories else ""
            st = f" — {b.status}" if b.status else ""
            author = f" — {b.author}" if b.author else ""
            lines.append(f"• {b.title}{author}{cat}{st}")
        extra.append(
            "Библиотека пользователя (рекомендуй книги ТОЛЬКО из этого списка, "
            "если просит совет что почитать; указывай точные названия):\n"
            + "\n".join(lines)
        )

    if not extra:
        return None  # старое поведение
    return DEFAULT_SYSTEM_PROMPT + "\n\n" + "\n\n".join(extra)