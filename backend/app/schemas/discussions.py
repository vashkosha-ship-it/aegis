"""Схемы обсуждений книг: комментарии и ответы на них."""
from pydantic import BaseModel, Field


class CommentCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    parent_id: int | None = None


class CommentAuthor(BaseModel):
    id: int
    username: str
    full_name: str | None = None
    has_avatar: bool = False


class CommentPublic(BaseModel):
    id: int
    text: str
    created_at: str
    author: CommentAuthor
    # can_delete считается на сервере: автор комментария или админ
    can_delete: bool = False
    # Ответы вложены рекурсивно — дерево строится в роутере
    replies: list["CommentPublic"] = Field(default_factory=list)
