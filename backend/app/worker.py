"""Воркер фоновых задач (ARQ).

Запуск: arq app.worker.WorkerSettings
В проде — systemd-юнит aegis-worker.

Задачи здесь не зависят от FastAPI: своя сессия БД, своё подключение к
хранилищу. Всё, что приходит извне — примитивы (id книги), потому что
аргументы задачи сериализуются в Redis.
"""
from __future__ import annotations

import logging
import os

from sqlalchemy import select

from app.core.queue import redis_settings
from app.core.storage import StorageNotFound, get_storage
from app.db.session import AsyncSessionLocal
from app.models.book import Book
from app.services.search_index import index_book_from_path, spool_to_tempfile

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("aegis.worker")


async def _index_one(book_id: int) -> int:
    """Скачать PDF во временный файл и проиндексировать. Возвращает число страниц."""
    storage = get_storage()

    async with AsyncSessionLocal() as db:
        book = await db.get(Book, book_id)
        if not book or not book.pdf_storage_key:
            logger.warning("Книга %s без PDF — пропускаем", book_id)
            return 0

        try:
            chunks = await storage.open_stream(book.pdf_storage_key)
        except StorageNotFound:
            logger.warning("PDF книги %s не найден в хранилище", book_id)
            return 0

        path = await spool_to_tempfile(chunks)
        try:
            return await index_book_from_path(db, book_id, path)
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass


async def index_book(ctx: dict, book_id: int) -> dict:
    """Задача: проиндексировать одну книгу."""
    logger.info("Индексация книги %s — старт", book_id)
    pages = await _index_one(book_id)
    logger.info("Индексация книги %s — готово, страниц: %d", book_id, pages)
    return {"book_id": book_id, "indexed_pages": pages}


async def index_all_books(ctx: dict) -> dict:
    """Задача: проиндексировать все книги с PDF.

    Книги обрабатываются по одной: так пиковая память не зависит от размера
    каталога, а сбой на одной книге не отменяет остальные.
    """
    async with AsyncSessionLocal() as db:
        book_ids = list(
            (await db.scalars(select(Book.id).where(Book.pdf_storage_key.isnot(None)))).all()
        )

    logger.info("Массовая индексация: %d книг", len(book_ids))
    indexed_books = 0
    indexed_pages = 0
    failed = 0

    for book_id in book_ids:
        try:
            pages = await _index_one(book_id)
            indexed_pages += pages
            indexed_books += 1
        except Exception as e:  # noqa: BLE001 — одна книга не должна валить всё
            logger.warning("Книга %s: ошибка индексации: %s", book_id, e)
            failed += 1

    result = {
        "total_books": len(book_ids),
        "indexed_books": indexed_books,
        "indexed_pages": indexed_pages,
        "failed": failed,
    }
    logger.info("Массовая индексация завершена: %s", result)
    return result


class WorkerSettings:
    functions = [index_book, index_all_books]
    redis_settings = redis_settings()
    # Индексация упирается в диск и CPU — параллелить сильно смысла нет,
    # а память растёт линейно числу одновременных книг.
    max_jobs = 2
    # Большая книга может индексироваться долго; таймаут по умолчанию (300с) мал.
    job_timeout = 3600
    # Результаты держим сутки, чтобы фронт успел их забрать.
    keep_result = 86400
