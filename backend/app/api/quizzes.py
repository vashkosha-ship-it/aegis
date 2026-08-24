"""Quiz endpoints: get questions, submit answers, list attempts."""
import logging
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete as sa_delete
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_admin, get_current_user
from app.db.session import get_db
from app.models.book import Book
from app.models.quiz import QuizAttempt, QuizQuestion
from app.models.quiz_session import QuizSession
from app.models.user import User
from app.schemas.quiz import (
    QuizAttemptPublic,
    QuizQuestionPublic,
    QuizResult,
    QuizSubmitIn,
)
from app.services import quizzes as quizzes_service
from app.services.gamification import add_xp, check_and_award_achievements

logger = logging.getLogger(__name__)

router = APIRouter(tags=["quizzes"])



QUIZ_SESSION_TTL_MINUTES = 180  # столько живёт выданный набор вопросов


@router.get("/books/{book_id}/quiz", response_model=list[QuizQuestionPublic])
async def get_quiz(
    book_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> list[QuizQuestionPublic]:
    """Выдать набор вопросов (без правильных ответов) и открыть сессию.

    Состав вопросов запоминается на сервере — клиент при отправке присылает
    только токен сессии, подменить набор нельзя.
    """
    book = (
        await db.scalars(
            select(Book).options(selectinload(Book.categories)).where(Book.id == book_id)
        )
    ).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    questions = await quizzes_service.ensure_quiz_for_book(db, book)
    served = quizzes_service.select_questions(questions)

    token = secrets.token_urlsafe(32)
    db.add(QuizSession(
        token=token,
        user_id=current.id,
        book_id=book_id,
        question_ids=[q.id for q in served],
        expires_at=datetime.now(UTC) + timedelta(minutes=QUIZ_SESSION_TTL_MINUTES),
    ))
    await db.commit()

    # Токен отдаём заголовком, а не в теле: так формат ответа не меняется и
    # уже установленные PWA со старым app.js продолжают работать.
    response.headers["X-Quiz-Session"] = token
    return [QuizQuestionPublic.model_validate(q) for q in served]


@router.post("/books/{book_id}/quiz/regenerate", response_model=list[QuizQuestionPublic])
async def regenerate_quiz(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> list[QuizQuestionPublic]:
    """Пересоздать тест книги (удаляет старые вопросы и генерирует заново).

    Только для админа. Используется чтобы обновить уже существующие книги
    на новые ИИ-тесты вместо старых статических.
    """
    book = (
        await db.scalars(
            select(Book).options(selectinload(Book.categories)).where(Book.id == book_id)
        )
    ).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    # Удаляем старые вопросы (попытки прохождения сохраняются — они ссылаются
    # на book_id, а не на конкретные вопросы)
    await db.execute(sa_delete(QuizQuestion).where(QuizQuestion.book_id == book_id))
    await db.commit()

    questions = await quizzes_service.ensure_quiz_for_book(db, book)
    return [QuizQuestionPublic.model_validate(q) for q in questions]


@router.post("/books/quiz/regenerate-all")
async def regenerate_all_quizzes(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> dict:
    """Сбросить тесты у всех книг.

    Удаляем все сохранённые вопросы — они пересоздадутся автоматически при
    следующем открытии теста (lazy), уже по новой логике (пул, 15 вопросов).
    Так избегаем долгой синхронной AI-генерации и таймаутов при большом числе
    книг. Пройденные попытки (QuizAttempt) сохраняются — они ссылаются на
    book_id, а не на конкретные вопросы.
    """
    book_ids = (await db.scalars(select(QuizQuestion.book_id).distinct())).all()
    affected = len(set(book_ids))
    await db.execute(sa_delete(QuizQuestion))
    await db.commit()
    logger.info("All quizzes reset by admin (%d books affected)", affected)
    return {"status": "ok", "books_cleared": affected}


@router.post(
    "/books/{book_id}/quiz/submit",
    response_model=QuizResult,
    status_code=status.HTTP_201_CREATED,
)
async def submit_quiz(
    book_id: int,
    payload: QuizSubmitIn,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> QuizResult:
    """Submit user's answers, calculate score, persist attempt, award XP."""
    book = (
        await db.scalars(
            select(Book).options(selectinload(Book.categories)).where(Book.id == book_id)
        )
    ).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    all_questions = await quizzes_service.ensure_quiz_for_book(db, book)

    # Набор вопросов определяет ТОЛЬКО серверная сессия. Раньше клиент мог
    # прислать свои question_ids — то есть сам выбрать, что ему засчитают.
    if not payload.session_token:
        raise HTTPException(
            status_code=400,
            detail="Не указан session_token. Откройте тест заново.",
        )

    # FOR UPDATE: без блокировки два параллельных submit по одной сессии
    # оба прошли бы проверку submitted_at и оба начислили XP.
    session = await db.scalar(
        select(QuizSession)
        .where(QuizSession.token == payload.session_token)
        .with_for_update()
    )
    if not session or session.user_id != current.id or session.book_id != book_id:
        raise HTTPException(status_code=404, detail="Quiz session not found")

    expires = session.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if datetime.now(UTC) > expires:
        raise HTTPException(status_code=404, detail="Quiz session expired")

    if session.submitted_at is not None:
        # Повторная отправка не пересчитывается: иначе по возвращаемому score
        # можно подбирать правильные ответы.
        raise HTTPException(status_code=409, detail="Quiz session already submitted")

    by_id = {q.id: q for q in all_questions}
    graded = []
    for qid in session.question_ids:
        q = by_id.get(qid)
        if q is None:
            raise HTTPException(
                status_code=409, detail="Quiz questions changed, restart the quiz"
            )
        graded.append(q)

    if len(payload.answers) != len(graded):
        raise HTTPException(
            status_code=400,
            detail=f"Expected {len(graded)} answers, got {len(payload.answers)}",
        )

    correct_indices = [q.correct_index for q in graded]
    score = sum(1 for i, ans in enumerate(payload.answers) if ans == correct_indices[i])
    total = len(graded)
    percentage = round(score / total * 100) if total else 0

    attempt = QuizAttempt(
        user_id=current.id,
        book_id=book_id,
        score=score,
        total=total,
        percentage=percentage,
        answers=payload.answers,
    )
    # ВАЖНО: проверяем ДО db.add(attempt). Иначе autoflush запишет текущую
    # попытку раньше запроса, она сама попадёт в выборку — и XP не начислится
    # никогда, даже за первую сдачу.
    already_passed = await db.scalar(
        select(QuizAttempt.id)
        .where(
            QuizAttempt.user_id == current.id,
            QuizAttempt.book_id == book_id,
            QuizAttempt.percentage >= 60,
        )
        .limit(1)
    )

    db.add(attempt)

    # XP — как на фронте: passing 60% = 15 XP, ≥80% = 30 XP
    if percentage >= 60 and not already_passed:
        await add_xp(db, current, 30 if percentage >= 80 else 15)
        await check_and_award_achievements(db, current, trigger="quiz_completed")
        session.xp_awarded = True

    # Помечаем сессию использованной — второй раз этот набор не сдать.
    session.submitted_at = datetime.now(UTC)
    session.score = score
    session.percentage = percentage

    await db.commit()
    await db.refresh(attempt)
    return QuizResult(
        score=score, total=total, percentage=percentage, correct_indices=correct_indices
    )


@router.get("/me/quiz-attempts", response_model=list[QuizAttemptPublic])
async def list_my_attempts(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> list[QuizAttemptPublic]:
    """All quiz attempts for the current user."""
    rows = await db.scalars(
        select(QuizAttempt)
        .where(QuizAttempt.user_id == current.id)
        .order_by(QuizAttempt.completed_at.desc())
    )
    return [QuizAttemptPublic.model_validate(r) for r in rows.all()]