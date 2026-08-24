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


class QuizSubmitIn(BaseModel):
    """Ответы пользователя.

    answers — выбранные индексы вариантов в том же порядке, в котором вопросы
    пришли с GET /quiz. session_token — токен сессии оттуда же: именно он
    определяет, какие вопросы засчитываются.

    question_ids оставлен только для обратной совместимости со старым клиентом
    (кэш браузера, установленная PWA) и игнорируется, если есть session_token.
    """

    answers: list[int]
    session_token: str | None = None
    question_ids: list[int] | None = None
