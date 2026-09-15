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
from datetime import UTC, datetime, timedelta
from time import monotonic

from arq import cron
from sqlalchemy import delete, or_, select, update
from sqlalchemy.orm import selectinload

from app.core.queue import redis_settings
from app.core.storage import StorageNotFound, get_storage
from app.db.session import AsyncSessionLocal
from app.models.admin_log import AdminLog
from app.models.book import Book
from app.models.description_job import DescriptionGenerationJob
from app.models.exam_session import ExamSession
from app.models.quiz_session import QuizSession
from app.models.refresh_token import RefreshToken
from app.services.book_descriptions import generate_book_description
from app.services.search_index import (
    IndexingError,
    index_book_from_path,
    index_epub_from_path,
    spool_to_tempfile,
)

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
    """Скачать активный файл книги и построить полнотекстовый индекс."""
    storage = get_storage()

    async with AsyncSessionLocal() as db:
        book = await db.get(Book, book_id)
        if not book:
            logger.warning("Книга %s не найдена — пропускаем", book_id)
            return 0
        book.indexing_status = "running"
        book.indexing_error = None
        book.indexing_started_at = datetime.now(UTC)
        book.indexing_finished_at = None
        await db.commit()

        try:
            if book.file_format == "epub":
                storage_key = book.epub_storage_key
                suffix = ".epub"
                indexer = index_epub_from_path
            else:
                storage_key = book.pdf_storage_key
                suffix = ".pdf"
                indexer = index_book_from_path

            if not storage_key:
                raise IndexingError("У книги нет активного файла")

            try:
                chunks = await storage.open_stream(storage_key)
            except StorageNotFound as exc:
                raise IndexingError("Файл книги отсутствует в хранилище") from exc

            path = await spool_to_tempfile(chunks, suffix=suffix)
            try:
                sections = await indexer(db, book_id, path)
            finally:
                try:
                    os.unlink(path)
                except OSError:
                    pass

            finished_at = datetime.now(UTC)
            book = await db.get(Book, book_id)
            if book:
                book.indexing_status = "succeeded"
                book.indexing_error = None
                book.indexing_finished_at = finished_at
                book.indexed_at = finished_at
                book.indexed_sections = sections
                await db.commit()
            return sections
        except Exception as exc:
            # Индексатор мог откатить свою транзакцию; статус ошибки пишем уже
            # после rollback, чтобы он не потерялся вместе с неудачной вставкой.
            await db.rollback()
            failed_book = await db.get(Book, book_id)
            if failed_book:
                failed_book.indexing_status = "failed"
                failed_book.indexing_error = f"{type(exc).__name__}: {exc}"[:2000]
                failed_book.indexing_finished_at = datetime.now(UTC)
                await db.commit()
            raise


async def index_book(ctx: dict, book_id: int) -> dict:
    """Задача: проиндексировать одну книгу."""
    async with _measure_job(ctx, "index_book"):
        logger.info("Индексация книги %s — старт", book_id)
        sections = await _index_one(book_id)
        logger.info("Индексация книги %s — готово, секций: %d", book_id, sections)
        return {"book_id": book_id, "indexed_pages": sections}


async def index_all_books(ctx: dict) -> dict:
    """Задача: проиндексировать все книги с PDF или EPUB."""
    async with _measure_job(ctx, "index_all_books"):
        return await _index_all_books()


async def _index_all_books() -> dict:
    """Проиндексировать каталог, продолжая работу после сбоя одной книги."""
    async with AsyncSessionLocal() as db:
        book_ids = list(
            (
                await db.scalars(
                    select(Book.id).where(
                        or_(
                            Book.pdf_storage_key.isnot(None),
                            Book.epub_storage_key.isnot(None),
                        )
                    )
                )
            ).all()
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


async def _record_description_result(
    job_id: str, *, succeeded: bool, error: str | None = None
) -> None:
    values = {
        "processed_books": DescriptionGenerationJob.processed_books + 1,
    }
    if error:
        values["last_error"] = error[:2000]
    counter = "succeeded_books" if succeeded else "failed_books"
    values[counter] = getattr(DescriptionGenerationJob, counter) + 1
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(DescriptionGenerationJob)
            .where(DescriptionGenerationJob.id == job_id)
            .values(**values)
        )
        await db.commit()


