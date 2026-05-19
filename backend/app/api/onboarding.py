"""Onboarding endpoints — определение уровня кибербезопасности юзера."""
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.data.onboarding_questions import (
    ONBOARDING_QUESTIONS,
    TOPIC_NAMES,
    get_level_for_percentage,
)
from app.db.session import get_db
from app.models.user import User

router = APIRouter(prefix="/me/onboarding", tags=["onboarding"])


# ============================================================================
# Schemas
# ============================================================================


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
    weak_topics: list[str]              # темы, где меньше 50% правильных
    questions_review: list[dict[str, Any]]  # для разбора в конце теста
    assessed_at: datetime


# ============================================================================
# Endpoints
# ============================================================================


@router.get("", response_model=OnboardingQuiz)
async def get_onboarding_quiz(_: User = Depends(get_current_user)) -> OnboardingQuiz:
    """Вернуть список вопросов БЕЗ правильных ответов (юзер не должен их видеть до отправки)."""
    public_questions = [
        OnboardingQuestion(
            id=q["id"],
            topic=q["topic"],
            difficulty=q["difficulty"],
            question=q["question"],
            options=q["options"],
        )
        for q in ONBOARDING_QUESTIONS
    ]
    return OnboardingQuiz(questions=public_questions, topic_names=TOPIC_NAMES)


