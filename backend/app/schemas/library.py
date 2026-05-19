"""Pydantic schemas for reading progress, mylist, reviews, annotations."""
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.library import AnnotationType, MyListStatus


class ReadingProgressUpdate(BaseModel):
    current_page: int = Field(ge=1)
    total_pages: int | None = Field(default=None, ge=1)


class ReadingProgressPublic(BaseModel):
    book_id: int
    current_page: int
    total_pages: int
    started: bool
    last_read_at: datetime

    class Config:
        from_attributes = True


class MyListUpdate(BaseModel):
    status: MyListStatus


class MyListEntryPublic(BaseModel):
    book_id: int
    status: MyListStatus
    updated_at: datetime

    class Config:
        from_attributes = True


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    text: str = Field(default="", max_length=2000)


class ReviewPublic(BaseModel):
    id: int
    user_id: int
    user_username: str
    rating: int
    text: str
    created_at: datetime

    class Config:
        from_attributes = True


class AnnotationCreate(BaseModel):
    type: AnnotationType
    page: int = Field(ge=1)
    selected_text: str = Field(min_length=1, max_length=10_000)
    note_text: str | None = Field(default=None, max_length=5_000)
    position: dict = Field(default_factory=dict)


class AnnotationPublic(BaseModel):
    id: int
    book_id: int
    type: AnnotationType
    page: int
    selected_text: str
    note_text: str | None
    position: dict
    created_at: datetime

    class Config:
        from_attributes = True


class HeatmapEntry(BaseModel):
    date: str  # YYYY-MM-DD
    pages: int


class HeatmapResponse(BaseModel):
    days: list[HeatmapEntry]