async def generate_missing_book_descriptions(
    ctx: dict, job_id: str, book_ids: list[int]
) -> dict:
    """Создать отсутствующие описания, не удерживая HTTP-соединение."""
    async with _measure_job(ctx, "generate_missing_book_descriptions"):
        try:
            async with AsyncSessionLocal() as db:
                job = await db.get(DescriptionGenerationJob, job_id)
                if job is None:
                    raise RuntimeError(f"Задача описаний {job_id} не найдена")
                job.status = "running"
                job.started_at = datetime.now(UTC)
                job.finished_at = None
                job.processed_books = 0
                job.succeeded_books = 0
                job.failed_books = 0
                job.last_error = None
                await db.commit()

            for book_id in book_ids:
                try:
                    async with AsyncSessionLocal() as db:
                        book = await db.scalar(
                            select(Book)
                            .options(selectinload(Book.categories))
                            .where(Book.id == book_id)
                        )
                        if book is None:
                            raise RuntimeError("Книга удалена до создания описания")
                        if book.description.strip():
                            await _record_description_result(job_id, succeeded=True)
                            continue
                        title = book.title
                        author = book.author
                        categories = [category.name for category in book.categories]

                    description = await generate_book_description(
                        title=title,
                        author=author,
                        categories=categories,
                    )
                    if not description:
                        raise RuntimeError("ИИ вернул пустое описание")

                    async with AsyncSessionLocal() as db:
                        book = await db.get(Book, book_id)
                        if book is None:
                            raise RuntimeError("Книга удалена до сохранения описания")
                        if not book.description.strip():
                            book.description = description
                        await db.commit()
                    await _record_description_result(job_id, succeeded=True)
                except Exception as exc:  # noqa: BLE001 — продолжаем остальные книги
                    message = f"Книга {book_id}: {type(exc).__name__}: {exc}"
                    logger.warning("Не удалось создать описание: %s", message)
                    await _record_description_result(
                        job_id, succeeded=False, error=message
                    )

            async with AsyncSessionLocal() as db:
                job = await db.get(DescriptionGenerationJob, job_id)
                if job:
                    job.status = "completed"
                    job.finished_at = datetime.now(UTC)
                    await db.commit()
                    result = {
                        "job_id": job.id,
                        "total_books": job.total_books,
                        "succeeded_books": job.succeeded_books,
                        "failed_books": job.failed_books,
                    }
                else:
                    result = {"job_id": job_id, "status": "missing"}
            logger.info("Массовые ИИ-описания завершены: %s", result)
            return result
        except Exception as exc:
            async with AsyncSessionLocal() as db:
                job = await db.get(DescriptionGenerationJob, job_id)
                if job:
                    job.status = "failed"
                    job.last_error = f"{type(exc).__name__}: {exc}"[:2000]
                    job.finished_at = datetime.now(UTC)
                    await db.commit()
            raise


async def recover_interrupted_indexing(_ctx: dict) -> None:
    """Закрыть состояния running, оставшиеся после перезапуска воркера.

    Иначе аварийно прерванная книга навсегда выглядит как индексирующаяся и
    администратор не получает кнопку повторного запуска.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            update(Book)
            .where(Book.indexing_status == "running")
            .values(
                indexing_status="failed",
                indexing_error="Индексация прервана перезапуском воркера",
                indexing_finished_at=datetime.now(UTC),
            )
        )
        await db.commit()
        if result.rowcount:
            logger.warning(
                "После перезапуска отмечено прерванных индексаций: %d",
                result.rowcount,
            )
        descriptions = await db.execute(
            update(DescriptionGenerationJob)
            .where(DescriptionGenerationJob.status == "running")
            .values(
                status="failed",
                last_error="Создание описаний прервано перезапуском воркера",
                finished_at=datetime.now(UTC),
            )
        )
        await db.commit()
        if descriptions.rowcount:
            logger.warning(
                "После перезапуска отмечено прерванных задач описаний: %d",
                descriptions.rowcount,
            )
        stale_queued = await db.execute(
            update(DescriptionGenerationJob)
            .where(
                DescriptionGenerationJob.status == "queued",
                DescriptionGenerationJob.created_at
                < datetime.now(UTC) - timedelta(hours=6),
            )
            .values(
                status="failed",
                last_error="Задача не была запущена воркером за 6 часов",
                finished_at=datetime.now(UTC),
            )
        )
        await db.commit()
        if stale_queued.rowcount:
            logger.warning(
                "Отмечено зависших в очереди задач описаний: %d",
                stale_queued.rowcount,
            )


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
        description_result = await db.execute(
            delete(DescriptionGenerationJob).where(
                DescriptionGenerationJob.created_at < audit_cutoff,
                DescriptionGenerationJob.status.in_(("completed", "failed")),
            )
        )
        removed["description_generation_jobs"] = description_result.rowcount or 0
        await db.commit()

    total = sum(removed.values())
    if total:
        logger.info("Очистка истёкших сессий: удалено %s", removed)
    return removed


class WorkerSettings:
    functions = [
        index_book,
        index_all_books,
        generate_missing_book_descriptions,
        cleanup_expired_sessions,
    ]
    on_startup = recover_interrupted_indexing

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
    job_timeout = 21600
    # Результаты держим сутки, чтобы фронт успел их забрать.
    keep_result = 86400
