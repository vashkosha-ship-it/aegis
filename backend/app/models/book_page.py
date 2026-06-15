"""Book full-text content — извлечённый текст PDF для полнотекстового поиска (H)."""
from sqlalchemy import ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class BookPage(Base):
    """Текст одной страницы книги. Используется для полнотекстового поиска
    и для показа, на какой странице найдено совпадение.

    search_vector (tsvector) заполняется триггером/при индексации;
    в ORM он не маппится напрямую — работаем через SQL-выражения.
    """
    __tablename__ = "book_pages"
    __table_args__ = (
        UniqueConstraint("book_id", "page", name="uq_book_page"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    book_id: Mapped[int] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True
    )
    page: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")

    book: Mapped["Book"] = relationship()
