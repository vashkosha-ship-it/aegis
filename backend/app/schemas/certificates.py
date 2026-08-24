"""Схемы сертификации: экзамен по категории и его результат."""
from pydantic import BaseModel


class StartExamRequest(BaseModel):
    category: str


class ExamQuestion(BaseModel):
    """Вопрос без правильного ответа — клиенту он не отдаётся никогда."""

    question: str
    options: list[str]


class StartExamResponse(BaseModel):
    exam_token: str
    category: str
    questions: list[ExamQuestion]


class SubmitExamRequest(BaseModel):
    exam_token: str
    answers: list[int]  # индекс выбранного варианта на каждый вопрос


class SubmitExamResponse(BaseModel):
    score: int
    passed: bool
    correct_count: int
    total: int
    # Экзамен сдан, но в профиле нет ФИО — сертификат не на кого выписать
    needs_full_name: bool = False
