"""Pydantic schemas for book endpoints.

Изменения:
- category: str  →  categories: list[str]
- На входе (Create/Update) — массив имён категорий. Категории создаются автоматически,
  если ещё нет в БД.
- На выходе (Public) — массив имён.
"""
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator


class BookBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    author: str = Field(min_length=1, max_length=255)
    categories: list[str] = Field(default_factory=list)
    description: str = ""
    icon: str = "📘"

    @field_validator("categories")
    @classmethod
    def validate_categories(cls, v: list[str]) -> list[str]:
        """Очищаем и дедуплицируем категории.

        - Убираем пустые строки и пробелы по краям
        - Категория не длиннее 64 символов
        - Дубликаты убираются (с сохранением порядка)
        """
        seen = set()
        result = []
        for cat in v:
            name = (cat or "").strip()
            if not name:
                continue
            if len(name) > 64:
                raise ValueError(f"Категория слишком длинная: «{name[:30]}…» (макс 64 символа)")
            # Регистронезависимая дедупликация
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            result.append(name)
        return result


class BookCreate(BookBase):
    date_published: date | None = None


class BookUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    author: str | None = Field(default=None, max_length=255)
    categories: list[str] | None = None
    description: str | None = None
    icon: str | None = None

    @field_validator("categories")
    @classmethod
    def validate_categories(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        seen = set()
        result = []
        for cat in v:
            name = (cat or "").strip()
            if not name:
                continue
            if len(name) > 64:
                raise ValueError(f"Категория слишком длинная: «{name[:30]}…» (макс 64 символа)")
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            result.append(name)
        return result


class BookPublic(BookBase):
    id: int
    rating: Decimal
    views: int
    downloads: int
    popularity: int
    total_pages: int
    has_pdf: bool = False
    has_cover: bool = False
    date_published: date | None
    created_at: datetime

    class Config:
        from_attributes = True


class BookListResponse(BaseModel):
    items: list[BookPublic]
    total: int
    page: int
    per_page: int


# --- Этап 2: ответы на загрузку файлов --------------------------------------


class BookFileUploadResult(BaseModel):
    """Возвращается после успешной загрузки PDF или обложки.

    book_id     — id книги, к которой привязан файл.
    kind        — "pdf" или "cover".
    size_bytes  — фактический размер записанного файла.
    replaced    — true, если загрузка заменила существующий файл.
    """

    book_id: int
    kind: str
    size_bytes: int
    replaced: bool
