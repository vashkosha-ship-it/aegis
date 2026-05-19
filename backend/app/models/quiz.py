"""Quiz questions and user attempts — replaces state.quizData / state.completedQuizzes."""
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


class QuizQuestion(Base):
    """A single quiz question for a book."""
    __tablename__ = "quiz_questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), nullable=False)

    question: Mapped[str] = mapped_column(Text, nullable=False)
    # хранится как JSON массив строк
    options: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    correct_index: Mapped[int] = mapped_column(Integer, nullable=False)
    # 'static' — захардкожено, 'ai' — сгенерировано LLM (Этап 3)
    source: Mapped[str] = mapped_column(Text, default="static", nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    book: Mapped["Book"] = relationship(back_populates="quiz_questions")


class QuizAttempt(Base):
    """Record of a user's quiz attempt."""
    __tablename__ = "quiz_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), nullable=False)

    score: Mapped[int] = mapped_column(Integer, nullable=False)
    total: Mapped[int] = mapped_column(Integer, nullable=False)
    percentage: Mapped[int] = mapped_column(Integer, nullable=False)
    # массив выбранных индексов: [-1, 2, 0, ...]
    answers: Mapped[list[int]] = mapped_column(JSON, default=list, nullable=False)

    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="quiz_attempts")
    book: Mapped["Book"] = relationship()
