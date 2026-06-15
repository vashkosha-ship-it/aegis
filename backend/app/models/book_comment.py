"""Book discussions — комментарии к книгам с ответами (1 уровень вложенности)."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


class BookComment(Base):
    """Комментарий к книге.

    parent_id = None  -> корневой комментарий.
    parent_id = <id>  -> ответ на корневой (дерево в один уровень).
    Ответы собираются отдельным запросом в роутере.
    """
    __tablename__ = "book_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    book_id: Mapped[int] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("book_comments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship()

    def __repr__(self) -> str:
        return f"<BookComment id={self.id} book={self.book_id} parent={self.parent_id}>"
