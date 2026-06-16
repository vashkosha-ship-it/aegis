"""Сертификация: экзамен по категории (50 вопросов, AI из книг) + PDF-сертификат."""
from __future__ import annotations

import io
import json
import logging
import random
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.book import Book, Category, book_categories
from app.models.book_page import BookPage
from app.models.certificate import Certificate
from app.models.user import User
from app.services.deepseek_client import chat_completion, DeepSeekError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/certificates", tags=["certificates"])

PASS_THRESHOLD = 85  # процент для прохождения
NUM_QUESTIONS = 50

# Кэш активных экзаменов в памяти: {token: {"category":..., "questions":[...], "correct":[...]}}
# Простое решение без таблицы — экзамен живёт в рамках сессии процесса.
_active_exams: dict[str, dict] = {}


class StartExamRequest(BaseModel):
    category: str


class ExamQuestion(BaseModel):
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
    needs_full_name: bool = False


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


async def _gather_category_text(db: AsyncSession, category: str, max_chars: int = 12000) -> str:
    """Собирает выдержки текста книг указанной категории для генерации вопросов."""
    cat = await db.scalar(select(Category).where(Category.name == category))
    if not cat:
        return ""
    book_ids = (await db.scalars(
        select(book_categories.c.book_id).where(book_categories.c.category_id == cat.id)
    )).all()
    if not book_ids:
        return ""
    # Берём страницы из книг категории, перемешиваем для разнообразия
    pages = (await db.scalars(
        select(BookPage.content).where(BookPage.book_id.in_(book_ids)).limit(400)
    )).all()
    pages = [p for p in pages if p and len(p.strip()) > 100]
    random.shuffle(pages)
    text = ""
    for p in pages:
        if len(text) >= max_chars:
            break
        text += p.strip()[:2000] + "\n\n"
    return text[:max_chars]


_EXAM_PROMPT = """На основе материалов по теме "{category}" сгенерируй РОВНО {n} вопросов для аттестации.
Каждый вопрос — с 4 вариантами ответа, ровно один правильный.
Вопросы должны проверять понимание темы, быть разной сложности, не повторяться.
{extra}
Верни СТРОГО JSON без markdown:
{{"questions":[{{"question":"...","options":["A","B","C","D"],"correct_index":0}}]}}

Материалы:
{text}"""


def _parse_questions(raw: str) -> tuple[list[dict], list[int]]:
    """Разобрать JSON-ответ AI в (вопросы без ответов, индексы правильных)."""
    t = raw.strip()
    if t.startswith("```"):
        t = t.strip("`")
        if t.startswith("json"):
            t = t[4:]
    s, e = t.find("{"), t.rfind("}")
    if s == -1 or e == -1:
        return [], []
    try:
        data = json.loads(t[s:e + 1])
        raw_qs = data["questions"]
    except (ValueError, KeyError, TypeError):
        return [], []
    questions, correct = [], []
    for q in raw_qs:
        try:
            qt = str(q["question"]).strip()
            opts = [str(o).strip() for o in q["options"]]
            ci = int(q["correct_index"])
        except (KeyError, TypeError, ValueError):
            continue
        if qt and len(opts) >= 2 and 0 <= ci < len(opts):
            questions.append({"question": qt, "options": opts})
            correct.append(ci)
    return questions, correct


async def _generate_questions_batch(category: str, text: str, n: int, seen: list[str]) -> tuple[list[dict], list[int]]:
    """Сгенерировать порцию из n вопросов. seen — уже использованные формулировки (для разнообразия)."""
    extra = ""
    if seen:
        sample = "; ".join(seen[-15:])
        extra = f"НЕ повторяй уже заданные вопросы: {sample}"
    prompt = _EXAM_PROMPT.format(category=category, n=n, text=text, extra=extra)
    raw = await chat_completion(
        [{"role": "user", "content": prompt}],
        system_prompt="Ты генерируешь экзаменационные тесты строго в формате JSON.",
        max_tokens=4000,
        timeout=120.0,
    )
    return _parse_questions(raw)