@router.post("/submit", response_model=OnboardingResult)
async def submit_onboarding(
    payload: OnboardingSubmit,
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OnboardingResult:
    """Принять ответы юзера, посчитать результат, сохранить, вернуть разбор."""
    if not payload.answers:
        raise HTTPException(status_code=400, detail="No answers provided")

    # Считаем по темам
    topic_stats: dict[str, dict[str, int]] = {
        topic: {"correct": 0, "total": 0} for topic in TOPIC_NAMES
    }
    overall_correct = 0
    overall_total = 0
    questions_review = []

    for q in ONBOARDING_QUESTIONS:
        qid = q["id"]
        topic = q["topic"]
        correct_idx = q["correct"]
        user_idx = payload.answers.get(qid)
        is_answered = user_idx is not None
        is_correct = is_answered and user_idx == correct_idx

        topic_stats[topic]["total"] += 1
        if is_correct:
            topic_stats[topic]["correct"] += 1

        overall_total += 1
        if is_correct:
            overall_correct += 1

        # Разбор для конца теста
        questions_review.append({
            "id": qid,
            "topic": topic,
            "topic_name": TOPIC_NAMES[topic],
            "question": q["question"],
            "options": q["options"],
            "correct_index": correct_idx,
            "user_index": user_idx,
            "is_correct": is_correct,
            "explanation": q["explanation"],
        })

    overall_pct = round(overall_correct * 100 / overall_total) if overall_total > 0 else 0
    level_code, level_name, level_desc = get_level_for_percentage(overall_pct)

    # Распакуем topic_stats в красивый список с процентами
    topic_scores_list = []
    weak_topics = []
    topic_scores_dict: dict[str, int] = {}
    for topic, stats in topic_stats.items():
        pct = round(stats["correct"] * 100 / stats["total"]) if stats["total"] > 0 else 0
        topic_scores_list.append(TopicScore(
            topic=topic,
            topic_name=TOPIC_NAMES[topic],
            correct=stats["correct"],
            total=stats["total"],
            percentage=pct,
        ))
        topic_scores_dict[topic] = pct
        if pct < 50:
            weak_topics.append(topic)

    # Сохраняем результат у юзера
    now = datetime.now(timezone.utc)
    current.cyber_level = level_code
    current.topic_scores = topic_scores_dict
    current.level_assessed_at = now
    await db.commit()
    await db.refresh(current)

    return OnboardingResult(
        cyber_level=level_code,
        level_name=level_name,
        level_description=level_desc,
        overall_percentage=overall_pct,
        topic_scores=topic_scores_list,
        weak_topics=weak_topics,
        questions_review=questions_review,
        assessed_at=now,
    )


@router.get("/result", response_model=OnboardingResult | None)
async def get_my_result(
    current: User = Depends(get_current_user),
) -> OnboardingResult | None:
    """Вернуть последний результат теста, если есть. Иначе null.

    Используется фронтом, чтобы понять — нужно ли показывать онбординг при логине.
    """
    if not current.cyber_level or not current.topic_scores:
        return None

    level_code, level_name, level_desc = get_level_for_percentage(
        # Восстанавливаем общий процент как среднее по темам
        round(sum(current.topic_scores.values()) / len(current.topic_scores))
        if current.topic_scores else 0
    )

    topic_scores_list = []
    weak_topics = []
    for topic, pct in current.topic_scores.items():
        topic_scores_list.append(TopicScore(
            topic=topic,
            topic_name=TOPIC_NAMES.get(topic, topic),
            correct=0,  # детальный разбор не сохраняем — только проценты
            total=0,
            percentage=pct,
        ))
        if pct < 50:
            weak_topics.append(topic)

    overall_pct = round(sum(current.topic_scores.values()) / len(current.topic_scores))

    return OnboardingResult(
        cyber_level=current.cyber_level,
        level_name=level_name,
        level_description=level_desc,
        overall_percentage=overall_pct,
        topic_scores=topic_scores_list,
        weak_topics=weak_topics,
        questions_review=[],  # разбор только сразу после прохождения, не из истории
        assessed_at=current.level_assessed_at or datetime.now(timezone.utc),
    )

# ============================================================================
# Endpoint: самооценка (без прохождения теста)
# ============================================================================


# Допустимые ключи самооценки (5 уровней — тестовый «test» сюда не входит)
_VALID_SELF_ASSESS_LEVELS = {
    "gate_guardian",
    "scout",
    "stronghold",
    "shadow_architect",
    "abyss_warden",
}


# Маппинг ключ → (название, описание)
_LEVEL_META = {
    "gate_guardian": (
        "Gate Guardian",
        "Я знаю, где вход, и буду стоять насмерть. Но если атака сложнее фишинга — зову старших.",
    ),
    "scout": (
        "Scout",
        "Я вижу дыры, которые другие не замечают. Иногда случайно ломаю свои же сервисы, но это часть обучения.",
    ),
    "stronghold": (
        "Stronghold",
        "Меня не возьмёшь лобовой атакой. Придётся искать уязвимость нулевого дня — а я её уже закрыл на прошлой неделе.",
    ),
    "shadow_architect": (
        "Shadow Architect",
        "Я не реагирую на угрозы — я проектирую среду, где атака обречена с самого начала. Хакеры даже не узнают, что их уже обманули.",
    ),
    "abyss_warden": (
        "Abyss Warden",
        "Я не просто защищаю — я определяю, что такое безопасность. Если я чего-то не знаю, этого ещё не существует.",
    ),
}


class SelfAssessRequest(BaseModel):
    level: str = Field(min_length=1, max_length=32)


class SelfAssessResponse(BaseModel):
    cyber_level: str
    level_name: str
    level_description: str
    assessed_at: datetime


@router.post("/self-assess", response_model=SelfAssessResponse)
async def submit_self_assessment(
    payload: SelfAssessRequest,
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SelfAssessResponse:
    """Самооценка уровня — юзер сам выбрал, без прохождения теста.

    Сохраняет cyber_level и level_assessed_at, но НЕ заполняет topic_scores
    (по самооценке мы не знаем сильные/слабые темы).
    """
    if payload.level not in _VALID_SELF_ASSESS_LEVELS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid level. Must be one of: {sorted(_VALID_SELF_ASSESS_LEVELS)}",
        )

    name, desc = _LEVEL_META[payload.level]
    now = datetime.now(timezone.utc)

    current.cyber_level = payload.level
    current.topic_scores = None  # самооценка — без разбивки по темам
    current.level_assessed_at = now
    await db.commit()
    await db.refresh(current)

    return SelfAssessResponse(
        cyber_level=payload.level,
        level_name=name,
        level_description=desc,
        assessed_at=now,
    )