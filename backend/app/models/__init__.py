"""Import all models so Alembic and SQLAlchemy can see them."""
from app.models.achievement import Achievement, UserAchievement
from app.models.book import Book
from app.models.library import (
    Annotation,
    AnnotationType,
    DailyPagesRead,
    MyListEntry,
    MyListStatus,
    ReadingProgress,
    Review,
)
from app.models.quiz import QuizAttempt, QuizQuestion
from app.models.user import User, UserRole

__all__ = [
    "Achievement",
    "Annotation",
    "AnnotationType",
    "Book",
    "DailyPagesRead",
    "MyListEntry",
    "MyListStatus",
    "QuizAttempt",
    "QuizQuestion",
    "ReadingProgress",
    "Review",
    "User",
    "UserAchievement",
    "UserRole",
]
