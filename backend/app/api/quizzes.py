"""Quiz endpoints: get questions, submit answers, list attempts."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.book import Book
from app.models.quiz import QuizAttempt, QuizQuestion
from app.models.user import User
from app.schemas.quiz import (
    QuizAttemptPublic,
    QuizQuestionPublic,
    QuizResult,
    QuizSubmit,
)
from app.services.gamification import add_xp, check_and_award_achievements

router = APIRouter(tags=["quizzes"])


# Захардкоженные тесты по категориям — миграция логики generateQuizForBook из фронта.
# На Этапе 3 эти будут дополнены/заменены AI-генерацией по тексту PDF.
CATEGORY_QUIZZES: dict[str, list[dict]] = {
    "Веб-безопасность": [
        {
            "question": "Какой тип атаки внедряет вредоносный скрипт в веб-страницу?",
            "options": ["XSS", "CSRF", "SQL Injection", "DDoS"],
            "correct_index": 0,
        },
        {
            "question": "Какой HTTP-заголовок защищает от кликджекинга?",
            "options": ["X-Frame-Options", "Content-Type", "Authorization", "Cache-Control"],
            "correct_index": 0,
        },
        {
            "question": "Что означает аббревиатура CSP?",
            "options": [
                "Content Security Policy",
                "Cross-Site Protocol",
                "Cipher Standard Protocol",
                "Common Server Process",
            ],
            "correct_index": 0,
        },
    ],
    "Анализ ВПО": [
        {
            "question": "Что такое песочница в анализе вредоносного ПО?",
            "options": ["Изолированная среда", "Антивирус", "Сигнатура", "Ядро ОС"],
            "correct_index": 0,
        },
        {
            "question": "Какой инструмент чаще всего используется для дизассемблирования?",
            "options": ["IDA Pro", "Wireshark", "nmap", "Burp Suite"],
            "correct_index": 0,
        },
        {
            "question": "Для чего предназначен YARA?",
            "options": [
                "Создание сигнатурных правил для ВПО",
                "Шифрование файлов",
                "Сетевой сканер",
                "Виртуальная машина",
            ],
            "correct_index": 0,
        },
    ],
    "Пентест": [
        {
            "question": "Какая фаза пентеста идёт первой?",
            "options": ["Разведка", "Эксплуатация", "Постэксплуатация", "Отчёт"],
            "correct_index": 0,
        },
        {
            "question": "Какой инструмент — стандарт для сканирования портов?",
            "options": ["nmap", "Burp Suite", "Metasploit", "John the Ripper"],
            "correct_index": 0,
        },
        {
            "question": "Что такое эксплойт?",
            "options": [
                "Код, использующий уязвимость",
                "Сетевой сканер",
                "Файрвол",
                "Антивирус",
            ],
            "correct_index": 0,
        },
    ],
    "Криптография": [
        {
            "question": "Какой алгоритм симметричный?",
            "options": ["AES", "RSA", "ECC", "DSA"],
            "correct_index": 0,
        },
        {
            "question": "Что такое криптографический хеш?",
            "options": [
                "Односторонняя функция",
                "Обратимое преобразование",
                "Симметричный ключ",
                "Сертификат",
            ],
            "correct_index": 0,
        },
        {
            "question": "Какой протокол обеспечивает шифрование HTTPS?",
            "options": ["TLS", "FTP", "SMTP", "IMAP"],
            "correct_index": 0,
        },
    ],
}


async def _ensure_quiz_for_book(db: AsyncSession, book: Book) -> list[QuizQuestion]:
    """Lazily generate static quiz for a book if none exists yet."""
    existing = (
        await db.scalars(select(QuizQuestion).where(QuizQuestion.book_id == book.id))
    ).all()
    if existing:
        return list(existing)

    template = CATEGORY_QUIZZES.get(book.category, [])
    if not template:
        # дефолт — 1 общий вопрос, чтобы юзер не получал пустоту
        template = [
            {
                "question": "Кибербезопасность важна потому что:",
                "options": ["Защита данных", "Скорость работы", "Дизайн", "Маркетинг"],
                "correct_index": 0,
            }
        ]

    new_questions = [
        QuizQuestion(
            book_id=book.id,
            question=t["question"],
            options=t["options"],
            correct_index=t["correct_index"],
            source="static",
        )
        for t in template
    ]
    db.add_all(new_questions)
    await db.commit()
    for q in new_questions:
        await db.refresh(q)
    return new_questions


@router.get("/books/{book_id}/quiz", response_model=list[QuizQuestionPublic])
async def get_quiz(
    book_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[QuizQuestionPublic]:
    """Return quiz questions for a book (without correct answers)."""
    book = await db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    questions = await _ensure_quiz_for_book(db, book)
    return [QuizQuestionPublic.model_validate(q) for q in questions]


@router.post(
    "/books/{book_id}/quiz/submit",
    response_model=QuizResult,
    status_code=status.HTTP_201_CREATED,
)
async def submit_quiz(
    book_id: int,
    payload: QuizSubmit,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
) -> QuizResult:
    """Submit user's answers, calculate score, persist attempt, award XP."""
    book = await db.get(Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    questions = await _ensure_quiz_for_book(db, book)
    if len(payload.answers) != len(questions):
        raise HTTPException(
            status_code=400,
            detail=f"Expected {len(questions)} answers, got {len(payload.answers)}",
        )

    correct_indices = [q.correct_index for q in questions]
    score = sum(1 for i, ans in enumerate(payload.answers) if ans == correct_indices[i])
    total = len(questions)
    percentage = round(score / total * 100) if total else 0

    attempt = QuizAttempt(
        user_id=current.id,
        book_id=book_id,
        score=score,
        total=total,
        percentage=percentage,
        answers=payload.answers,
    )
    db.add(attempt)

    # XP — как на фронте: passing 60% = 15 XP, ≥80% = 30 XP
    if percentage >= 60:
        await add_xp(db, current, 30 if percentage >= 80 else 15)
        await check_and_award_achievements(db, current, trigger="quiz_completed")

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
