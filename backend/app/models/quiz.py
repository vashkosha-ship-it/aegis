"""Сессия прохождения теста по книге.

Раньше клиент сам присылал `question_ids` вместе с ответами, то есть сервер
верил на слово, на какой набор вопросов отвечает пользователь. Проверки на
количество и дубли закрывали грубые случаи, но подменить состав вопросов
(например, выбрать 15 самых лёгких из пула) было по-прежнему можно.

Теперь набор фиксируется на сервере при выдаче теста: GET /quiz создаёт
сессию и возвращает её id, а POST /quiz/submit принимает только id сессии и
ответы. Сама сессия одноразовая — повторная отправка вернёт зафиксированный
результат, а не пересчитает новые ответы.
"""
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.session import Base


class QuizSession(Base):
    __tablename__ = "quiz_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    book_id: Mapped[int] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"), index=True, nullable=False
    )

    # id вопросов в том порядке, в котором они были отданы клиенту
    question_ids: Mapped[list] = mapped_column(JSON, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Результат первой отправки — фиксируется, чтобы повторный submit не
    # позволял подбирать ответы по возвращаемому score.
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    percentage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    xp_awarded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    def __repr__(self) -> str:
        return f"<QuizSession book={self.book_id} user={self.user_id} used={bool(self.submitted_at)}>"