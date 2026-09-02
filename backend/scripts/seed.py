"""Наполнение базы начальными данными: администратор, достижения, примеры книг.

Использование (локальная разработка):
    cd backend
    SEED_ADMIN_PASSWORD='...' python -m scripts.seed

Первичная настройка боевого сервера:
    cd backend
    SEED_ADMIN_PASSWORD='...' python -m scripts.seed --allow-production

Два правила, которых здесь раньше не было.

Пароль администратора берётся только из переменной окружения. Прежде он был
зашит в код («admin123», с пометкой TODO поменять в проде) и печатался в
консоль при каждом запуске — то есть оседал в логах деплоя, в истории
терминала и в выводе CI. Пароль по умолчанию, известный всем, кто видел
репозиторий, — это не пароль.

В production скрипт не запускается без явного разрешения. Seed создаёт
демонстрационные книги и учебного пользователя; случайный запуск на боевом
сервере (перепутанная директория, скопированная из README команда) добавил бы
в библиотеку мусор и завёл лишний аккаунт. Флаг --allow-production нужен для
первичной настройки и только для неё: демо-данные не создаются даже с ним.
"""
import argparse
import asyncio
import os
import sys
from datetime import date

from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.achievement import Achievement
from app.models.book import Book
from app.models.user import User, UserRole

# Минимальная длина пароля администратора. Для боевого сервера требование
# строже: этот аккаунт может всё, а подобрать короткий пароль недолго.
MIN_PASSWORD_LENGTH_DEV = 8
MIN_PASSWORD_LENGTH_PROD = 16


SEED_ACHIEVEMENTS = [
    {
        "code": "ach_reading_1",
        "name": "Первая книга",
        "description": "Начните читать любую книгу",
        "icon": "🥉",
        "tier": "bronze",
    },
    {
        "code": "ach_quiz_1",
        "name": "Знаток",
        "description": "Пройдите свой первый тест",
        "icon": "🦉",
        "tier": "silver",
    },
    {
        "code": "xp_1000",
        "name": "Опытный",
        "description": "Накопите 1000 XP",
        "icon": "⭐",
        "tier": "silver",
    },
    {
        "code": "review_1",
        "name": "Рецензент",
        "description": "Напишите свой первый отзыв",
        "icon": "💬",
        "tier": "bronze",
    },
]


SEED_BOOKS = [
    {
        "title": "Web Application Hacker's Handbook",
        "author": "Dafydd Stuttard",
        "category": "Веб-безопасность",
        "icon": "🌐",
        "description": "Фундаментальное руководство по безопасности веб-приложений.",
        "popularity": 95,
        "date_published": date(2020, 3, 15),
    },
    {
        "title": "Practical Malware Analysis",
        "author": "Michael Sikorski",
        "category": "Анализ ВПО",
        "icon": "🦠",
        "description": "Практическое руководство по анализу вредоносного ПО.",
        "popularity": 82,
        "date_published": date(2018, 7, 1),
    },
    {
        "title": "Metasploit: The Penetration Tester's Guide",
        "author": "David Kennedy",
        "category": "Пентест",
        "icon": "🎯",
        "description": "Официальное руководство по Metasploit Framework.",
        "popularity": 78,
        "date_published": date(2019, 12, 10),
    },
    {
        "title": "Applied Cryptography",
        "author": "Bruce Schneier",
        "category": "Криптография",
        "icon": "🔐",
        "description": "Классический труд по криптографии Брюса Шнайера.",
        "popularity": 91,
        "date_published": date(2021, 5, 20),
    },
]


class SeedRefused(RuntimeError):
    """Запуск не разрешён — причина в сообщении."""


def _is_production() -> bool:
    return not settings.DEBUG


def _read_admin_password(production: bool) -> str:
    """Пароль администратора из окружения. Без него скрипт не работает."""
    password = os.environ.get("SEED_ADMIN_PASSWORD", "")
    if not password:
        raise SeedRefused(
            "Не задана переменная SEED_ADMIN_PASSWORD.\n"
            "Пароль администратора задаётся только через окружение — в коде "
            "его быть не должно.\n"
            "  SEED_ADMIN_PASSWORD='...' python -m scripts.seed"
        )

    minimum = MIN_PASSWORD_LENGTH_PROD if production else MIN_PASSWORD_LENGTH_DEV
    if len(password) < minimum:
        raise SeedRefused(
            f"Пароль администратора короче {minimum} символов. "
            "Этот аккаунт имеет полный доступ, подобрать короткий пароль недолго."
        )
    return password


