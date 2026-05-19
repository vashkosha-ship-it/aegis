"""Populate the database with initial admin user, sample books, and achievements.

Usage:
    cd backend
    python -m scripts.seed
"""
import asyncio
from datetime import date

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.achievement import Achievement
from app.models.book import Book
from app.models.user import User, UserRole


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


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        # 1. Achievements
        for spec in SEED_ACHIEVEMENTS:
            existing = await db.scalar(
                select(Achievement).where(Achievement.code == spec["code"])
            )
            if not existing:
                db.add(Achievement(**spec))
        await db.commit()
        print(f"✔ Seeded {len(SEED_ACHIEVEMENTS)} achievements")

        # 2. Admin user
        admin = await db.scalar(select(User).where(User.username == "admin"))
        if not admin:
            admin = User(
                username="admin",
                email="admin@neonstack.local",
                password_hash=hash_password("admin123"),  # TODO: change in prod!
                full_name="Administrator",
                role=UserRole.ADMIN,
            )
            db.add(admin)
            await db.commit()
            print("✔ Created admin user (username=admin, password=admin123)")
        else:
            print("✔ Admin user already exists")

        # 3. Demo reader
        reader = await db.scalar(select(User).where(User.username == "user"))
        if not reader:
            reader = User(
                username="user",
                email="user@neonstack.local",
                password_hash=hash_password("user1234"),
                full_name="Demo Reader",
                role=UserRole.READER,
                xp=150,
            )
            db.add(reader)
            await db.commit()
            print("✔ Created demo user (username=user, password=user1234)")

        # 4. Books
        for spec in SEED_BOOKS:
            existing = await db.scalar(select(Book).where(Book.title == spec["title"]))
            if not existing:
                db.add(Book(**spec))
        await db.commit()
        print(f"✔ Seeded {len(SEED_BOOKS)} sample books")

        print("\n✨ Database seeded successfully!")
        print("   Admin login: admin / admin123")
        print("   User login:  user  / user1234")


if __name__ == "__main__":
    asyncio.run(seed())
