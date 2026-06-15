"""Admin audit log — журнал действий администраторов."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


class AdminLog(Base):
    """Запись о действии администратора (загрузка/удаление/изменение)."""
    __tablename__ = "admin_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    admin_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    admin_username: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    # тип действия: book_create / book_update / book_delete / pdf_upload / cover_upload / reindex / ...
    action: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    # на что направлено: например "book:42"
    target: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # человекочитаемое описание
    detail: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    admin: Mapped["User"] = relationship()

    def __repr__(self) -> str:
        return f"<AdminLog id={self.id} action={self.action} by={self.admin_username}>"
