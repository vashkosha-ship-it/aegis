"""Извлечение текста из PDF и индексация для полнотекстового поиска (H).

Использует pypdf (чистый Python, без системных зависимостей).
Установка: pip install pypdf
"""
import logging

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.models.book_page import BookPage

logger = logging.getLogger(__name__)


def _extract_pages_from_pdf(data: bytes) -> list[str]:
    """Извлечь текст постранично из PDF-байтов. Возвращает список строк (по странице)."""
    try:
        from pypdf import PdfReader
    except ImportError:
        logger.error("pypdf не установлен. Выполните: pip install pypdf")
        raise

    import io

    reader = PdfReader(io.BytesIO(data))
    pages: list[str] = []
    for p in reader.pages:
        try:
            txt = p.extract_text() or ""
        except Exception:  # noqa: BLE001
            txt = ""
        # нормализуем пробелы, ограничиваем размер страницы (защита от мусора)
        txt = " ".join(txt.split())[:20000]
        pages.append(txt)
    return pages


async def index_book_content(db: AsyncSession, book_id: int, pdf_bytes: bytes) -> int:
    """Извлечь текст PDF и сохранить постранично. Возвращает число проиндексированных страниц.

    Старый текст книги удаляется перед записью нового (переиндексация).
    """
    pages = _extract_pages_from_pdf(pdf_bytes)

    # удаляем прежний индекс книги
    await db.execute(delete(BookPage).where(BookPage.book_id == book_id))

    count = 0
    for i, text in enumerate(pages, start=1):
        if not text.strip():
            continue
        db.add(BookPage(book_id=book_id, page=i, content=text))
        count += 1

    await db.commit()
    logger.info("Проиндексировано %d страниц для книги %s", count, book_id)
    return count


async def is_book_indexed(db: AsyncSession, book_id: int) -> bool:
    """Проверить, есть ли уже текстовый индекс у книги."""
    row = await db.scalar(select(BookPage.id).where(BookPage.book_id == book_id).limit(1))
    return row is not None
