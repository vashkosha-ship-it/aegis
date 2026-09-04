"""Схемы истории диалогов с AI-ассистентом."""
from pydantic import BaseModel, ConfigDict, Field


class ChatMessageIn(BaseModel):
    role: str = Field(..., pattern=r"^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=8000)


class ChatMessagePublic(BaseModel):
    id: int
    role: str
    content: str

    model_config = ConfigDict(from_attributes=True)


class ChatSessionBrief(BaseModel):
    """Строка в списке диалогов — без самих сообщений."""

    id: int
    title: str
    message_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class ChatSessionFull(BaseModel):
    id: int
    title: str
    messages: list[ChatMessagePublic] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class ChatSessionCreate(BaseModel):
    title: str = Field(default="Новый диалог", max_length=200)
    messages: list[ChatMessageIn] = Field(default_factory=list)


class ChatSessionRename(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
