"""Quiz endpoints: get questions, submit answers, list attempts."""
import json
import logging
import random

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete as sa_delete, select
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
        {
            "question": "Что лучше всего защищает от SQL-инъекций?",
            "options": [
                "Параметризованные (подготовленные) запросы",
                "Конкатенация строк в запросе",
                "Отключение логирования",
                "Увеличение таймаута запроса",
            ],
            "correct_index": 0,
        },
        {
            "question": "Что такое SSRF?",
            "options": [
                "Подделка запросов на стороне сервера (Server-Side Request Forgery)",
                "Клиентский скрипт в браузере",
                "Переполнение буфера",
                "Атака на DNS-кэш",
            ],
            "correct_index": 0,
        },
        {
            "question": "Для чего нужен флаг HttpOnly у cookie?",
            "options": [
                "Запретить доступ к cookie из JavaScript",
                "Зашифровать содержимое cookie",
                "Ускорить загрузку страницы",
                "Продлить срок жизни cookie",
            ],
            "correct_index": 0,
        },
        {
            "question": "Какой риск в первую очередь снижает атрибут cookie SameSite?",
            "options": ["CSRF", "XSS", "SQL-инъекции", "DoS"],
            "correct_index": 0,
        },
        {
            "question": "Что описывает OWASP Top 10?",
            "options": [
                "Наиболее критичные риски веб-приложений",
                "Уязвимости только мобильных приложений",
                "Список сетевых протоколов",
                "Аппаратные закладки",
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
        {
            "question": "Что такое IOC (Indicator of Compromise)?",
            "options": [
                "Признак компрометации: хеши, IP, домены, артефакты",
                "Тип антивирусной лицензии",
                "Модель процессора",
                "Версия операционной системы",
            ],
            "correct_index": 0,
        },
        {
            "question": "Что делает обфускация кода?",
            "options": [
                "Затрудняет анализ, усложняя восприятие кода",
                "Ускоряет выполнение программы",
                "Шифрует жёсткий диск",
                "Сжимает сетевой трафик",
            ],
            "correct_index": 0,
        },
        {
            "question": "Что такое persistence (закрепление) у ВПО?",
            "options": [
                "Механизм автозапуска после перезагрузки системы",
                "Удаление следов присутствия",
                "Сканирование сети",
                "Подбор пароля",
            ],
            "correct_index": 0,
        },
        {
            "question": "Что такое C2 (Command and Control)?",
            "options": [
                "Сервер управления заражёнными хостами",
                "Антивирусное облако",
                "Среда разработки",
                "Менеджер обновлений ОС",
            ],
            "correct_index": 0,
        },
        {
            "question": "Что такое реверс-инжиниринг ВПО?",
            "options": [
                "Анализ логики вредоноса без исходного кода",
                "Написание антивируса с нуля",
                "Шифрование образца",
                "Резервное копирование системы",
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
        {
            "question": "Что такое OSINT?",
            "options": [
                "Разведка по открытым источникам",
                "Сканер уязвимостей",
                "Эксплойт-фреймворк",
                "Тип межсетевого экрана",
            ],
            "correct_index": 0,
        },
        {
            "question": "Что такое privilege escalation?",
            "options": [
                "Повышение собственных прав в системе",
                "Сканирование портов",
                "Сбор журналов событий",
                "Шифрование данных",
            ],
            "correct_index": 0,
        },
        {
            "question": "Чем black-box отличается от white-box тестирования?",
            "options": [
                "В black-box нет сведений о внутреннем устройстве системы",
                "Это полностью одно и то же",
                "White-box не требует согласия владельца",
                "Black-box всегда быстрее white-box",
            ],
            "correct_index": 0,
        },
        {
            "question": "Какой инструмент применяют для перехвата и анализа HTTP-трафика веб-приложения?",
            "options": ["Burp Suite", "nmap", "John the Ripper", "Hashcat"],
            "correct_index": 0,
        },
        {
            "question": "Зачем нужен этап «Отчёт» в пентесте?",
            "options": [
                "Зафиксировать находки и дать рекомендации по устранению",
                "Удалить все логи в системе",
                "Запустить дополнительные эксплойты",
                "Просканировать соседние сети",
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
        {
            "question": "Что такое соль (salt) при хешировании паролей?",
            "options": [
                "Случайные данные, добавляемые к паролю перед хешированием",
                "Алгоритм симметричного шифрования",
                "Тип цифрового сертификата",
                "Сетевой протокол обмена ключами",
            ],
            "correct_index": 0,
        },
        {
            "question": "Чем хеширование отличается от шифрования?",
            "options": [
                "Хеширование необратимо, шифрование обратимо при наличии ключа",
                "Это полные синонимы",
                "Хеширование всегда требует пары ключей",
                "Шифрование всегда необратимо",
            ],
            "correct_index": 0,
        },
        {
            "question": "Что обеспечивает протокол Диффи–Хеллмана?",
            "options": [
                "Согласование общего секрета по небезопасному каналу",
                "Подписание документов",
                "Сжатие данных",
                "Хеширование паролей",
            ],
            "correct_index": 0,
        },
        {
            "question": "Что такое PKI?",
            "options": [
                "Инфраструктура открытых ключей",
                "Протокол маршрутизации",
                "Менеджер паролей",
                "Журналируемая файловая система",
            ],
            "correct_index": 0,
        },
        {
            "question": "Почему MD5 не рекомендуется для защиты паролей?",
            "options": [
                "Уязвим к коллизиям и слишком быстр для перебора",
                "Слишком медленный для любых задач",
                "Требует платной лицензии",
                "Не поддерживает кириллицу",
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
    {
        "question": "Что такое социальная инженерия?",
        "options": [
            "Манипуляция людьми ради доступа или данных",
            "Проектирование компьютерных сетей",
            "Методология разработки ПО",
            "Настройка серверного оборудования",
        ],
        "correct_index": 0,
    },
    {
        "question": "Что такое DDoS-атака?",
        "options": [
            "Отказ в обслуживании за счёт множества источников",
            "Кража паролей через фишинг",
            "Внедрение SQL-запросов",
            "Перехват электронной почты",
        ],
        "correct_index": 0,
    },
    {
        "question": "Для чего нужны резервные копии (backup)?",
        "options": [
            "Восстановление данных после сбоя или атаки",
            "Ускорение работы приложения",
            "Шифрование сетевого трафика",
            "Сканирование открытых портов",
        ],
        "correct_index": 0,
    },
    {
        "question": "Что обеспечивает VPN?",
        "options": [
            "Защищённый туннель для передачи данных",
            "Антивирусную защиту файлов",
            "Ускорение работы браузера",
            "Хранение паролей",
        ],
        "correct_index": 0,
    },
    {
        "question": "Что описывает модель угроз STRIDE?",
        "options": [
            "Категории угроз: спуфинг, подмена, отказ и др.",
            "Этапы пентеста по фазам",
            "Уровни модели OSI",
            "Список алгоритмов шифрования",
        ],
        "correct_index": 0,
    },
]


_AI_QUIZ_PROMPT = (
    "Ты — методист по информационной безопасности. Составь тест из 15 вопросов "
    "с вариантами ответа по книге. Тема книги: «{title}»"
    "{author}{cats}{desc}.\n\n"
    "Требования:\n"
    "- ровно 15 вопросов;\n"
    "- у каждого 4 варианта ответа;\n"
    "- только один правильный;\n"
    "- вопросы по сути темы книги (кибербезопасность), разной сложности;\n"
    "- не повторяй вопросы, формулируй их по-разному;\n"
    "- на русском языке.\n\n"
    "Верни СТРОГО валидный JSON без markdown и пояснений, в формате:\n"
    '{{"questions":[{{"question":"...","options":["A","B","C","D"],"correct_index":0}}]}}'
)


# Сколько вопросов отдаём пользователю за одну попытку.
QUIZ_SERVE_COUNT = 15


def _shuffle_options(item: dict) -> dict:
    """Перемешать варианты ответа, скорректировав correct_index.

    Иначе правильный ответ всегда стоит первым ('A') — его легко угадать.
    """
    opts = list(item["options"])
    correct_text = opts[item["correct_index"]]
    random.shuffle(opts)
    return {
        "question": item["question"],
        "options": opts,
        "correct_index": opts.index(correct_text),
    }


def _select_questions(questions: list) -> list:
    """Случайная выборка до QUIZ_SERVE_COUNT вопросов в перемешанном порядке.

    За счёт случайной выборки каждый повторный запрос теста («Пройти заново»)
    даёт новый набор/порядок вопросов, пока пул в БД больше QUIZ_SERVE_COUNT.
    """
    pool = list(questions)
    random.shuffle(pool)
    return pool[:QUIZ_SERVE_COUNT]


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

    if len(cleaned) < 5:
        logger.warning("AI quiz: too few valid questions (%d) for book %s", len(cleaned), book.id)
        return None
    return cleaned[:18]


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
                question=s["question"],
                options=s["options"],
                correct_index=s["correct_index"],
                source="ai",
            )
            for s in (_shuffle_options(t) for t in ai_questions)
        ]
        db.add_all(new_questions)
        await db.commit()
        for q in new_questions:
            await db.refresh(q)
        logger.info("AI quiz created for book %s (%d questions)", book.id, len(new_questions))
        return new_questions

    # 2) Fallback: пул из шаблона по категории + общих вопросов (чтобы было >15
    #    и выборка/перемешивание давали разнообразие). Дедуп по тексту вопроса.
    template: list[dict] = []
    try:
        book_cat_names = [c.name for c in (book.categories or [])]
    except Exception:
        book_cat_names = []
    for name in book_cat_names:
        if name in CATEGORY_QUIZZES:
            template = list(CATEGORY_QUIZZES[name])
            break

    pool: list[dict] = list(template) + list(GENERIC_QUIZ)
    # Если книга без совпавшей категории — добираем вопросы из других банков,
    # чтобы пул был заметно больше QUIZ_SERVE_COUNT и выборка давала разнообразие.
    if len(pool) < QUIZ_SERVE_COUNT + 3:
        for _name, _bank in CATEGORY_QUIZZES.items():
            pool += list(_bank)
    seen: set[str] = set()
    unique_pool: list[dict] = []
    for t in pool:
        key = t["question"].strip().lower()
        if key in seen:
            continue
        seen.add(key)
        unique_pool.append(t)

    new_questions = [
        QuizQuestion(
            book_id=book.id,
            question=s["question"],
            options=s["options"],
            correct_index=s["correct_index"],
            source="static",
        )
        for s in (_shuffle_options(t) for t in unique_pool)
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
    return [QuizQuestionPublic.model_validate(q) for q in _select_questions(questions)]


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


class QuizSubmitIn(BaseModel):
    """Ответы пользователя.

    answers — выбранные индексы вариантов в том же порядке, в котором
    вопросы пришли с GET /quiz. question_ids — id этих вопросов в том же
    порядке (нужно, т.к. тест отдаётся случайной выборкой/перемешиванием).
    question_ids опционален ради обратной совместимости со старым клиентом.
    """
    answers: list[int]
    question_ids: list[int] | None = None


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

    all_questions = await _ensure_quiz_for_book(db, book)

    if payload.question_ids:
        # Скоринг по конкретным вопросам, которые видел пользователь
        if len(payload.answers) != len(payload.question_ids):
            raise HTTPException(
                status_code=400,
                detail="answers and question_ids length mismatch",
            )
        by_id = {q.id: q for q in all_questions}
        graded = []
        for qid in payload.question_ids:
            q = by_id.get(qid)
            if q is None:
                raise HTTPException(
                    status_code=400, detail=f"Unknown question id {qid}"
                )
            graded.append(q)
    else:
        # Старый клиент: ответы по всем вопросам в порядке хранения
        graded = all_questions
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