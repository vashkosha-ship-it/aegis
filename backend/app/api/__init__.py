"""Aggregate all API routers under /api prefix."""
from fastapi import APIRouter

from app.api import achievements, admin, auth, books, library, quizzes
from app.api import me
from app.api import onboarding

from app.api.assistant import router as assistant_router

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(books.router)
api_router.include_router(library.router)
api_router.include_router(quizzes.router)
api_router.include_router(achievements.router)
api_router.include_router(admin.router)
api_router.include_router(me.router)
api_router.include_router(me.users_router)
api_router.include_router(onboarding.router)
api_router.include_router(assistant_router)