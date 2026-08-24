"""Сертификация: экзамен по категории (50 вопросов, AI из книг) + PDF-сертификат."""
from __future__ import annotations

import io
import logging
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.book import Category
from app.models.certificate import Certificate
from app.models.exam_session import ExamSession
from app.models.user import User
from app.schemas.certificates import (
    ExamQuestion,
    StartExamRequest,
    StartExamResponse,
    SubmitExamRequest,
    SubmitExamResponse,
)
from app.services import certificate_pdf as cert_pdf
from app.services import certificates as cert_service
from app.services.deepseek_client import DeepSeekError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/certificates", tags=["certificates"])

EXAM_TTL_MINUTES = 120  # столько живёт выданный экзамен


@router.get("/categories")
async def list_categories(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[str]:
    """Категории, доступные для сертификации (есть хотя бы одна книга с текстом)."""
    rows = await db.scalars(select(Category.name).order_by(Category.name.asc()))
    return list(rows.all())


@router.get("/mine")
async def my_certificates(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> list[dict]:
    """Полученные пользователем сертификаты."""
    rows = await db.scalars(
        select(Certificate).where(Certificate.user_id == current.id).order_by(Certificate.issued_at.desc())
    )
    return [
        {"id": c.id, "category": c.category, "score": c.score, "issued_at": c.issued_at.isoformat()}
        for c in rows.all()
    ]


@router.post("/exam/start", response_model=StartExamResponse)
async def start_exam(
    payload: StartExamRequest,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> StartExamResponse:
    """Сгенерировать экзамен из 50 вопросов по категории (AI на основе книг), порциями."""
    text = await cert_service.gather_category_text(db, payload.category)
    if not text or len(text) < 500:
        raise HTTPException(
            status_code=400,
            detail="Недостаточно проиндексированного текста книг по этой теме для генерации теста",
        )

    questions: list[dict] = []
    correct: list[int] = []
    batch_size = 10
    attempts = 0
    # Генерируем порциями по 10, пока не наберём 50 (или не исчерпаем попытки)
    while len(questions) < cert_service.NUM_QUESTIONS and attempts < 8:
        attempts += 1
        need = min(batch_size, cert_service.NUM_QUESTIONS - len(questions))
        try:
            qs, cs = await cert_service.generate_questions_batch(
                payload.category, text, need, [q["question"] for q in questions]
            )
        except DeepSeekError as e:
            logger.warning("Exam batch failed for %s: %s", payload.category, e)
            break
        questions.extend(qs)
        correct.extend(cs)

    if len(questions) < 10:
        raise HTTPException(status_code=502, detail="Не удалось сгенерировать тест, попробуйте позже")

    # Ограничиваем ровно cert_service.NUM_QUESTIONS (или сколько набралось)
    questions = questions[:cert_service.NUM_QUESTIONS]
    correct = correct[:cert_service.NUM_QUESTIONS]

    token = secrets.token_urlsafe(32)
    db.add(ExamSession(
        token=token,
        user_id=current.id,
        category=payload.category,
        correct=correct,
        total=len(questions),
        expires_at=datetime.now(UTC) + timedelta(minutes=EXAM_TTL_MINUTES),
    ))
    await db.commit()

    return StartExamResponse(
        exam_token=token,
        category=payload.category,
        questions=[ExamQuestion(**q) for q in questions],
    )


@router.post("/exam/submit", response_model=SubmitExamResponse)
async def submit_exam(
    payload: SubmitExamRequest,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> SubmitExamResponse:
    """Проверить ответы. При >=85% выдать сертификат (если ФИО заполнено)."""
    exam = await db.scalar(
        select(ExamSession).where(ExamSession.token == payload.exam_token)
    )
    # Одинаковая ошибка для «не найден», «чужой» и «истёк» — не раскрываем,
    # существует ли токен.
    if not exam or exam.user_id != current.id:
        raise HTTPException(status_code=404, detail="Экзамен не найден или истёк")

    expires = exam.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if datetime.now(UTC) > expires:
        raise HTTPException(status_code=404, detail="Экзамен не найден или истёк")

    if exam.submitted_at is None:
        # Первая (и единственная) проверка ответов. Результат фиксируем в БД:
        # повторный submit вернёт его же и НЕ будет пересчитывать новые ответы —
        # иначе по correct_count можно было бы подобрать правильные варианты.
        answers = payload.answers
        correct = exam.correct or []
        total = exam.total
        correct_count = sum(
            1 for i, ci in enumerate(correct) if i < len(answers) and answers[i] == ci
        )
        score = round(correct_count / total * 100) if total else 0
        passed = score >= cert_service.PASS_THRESHOLD

        exam.submitted_at = datetime.now(UTC)
        exam.score = score
        exam.correct_count = correct_count
        exam.passed = passed
        await db.commit()
    else:
        # Повторный вызов — возвращаем зафиксированный результат. Легитимный
        # сценарий: пользователь прошёл, но не было заполнено ФИО, заполнил и
        # отправил форму ещё раз.
        score = exam.score or 0
        correct_count = exam.correct_count or 0
        total = exam.total
        passed = bool(exam.passed)

    if not passed:
        return SubmitExamResponse(
            score=score, passed=False, correct_count=correct_count, total=total
        )

    # Прошёл — нужно ФИО
    if not current.full_name or not current.full_name.strip():
        return SubmitExamResponse(
            score=score, passed=True, correct_count=correct_count, total=total,
            needs_full_name=True,
        )

    # Выдаём сертификат (или обновляем, если уже был по этой теме с меньшим баллом)
    existing = await db.scalar(
        select(Certificate).where(
            Certificate.user_id == current.id, Certificate.category == exam.category
        )
    )
    if existing:
        if score > existing.score:
            existing.score = score
            existing.issued_at = datetime.now(UTC)
    else:
        db.add(Certificate(
            user_id=current.id,
            category=exam.category,
            score=score,
            full_name=current.full_name.strip(),
        ))
    await db.commit()

    return SubmitExamResponse(
        score=score, passed=True, correct_count=correct_count, total=total
    )


@router.get("/{category}/pdf")
async def download_certificate(
    category: str,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Скачать PDF-сертификат по категории (если выдан)."""
    cert = await db.scalar(
        select(Certificate).where(
            Certificate.user_id == current.id, Certificate.category == category
        )
    )
    if not cert:
        raise HTTPException(status_code=404, detail="Сертификат по этой теме не получен")

    pdf_bytes = cert_pdf.build_certificate_pdf(cert.full_name, cert.category, cert.score, cert.issued_at)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="certificate_{cert.id}.pdf"'},
    )

