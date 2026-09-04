"""Pydantic schemas for reading progress, mylist, reviews, annotations."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

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

    model_config = ConfigDict(from_attributes=True)


class MyListUpdate(BaseModel):
    status: MyListStatus


class MyListEntryPublic(BaseModel):
    book_id: int
    status: MyListStatus
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


class AnnotationPosition(BaseModel):
    """Координаты заметки внутри страницы, только безопасные CSS-значения."""

    x: float = Field(default=10, ge=0, le=100)
    y: float = Field(default=10, ge=0, le=100)
    w: float = Field(default=30, gt=0, le=100)
    h: float = Field(default=3, gt=0, le=100)
    color: str = Field(default="#fbbf24", pattern=r"^#[0-9a-fA-F]{6}$")

    model_config = ConfigDict(extra="forbid")


class AnnotationCreate(BaseModel):
    type: AnnotationType
    page: int = Field(ge=1)
    selected_text: str = Field(min_length=1, max_length=10_000)
    note_text: str | None = Field(default=None, max_length=5_000)
    position: AnnotationPosition = Field(default_factory=AnnotationPosition)


class AnnotationPublic(BaseModel):
    id: int
    book_id: int
    type: AnnotationType
    page: int
    selected_text: str
    note_text: str | None
    position: dict
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HeatmapEntry(BaseModel):
    date: str  # YYYY-MM-DD
    pages: int


class HeatmapResponse(BaseModel):
    days: list[HeatmapEntry]


# ---------------------------------------------------------------------------
# Детали активности за конкретный день (карточка в календаре чтения)
# ---------------------------------------------------------------------------


class DayBookActivity(BaseModel):
    book_id: int
    title: str
    pages_at_end: int


class DayQuizActivity(BaseModel):
    book_title: str
    percentage: int
    passed: bool


class DayStatsResponse(BaseModel):
    date: str
    pages_read: int
    quiz_attempts: int
    quiz_avg_percentage: int
    annotations_count: int
    highlights_count: int
    notes_count: int
    books: list[DayBookActivity]
    quizzes: list[DayQuizActivity]
