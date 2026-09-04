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
from contextlib import asynccontextmanager
from time import monotonic
from datetime import UTC, datetime, timedelta

from arq import cron
from sqlalchemy import delete, select

from app.core.queue import redis_settings
from app.core.storage import StorageNotFound, get_storage
from app.db.session import AsyncSessionLocal
from app.models.admin_log import AdminLog
from app.models.book import Book
from app.models.exam_session import ExamSession
from app.models.quiz_session import QuizSession
from app.models.refresh_token import RefreshToken
from app.services.search_index import index_book_from_path, spool_to_tempfile

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("aegis.worker")

WORKER_METRICS_KEY = "aegis:worker:metrics"


@asynccontextmanager
async def _measure_job(ctx: dict, job_name: str):
    """Записать счётчик, длительность и время последнего запуска задачи.

    Метрики хранятся одним небольшим hash в том же Redis, что и ARQ. Сбой
    записи метрик не должен превращать успешно выполненную индексацию в
    ошибочную задачу.
    """
    started = monotonic()
    status = "success"
    try:
        yield
    except Exception:
        status = "failed"
        raise
    finally:
        duration = monotonic() - started
        logger.info(
            "worker_metric job=%s status=%s duration_seconds=%.3f",
            job_name,
            status,
            duration,
        )
        redis = ctx.get("redis")
        if redis is not None:
            try:
                await redis.hincrby(WORKER_METRICS_KEY, f"{job_name}:{status}", 1)
                await redis.hset(
                    WORKER_METRICS_KEY,
                    mapping={
                        f"{job_name}:last_status": status,
                        f"{job_name}:last_duration_seconds": f"{duration:.3f}",
                        f"{job_name}:last_finished_at": datetime.now(UTC).isoformat(),
                    },
                )
            except Exception:  # noqa: BLE001 — метрики не ломают полезную работу
                logger.exception("Не удалось записать метрики задачи %s", job_name)



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
    async with _measure_job(ctx, "index_book"):
        logger.info("Индексация книги %s — старт", book_id)
        pages = await _index_one(book_id)
        logger.info("Индексация книги %s — готово, страниц: %d", book_id, pages)
        return {"book_id": book_id, "indexed_pages": pages}


async def index_all_books(ctx: dict) -> dict:
    """Задача: проиндексировать все книги с PDF."""
    async with _measure_job(ctx, "index_all_books"):
        return await _index_all_books()


async def _index_all_books() -> dict:
    """Проиндексировать каталог, продолжая работу после сбоя одной книги."""
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


# Сколько храним отработавшие записи после истечения срока. Не удаляем сразу:
# по ним разбирают инциденты (например, кто и когда предъявил украденный
# refresh-токен), а место они занимают немного.
KEEP_EXPIRED_DAYS = 7
# Административный audit нужен для расследований дольше обычных сессий, но
# бессрочное хранение увеличивает БД и сохраняет персональные данные без цели.
KEEP_ADMIN_LOG_DAYS = 365


async def cleanup_expired_sessions(ctx: dict) -> dict:
    """Удалить истёкшие сессии, токены и старые audit-записи."""
    async with _measure_job(ctx, "cleanup_expired_sessions"):
        return await _cleanup_expired_sessions()


async def _cleanup_expired_sessions() -> dict:
    """Реализация очистки с собственной транзакцией БД."""
    cutoff = datetime.now(UTC) - timedelta(days=KEEP_EXPIRED_DAYS)
    removed: dict[str, int] = {}

    async with AsyncSessionLocal() as db:
        for name, model in (
            ("exam_sessions", ExamSession),
            ("quiz_sessions", QuizSession),
            ("refresh_tokens", RefreshToken),
        ):
            result = await db.execute(
                delete(model).where(model.expires_at < cutoff)
            )
            removed[name] = result.rowcount or 0
        audit_cutoff = datetime.now(UTC) - timedelta(days=KEEP_ADMIN_LOG_DAYS)
        audit_result = await db.execute(
            delete(AdminLog).where(AdminLog.created_at < audit_cutoff)
        )
        removed["admin_logs"] = audit_result.rowcount or 0
        await db.commit()

    total = sum(removed.values())
    if total:
        logger.info("Очистка истёкших сессий: удалено %s", removed)
    return removed


class WorkerSettings:
    functions = [index_book, index_all_books, cleanup_expired_sessions]

    # Раз в сутки ночью подчищаем отработавшие записи. Отдельный systemd-таймер
    # не нужен: планировщик встроен в ARQ.
    cron_jobs = [
        cron(cleanup_expired_sessions, hour=4, minute=17),
    ]
    redis_settings = redis_settings()
    # Индексация упирается в диск и CPU — параллелить сильно смысла нет,
    # а память растёт линейно числу одновременных книг.
    max_jobs = 2
    # Большая книга может индексироваться долго; таймаут по умолчанию (300с) мал.
    job_timeout = 3600
    # Результаты держим сутки, чтобы фронт успел их забрать.
    keep_result = 86400
