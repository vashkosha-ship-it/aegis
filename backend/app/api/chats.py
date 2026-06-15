"""AI chat history endpoints — сохранённые диалоги (E1)."""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.chat import ChatMessage, ChatSession
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/me/chats", tags=["chats"])


# ---- Schemas ----------------------------------------------------------------
class ChatMessageIn(BaseModel):
    role: str = Field(..., pattern=r"^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=8000)


class ChatMessagePublic(BaseModel):
    id: int
    role: str
    content: str

    class Config:
        from_attributes = True


class ChatSessionBrief(BaseModel):
    id: int
    title: str
    message_count: int = 0

    class Config:
        from_attributes = True


class ChatSessionFull(BaseModel):
    id: int
    title: str
    messages: list[ChatMessagePublic] = Field(default_factory=list)

    class Config:
        from_attributes = True


class ChatSessionCreate(BaseModel):
    title: str = Field(default="Новый диалог", max_length=200)
    messages: list[ChatMessageIn] = Field(default_factory=list)


class ChatSessionRename(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


# ---- Helpers ----------------------------------------------------------------
async def _get_owned(db: AsyncSession, user: User, session_id: int) -> ChatSession:
    s = (
        await db.scalars(
            select(ChatSession)
            .options(selectinload(ChatSession.messages))
            .where(ChatSession.id == session_id, ChatSession.user_id == user.id)
        )
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Диалог не найден")
    return s


def _auto_title(messages: list[ChatMessageIn]) -> str:
    """Заголовок из первого пользовательского сообщения."""
    for m in messages:
        if m.role == "user":
            t = m.content.strip().replace("\n", " ")
            return (t[:60] + "…") if len(t) > 60 else t
    return "Новый диалог"


# ---- Endpoints --------------------------------------------------------------
@router.get("", response_model=list[ChatSessionBrief])
async def list_chats(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> list[ChatSessionBrief]:
    rows = (
        await db.scalars(
            select(ChatSession)
            .options(selectinload(ChatSession.messages))
            .where(ChatSession.user_id == current.id)
            .order_by(ChatSession.updated_at.desc())
        )
    ).all()
    return [
        ChatSessionBrief(id=s.id, title=s.title, message_count=len(s.messages))
        for s in rows
    ]


@router.get("/{session_id}", response_model=ChatSessionFull)
async def get_chat(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> ChatSessionFull:
    s = await _get_owned(db, current, session_id)
    return ChatSessionFull(
        id=s.id,
        title=s.title,
        messages=[ChatMessagePublic.model_validate(m) for m in s.messages],
    )


@router.post("", response_model=ChatSessionFull, status_code=status.HTTP_201_CREATED)
async def create_chat(
    payload: ChatSessionCreate,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> ChatSessionFull:
    title = payload.title if payload.title != "Новый диалог" else _auto_title(payload.messages)
    s = ChatSession(user_id=current.id, title=title)
    for m in payload.messages:
        s.messages.append(ChatMessage(role=m.role, content=m.content))
    db.add(s)
    await db.commit()
    await db.refresh(s, ["messages"])
    return ChatSessionFull(
        id=s.id, title=s.title,
        messages=[ChatMessagePublic.model_validate(m) for m in s.messages],
    )


@router.put("/{session_id}/messages", response_model=ChatSessionFull)
async def replace_messages(
    session_id: int,
    payload: list[ChatMessageIn],
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> ChatSessionFull:
    """Полностью заменить сообщения диалога (синхронизация с фронта)."""
    s = await _get_owned(db, current, session_id)
    s.messages.clear()
    for m in payload:
        s.messages.append(ChatMessage(role=m.role, content=m.content))
    await db.commit()
    await db.refresh(s, ["messages"])
    return ChatSessionFull(
        id=s.id, title=s.title,
        messages=[ChatMessagePublic.model_validate(m) for m in s.messages],
    )


@router.patch("/{session_id}", response_model=ChatSessionBrief)
async def rename_chat(
    session_id: int,
    payload: ChatSessionRename,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> ChatSessionBrief:
    s = await _get_owned(db, current, session_id)
    s.title = payload.title.strip()
    await db.commit()
    await db.refresh(s, ["messages"])
    return ChatSessionBrief(id=s.id, title=s.title, message_count=len(s.messages))


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> None:
    s = await _get_owned(db, current, session_id)
    await db.delete(s)
    await db.commit()
