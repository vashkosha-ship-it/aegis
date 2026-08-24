"""Схемы AI-ассистента: запрос к модели и контекст, который к нему прилагается."""
from typing import Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=4000)


class BookContext(BaseModel):
    """Контекст книги/страницы, которую сейчас читает пользователь."""

    title: str | None = Field(None, max_length=300)
    author: str | None = Field(None, max_length=300)
    page: int | None = None
    total_pages: int | None = None
    # Текст текущей страницы/главы (обрезается на клиенте и здесь)
    page_text: str | None = Field(None, max_length=6000)


class LibraryBook(BaseModel):
    """Книга из библиотеки пользователя — чтобы ассистент знал, что человек читает."""

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
