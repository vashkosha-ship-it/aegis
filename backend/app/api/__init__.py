"""Сборка всех API-роутеров под префиксом /api.

Единая точка подключения: main.py включает только api_router и ничего не знает
про отдельные модули. Раньше пять роутеров подключались напрямую в main.py
посреди файла — их легко было потерять из виду, а импорты в середине модуля
ломали порядок инициализации.
"""
from fastapi import APIRouter

from app.api import (
    achievements,
    admin,
    assistant,
    auth,
    books,
    certificates,
    chats,
    collections,
    discussions,
    library,
    me,
    onboarding,
    quizzes,
    search,
)

api_router = APIRouter(prefix="/api")

# Аутентификация и профиль
api_router.include_router(auth.router)
api_router.include_router(me.router)
api_router.include_router(me.users_router)
api_router.include_router(onboarding.router)

# Библиотека
api_router.include_router(books.router)
api_router.include_router(library.router)
api_router.include_router(collections.router)
api_router.include_router(search.router)
api_router.include_router(discussions.router)

# Обучение и прогресс
api_router.include_router(quizzes.router)
api_router.include_router(certificates.router)
api_router.include_router(achievements.router)

# AI
api_router.include_router(assistant.router)
api_router.include_router(chats.router)

# Администрирование
api_router.include_router(admin.router)
