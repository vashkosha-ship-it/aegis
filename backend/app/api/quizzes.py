"""Quiz endpoints: get questions, submit answers, list attempts."""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_user
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
from app.services.deepseek_client import DeepSeekError, chat_completion

logger = logging.getLogger(__name__)

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
        {
            "question": "Какая атака заставляет пользователя выполнить нежелательное действие в авторизованной сессии?",
            "options": ["CSRF", "XSS", "Path Traversal", "Clickjacking"],
            "correct_index": 0,
        },
        {
            "question": "Чем опасна SQL-инъекция?",
            "options": [
                "Позволяет выполнять произвольные запросы к БД",
                "Замедляет загрузку страницы",
                "Меняет цвет интерфейса",
                "Очищает кэш браузера",
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
        {
            "question": "Чем отличается статический анализ от динамического?",
            "options": [
                "Статический — без запуска кода, динамический — с запуском",
                "Это одно и то же",
                "Статический медленнее динамического",
                "Динамический не требует образца ВПО",
            ],
            "correct_index": 0,
        },
        {
            "question": "Что такое packer (упаковщик) в контексте ВПО?",
            "options": [
                "Инструмент сжатия/обфускации исполняемого файла",
                "Антивирусный движок",
                "Менеджер паролей",
                "Протокол передачи файлов",
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
        {
            "question": "Что обычно делают на фазе постэксплуатации?",
            "options": [
                "Закрепление в системе и сбор данных",
                "Сканирование портов",
                "Сбор открытых источников",
                "Написание ТЗ на пентест",
            ],
            "correct_index": 0,
        },
        {
            "question": "Какой фреймворк используется для разработки и запуска эксплойтов?",
            "options": ["Metasploit", "Wireshark", "Nessus", "Splunk"],
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
        {
            "question": "В чём суть асимметричной криптографии?",
            "options": [
                "Пара ключей: открытый и закрытый",
                "Один общий секретный ключ",
                "Отсутствие ключей",
                "Только хеширование",
            ],
            "correct_index": 0,
        },
        {
            "question": "Для чего нужна цифровая подпись?",
            "options": [
                "Подтверждение подлинности и целостности",
                "Ускорение передачи данных",
                "Сжатие файлов",
                "Шифрование трафика в реальном времени",
            ],
            "correct_index": 0,
        },
    ],
}

# Базовый набор из 5 общих вопросов — fallback, когда нет шаблона под категорию.
GENERIC_QUIZ: list[dict] = [
    {
        "question": "Что входит в триаду информационной безопасности (CIA)?",
        "options": [
            "Конфиденциальность, целостность, доступность",
            "Скорость, дизайн, цена",
            "Логи, бэкапы, антивирус",
            "Сеть, сервер, клиент",
        ],
        "correct_index": 0,
    },
    {
        "question": "Что такое фишинг?",
        "options": [
            "Обман пользователя ради получения данных",
            "Сканирование портов",
            "Шифрование диска",
            "Резервное копирование",
        ],
        "correct_index": 0,
    },
    {
        "question": "Зачем нужна многофакторная аутентификация (MFA)?",
        "options": [
            "Дополнительный фактор защиты помимо пароля",
            "Ускорение входа",
            "Сжатие трафика",
            "Резервное копирование паролей",
        ],
        "correct_index": 0,
    },
    {
        "question": "Что такое уязвимость нулевого дня (zero-day)?",
        "options": [
            "Неизвестная разработчику уязвимость без патча",
            "Уязвимость, исправленная в день выпуска",
            "Ошибка в дизайне интерфейса",
            "Просроченный сертификат",
        ],
        "correct_index": 0,
    },
    {
        "question": "Принцип наименьших привилегий означает:",
        "options": [
            "Давать ровно те права, что нужны для задачи",
            "Давать всем права администратора",
            "Запрещать любой доступ",
            "Выдавать права по выслуге лет",
        ],
        "correct_index": 0,
    },
]


_AI_QUIZ_PROMPT = (
    "Ты — методист по информационной безопасности. Составь тест из 5 вопросов "
    "с вариантами ответа по книге. Тема книги: «{title}»"
    "{author}{cats}{desc}.\n\n"
    "Требования:\n"
    "- ровно 5 вопросов;\n"
    "- у каждого 4 варианта ответа;\n"
    "- только один правильный;\n"
    "- вопросы по сути темы книги (кибербезопасность), разной сложности;\n"
    "- на русском языке.\n\n"
    "Верни СТРОГО валидный JSON без markdown и пояснений, в формате:\n"
    '{{"questions":[{{"question":"...","options":["A","B","C","D"],"correct_index":0}}]}}'
)


async def _generate_ai_quiz(book: Book) -> list[dict] | None:
    """Сгенерировать тест через DeepSeek. None при любой неудаче."""
    try:
        cat_names = [c.name for c in (book.categories or [])]
    except Exception:
        cat_names = []

    author = f", автор: {book.author}" if getattr(book, "author", None) else ""
    cats = f", категории: {', '.join(cat_names)}" if cat_names else ""
    desc = ""
    if getattr(book, "description", None):
        desc = f". Описание: {book.description[:1500]}"

    prompt = _AI_QUIZ_PROMPT.format(title=book.title, author=author, cats=cats, desc=desc)

    try:
        raw = await chat_completion(
            [{"role": "user", "content": prompt}],
            system_prompt="Ты генерируешь тесты строго в формате JSON.",
        )
    except DeepSeekError as e:
        logger.warning("AI quiz generation failed for book %s: %s", book.id, e)
        return None

    # Вырезаем JSON (на случай markdown-обёртки ```json ... ```)
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        logger.warning("AI quiz: no JSON braces for book %s", book.id)
        return None
    try:
        data = json.loads(text[start:end + 1])
        questions = data["questions"]
    except (ValueError, KeyError, TypeError) as e:
        logger.warning("AI quiz: bad JSON for book %s: %s", book.id, e)
        return None

    # Валидация структуры
    cleaned: list[dict] = []
    for q in questions:
        try:
            qt = str(q["question"]).strip()
            opts = [str(o).strip() for o in q["options"]]
            ci = int(q["correct_index"])
        except (KeyError, TypeError, ValueError):
            continue
        if qt and len(opts) >= 2 and 0 <= ci < len(opts):
            cleaned.append({"question": qt, "options": opts, "correct_index": ci})

    if len(cleaned) < 3:
        logger.warning("AI quiz: too few valid questions (%d) for book %s", len(cleaned), book.id)
        return None
    return cleaned[:5]


async def _ensure_quiz_for_book(db: AsyncSession, book: Book) -> list[QuizQuestion]:
    """Lazily generate static quiz for a book if none exists yet."""
    existing = (
        await db.scalars(select(QuizQuestion).where(QuizQuestion.book_id == book.id))
    ).all()
    if existing:
        return list(existing)

    # 1) Пробуем сгенерировать тест через ИИ (DeepSeek)
    ai_questions = await _generate_ai_quiz(book)
    if ai_questions:
        new_questions = [
            QuizQuestion(
                book_id=book.id,
                question=t["question"],
                options=t["options"],
                correct_index=t["correct_index"],
                source="ai",
            )
            for t in ai_questions
        ]
        db.add_all(new_questions)
        await db.commit()
        for q in new_questions:
            await db.refresh(q)
        logger.info("AI quiz created for book %s (%d questions)", book.id, len(new_questions))
        return new_questions

    # 2) Fallback: статический шаблон по категории, иначе общий
    template: list[dict] = []
    try:
        book_cat_names = [c.name for c in (book.categories or [])]
    except Exception:
        book_cat_names = []
    for name in book_cat_names:
        if name in CATEGORY_QUIZZES:
            template = CATEGORY_QUIZZES[name]
            break

    if not template:
        template = GENERIC_QUIZ

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
    book = (
        await db.scalars(
            select(Book).options(selectinload(Book.categories)).where(Book.id == book_id)
        )
    ).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    questions = await _ensure_quiz_for_book(db, book)
    return [QuizQuestionPublic.model_validate(q) for q in questions]


from sqlalchemy import delete as sa_delete


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
    book = (
        await db.scalars(
            select(Book).options(selectinload(Book.categories)).where(Book.id == book_id)
        )
    ).first()
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