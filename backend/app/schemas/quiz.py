"""Pydantic schemas for quiz endpoints."""
from datetime import datetime

from pydantic import BaseModel, Field


class QuizQuestionPublic(BaseModel):
    """Question shown to the user — without revealing correct answer."""
    id: int
    question: str
    options: list[str]

    class Config:
        from_attributes = True


class QuizSubmit(BaseModel):
    """User submits answers as list of selected indices."""
    answers: list[int] = Field(min_length=1)


class QuizResult(BaseModel):
    score: int
    total: int
    percentage: int
    correct_indices: list[int]  # шпаргалка для UI после сабмита


class QuizAttemptPublic(BaseModel):
    id: int
    book_id: int
    score: int
    total: int
    percentage: int
    completed_at: datetime

    class Config:
        from_attributes = True
