"""Book model — replaces frontend state.books.

Изменения от прошлой версии:
- УБРАНО поле book.category (одна строка)
- ДОБАВЛЕНА связь many-to-many с новой моделью Category через таблицу book_categories
"""
from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


# Связующая таблица many-to-many между books и categories
book_categories = Table(
    "book_categories",
    Base.metadata,
    Column("book_id", ForeignKey("books.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True),
)


class Category(Base):
    """Справочник категорий книг.

    Создаются автоматически при создании/обновлении книги (если категории
    с таким именем ещё нет). Удаляются вручную через админку (если будет).
    """
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    books: Mapped[list["Book"]] = relationship(
        secondary=book_categories,
        back_populates="categories",
    )

    def __repr__(self) -> str:
        return f"<Category id={self.id} name={self.name!r}>"


class Book(Base):
    __tablename__ = "books"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    author: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    icon: Mapped[str] = mapped_column(Text, nullable=False, default="📚")

    # Файлы — на Этапе 1 храним только ключи в S3, сами файлы пока опциональны
    pdf_storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    cover_storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    total_pages: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Метрики (бывшие state.bookViews / bookDownloads)
    views: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    downloads: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    popularity: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    rating: Mapped[float] = mapped_column(Numeric(3, 2), default=0.0, nullable=False)

    date_published: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Связи
    categories: Mapped[list["Category"]] = relationship(
        secondary=book_categories,
        back_populates="books",
        lazy="selectin",  # автоматически подгружаем при загрузке книги
    )
    reviews: Mapped[list["Review"]] = relationship(
        back_populates="book", cascade="all, delete-orphan"
    )
    quiz_questions: Mapped[list["QuizQuestion"]] = relationship(
        back_populates="book", cascade="all, delete-orphan"
    )
    annotations: Mapped[list["Annotation"]] = relationship(
        back_populates="book", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Book id={self.id} title={self.title!r}>"
