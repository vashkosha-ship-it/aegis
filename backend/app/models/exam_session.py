"""Сессия экзамена на сертификат.

Раньше активные экзамены лежали в словаре в памяти процесса (`_active_exams`).
Это давало три проблемы:
  * при рестарте/деплое все идущие экзамены терялись;
  * при нескольких воркерах gunicorn экзамен, начатый в одном процессе,
    не находился в другом;
  * главное — токен удалялся только при успешной выдаче сертификата, поэтому
    провалившийся пользователь мог отправлять ответы повторно и по
    `correct_count` постепенно подобрать правильные варианты.

Теперь сессия живёт в БД, помечается использованной при первой отправке,
а результат фиксируется — повторный submit возвращает сохранённый результат
и не пересчитывает ответы.
"""
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.session import Base


class ExamSession(Base):
    __tablename__ = "exam_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    category: Mapped[str] = mapped_column(String(128), nullable=False)

    # Правильные индексы ответов. Клиенту не отдаются никогда.
    correct: Mapped[list] = mapped_column(JSON, nullable=False)
    total: Mapped[int] = mapped_column(Integer, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Результат первой (и единственной) отправки
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    correct_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    passed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    def __repr__(self) -> str:
        return f"<ExamSession token={self.token[:8]}… user={self.user_id} used={bool(self.submitted_at)}>"
