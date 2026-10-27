"""Import all models so Alembic and SQLAlchemy can see them."""
from app.models.achievement import Achievement, UserAchievement
from app.models.admin_log import AdminLog
from app.models.app_setting import AppSetting
from app.models.book import Book
from app.models.book_comment import BookComment
from app.models.book_metadata_job import BookMetadataChange, BookMetadataJob
from app.models.book_page import BookPage
from app.models.certificate import Certificate
from app.models.chat import ChatMessage, ChatSession
from app.models.collection import Collection, collection_books
from app.models.description_job import DescriptionGenerationJob
from app.models.exam_session import ExamSession
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
from app.models.quiz_session import QuizSession
from app.models.refresh_token import RefreshToken
from app.models.usage import UsageCounter
from app.models.user import User, UserRole

__all__ = [
    "Achievement",
    "AdminLog",
    "AppSetting",
    "Annotation",
    "AnnotationType",
    "Book",
    "BookComment",
    "BookMetadataChange",
    "BookMetadataJob",
    "BookPage",
    "Certificate",
    "ChatMessage",
    "ChatSession",
    "Collection",
    "DailyPagesRead",
    "DescriptionGenerationJob",
    "ExamSession",
    "QuizSession",
    "RefreshToken",
    "MyListEntry",
    "MyListStatus",
    "QuizAttempt",
    "QuizQuestion",
    "ReadingProgress",
    "Review",
    "UsageCounter",
    "User",
    "UserAchievement",
    "UserRole",
]
