"""Import all models so Alembic and SQLAlchemy can see them."""
from app.models.achievement import Achievement, UserAchievement
from app.models.admin_log import AdminLog
from app.models.book import Book
from app.models.book_comment import BookComment
from app.models.book_page import BookPage
from app.models.certificate import Certificate
from app.models.chat import ChatMessage, ChatSession
from app.models.collection import Collection, collection_books
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
    "AdminLog",
    "Annotation",
    "AnnotationType",
    "Book",
    "BookComment",
    "BookPage",
    "Certificate",
    "ChatMessage",
    "ChatSession",
    "Collection",
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