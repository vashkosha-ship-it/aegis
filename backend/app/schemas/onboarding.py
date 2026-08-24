"""Схемы онбординга: тест на уровень кибербезопасности и его результат."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class OnboardingQuestion(BaseModel):
    """Вопрос для теста — без правильного ответа и объяснения."""

    id: str
    topic: str
    difficulty: str
    question: str
    options: list[str]


class OnboardingQuiz(BaseModel):
    questions: list[OnboardingQuestion]
    topic_names: dict[str, str]


class OnboardingSubmit(BaseModel):
    """Ответы юзера: словарь question_id → выбранный_индекс."""

    answers: dict[str, int] = Field(default_factory=dict)


class TopicScore(BaseModel):
    topic: str
    topic_name: str
    correct: int
    total: int
    percentage: int


class OnboardingResult(BaseModel):
    cyber_level: str
    level_name: str
    level_description: str
    overall_percentage: int
    topic_scores: list[TopicScore]
    weak_topics: list[str]                  # темы, где меньше 50% правильных
    questions_review: list[dict[str, Any]]  # для разбора в конце теста
    assessed_at: datetime


class SelfAssessRequest(BaseModel):
    """Пользователь сам указывает уровень, минуя тест."""

    level: str = Field(min_length=1, max_length=32)


class SelfAssessResponse(BaseModel):
    cyber_level: str
    level_name: str
    level_description: str
    assessed_at: datetime