@router.post("/exam/start", response_model=StartExamResponse)
async def start_exam(
    payload: StartExamRequest,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> StartExamResponse:
    """Сгенерировать экзамен из 50 вопросов по категории (AI на основе книг), порциями."""
    text = await _gather_category_text(db, payload.category)
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
    while len(questions) < NUM_QUESTIONS and attempts < 8:
        attempts += 1
        need = min(batch_size, NUM_QUESTIONS - len(questions))
        try:
            qs, cs = await _generate_questions_batch(
                payload.category, text, need, [q["question"] for q in questions]
            )
        except DeepSeekError as e:
            logger.warning("Exam batch failed for %s: %s", payload.category, e)
            break
        questions.extend(qs)
        correct.extend(cs)

    if len(questions) < 10:
        raise HTTPException(status_code=502, detail="Не удалось сгенерировать тест, попробуйте позже")

    # Ограничиваем ровно NUM_QUESTIONS (или сколько набралось)
    questions = questions[:NUM_QUESTIONS]
    correct = correct[:NUM_QUESTIONS]

    import secrets
    token = secrets.token_urlsafe(16)
    _active_exams[token] = {
        "user_id": current.id,
        "category": payload.category,
        "correct": correct,
        "total": len(questions),
    }
    if len(_active_exams) > 500:
        for k in list(_active_exams.keys())[:100]:
            _active_exams.pop(k, None)

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
    exam = _active_exams.get(payload.exam_token)
    if not exam or exam["user_id"] != current.id:
        raise HTTPException(status_code=404, detail="Экзамен не найден или истёк")

    correct = exam["correct"]
    total = exam["total"]
    answers = payload.answers
    correct_count = sum(
        1 for i, ci in enumerate(correct) if i < len(answers) and answers[i] == ci
    )
    score = round(correct_count / total * 100) if total else 0
    passed = score >= PASS_THRESHOLD

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
            Certificate.user_id == current.id, Certificate.category == exam["category"]
        )
    )
    if existing:
        if score > existing.score:
            existing.score = score
            existing.issued_at = datetime.now(timezone.utc)
    else:
        db.add(Certificate(
            user_id=current.id,
            category=exam["category"],
            score=score,
            full_name=current.full_name.strip(),
        ))
    await db.commit()
    _active_exams.pop(payload.exam_token, None)

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

    pdf_bytes = _build_certificate_pdf(cert.full_name, cert.category, cert.score, cert.issued_at)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="certificate_{cert.id}.pdf"'},
    )


def _build_certificate_pdf(full_name: str, category: str, score: int, issued_at: datetime) -> bytes:
    """Генерирует PDF-сертификат с поддержкой кириллицы."""
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import os

    # Регистрируем кириллический шрифт (DejaVuSans поставляется с системой)
    font_name = "Helvetica"
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ):
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
                pdfmetrics.registerFont(TTFont("DejaVu-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
                font_name = "DejaVu"
                break
            except Exception:
                pass

    bold_font = "DejaVu-Bold" if font_name == "DejaVu" else "Helvetica-Bold"
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=landscape(A4))
    w, h = landscape(A4)

    # Рамка
    c.setStrokeColorRGB(0.18, 0.17, 0.48)
    c.setLineWidth(3)
    c.rect(15 * mm, 15 * mm, w - 30 * mm, h - 30 * mm)
    c.setLineWidth(1)
    c.rect(18 * mm, 18 * mm, w - 36 * mm, h - 36 * mm)

    # Заголовок
    c.setFont(bold_font, 36)
    c.setFillColorRGB(0.18, 0.17, 0.48)
    c.drawCentredString(w / 2, h - 55 * mm, "СЕРТИФИКАТ")

    c.setFont(font_name, 14)
    c.setFillColorRGB(0.3, 0.3, 0.3)
    c.drawCentredString(w / 2, h - 68 * mm, "подтверждает, что")

    # ФИО
    c.setFont(bold_font, 26)
    c.setFillColorRGB(0.1, 0.1, 0.1)
    c.drawCentredString(w / 2, h - 88 * mm, full_name)

    # Текст
    c.setFont(font_name, 14)
    c.setFillColorRGB(0.3, 0.3, 0.3)
    c.drawCentredString(w / 2, h - 102 * mm, "успешно прошёл(ла) аттестацию по теме")

    c.setFont(bold_font, 18)
    c.setFillColorRGB(0.18, 0.17, 0.48)
    c.drawCentredString(w / 2, h - 116 * mm, f"«{category}»")

    c.setFont(font_name, 14)
    c.setFillColorRGB(0.3, 0.3, 0.3)
    c.drawCentredString(w / 2, h - 130 * mm, f"с результатом {score}%")

    # Дата и подпись
    c.setFont(font_name, 11)
    c.setFillColorRGB(0.45, 0.45, 0.45)
    c.drawCentredString(w / 2, 32 * mm, f"Дата выдачи: {issued_at.strftime('%d.%m.%Y')}")
    c.drawCentredString(w / 2, 25 * mm, "Aegis Security Library")

    c.showPage()
    c.save()
    return buf.getvalue()