def _check_environment(allow_production: bool) -> bool:
    """Вернуть True, если это боевой запуск. Бросить, если он не разрешён."""
    production = _is_production()
    if production and not allow_production:
        raise SeedRefused(
            "Обнаружено production-окружение (DEBUG=false), запуск остановлен.\n"
            "Seed добавляет демонстрационные книги и учебного пользователя — на "
            "боевом сервере им не место.\n"
            "Если это первичная настройка, повтори с --allow-production: тогда "
            "будут созданы только достижения и учётная запись администратора."
        )
    return production


async def _seed_achievements(db) -> None:
    for spec in SEED_ACHIEVEMENTS:
        existing = await db.scalar(
            select(Achievement).where(Achievement.code == spec["code"])
        )
        if not existing:
            db.add(Achievement(**spec))
    await db.commit()
    print(f"Достижения: {len(SEED_ACHIEVEMENTS)} шт.")


async def _seed_admin(db, password: str) -> None:
    admin = await db.scalar(select(User).where(User.username == "admin"))
    if admin:
        # Существующий пароль не трогаем: скрипт могут запустить повторно, и
        # молча сменить пароль администратора — плохой сюрприз.
        print("Администратор уже существует, пароль не изменён")
        return

    # is_verified и is_approved обязательны.
    #
    # По умолчанию оба False, и созданный так администратор не смог бы войти:
    # вход отказывает неподтверждённым, а с недавних пор и зависимость
    # аутентификации тоже. Раньше это сходило с рук, потому что проверка
    # подтверждения существовала только на входе.
    #
    # Подтверждать администратора письмом некому и незачем: его заводит тот,
    # у кого есть доступ к серверу, и владение ящиком тут ничего не добавляет.
    db.add(User(
        username="admin",
        email="admin@neonstack.local",
        password_hash=hash_password(password),
        full_name="Administrator",
        role=UserRole.ADMIN,
        is_verified=True,
        is_approved=True,
    ))
    await db.commit()
    # Пароль не печатаем: вывод скрипта попадает в логи деплоя и в историю
    # терминала. Тот, кто запускает, и так его знает — он его и задал.
    print("Создан администратор (username=admin)")


async def _seed_demo_data(db) -> None:
    """Учебный пользователь и книги-примеры. Только для разработки."""
    reader = await db.scalar(select(User).where(User.username == "user"))
    if not reader:
        password = os.environ.get("SEED_DEMO_PASSWORD", "")
        if not password:
            print(
                "Демо-пользователь пропущен: не задана SEED_DEMO_PASSWORD"
            )
        else:
            db.add(User(
                username="user",
                email="user@neonstack.local",
                password_hash=hash_password(password),
                full_name="Demo Reader",
                role=UserRole.READER,
                xp=150,
                is_verified=True,
                is_approved=True,
            ))
            await db.commit()
            print("Создан демо-пользователь (username=user)")

    for spec in SEED_BOOKS:
        existing = await db.scalar(select(Book).where(Book.title == spec["title"]))
        if not existing:
            db.add(Book(**spec))
    await db.commit()
    print(f"Книги-примеры: {len(SEED_BOOKS)} шт.")


async def seed(allow_production: bool = False) -> None:
    production = _check_environment(allow_production)
    password = _read_admin_password(production)

    async with AsyncSessionLocal() as db:
        await _seed_achievements(db)
        await _seed_admin(db, password)

        if production:
            print("Демо-данные пропущены: боевое окружение")
        else:
            await _seed_demo_data(db)

    print("\nГотово.")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Наполнить базу начальными данными.",
    )
    parser.add_argument(
        "--allow-production",
        action="store_true",
        help="Разрешить запуск при DEBUG=false (первичная настройка сервера). "
             "Демо-данные не создаются в любом случае.",
    )
    args = parser.parse_args()

    try:
        asyncio.run(seed(allow_production=args.allow_production))
    except SeedRefused as e:
        print(f"\n{e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
