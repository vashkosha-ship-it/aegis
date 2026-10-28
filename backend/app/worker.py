"""Воркер фоновых задач (ARQ).

Запуск: arq app.worker.WorkerSettings
В проде — systemd-юнит aegis-worker.

Задачи здесь не зависят от FastAPI: своя сессия БД, своё подключение к
хранилищу. Всё, что приходит извне — примитивы (id книги), потому что
аргументы задачи сериализуются в Redis.
"""
from __future__ import annotations

import asyncio
import hashlib
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
from app.models.book_metadata_job import BookMetadataJob
from app.models.description_job import DescriptionGenerationJob
from app.models.exam_session import ExamSession
from app.models.quiz_session import QuizSession
from app.models.refresh_token import RefreshToken
from app.services.book_autofill import autofill_book, review_and_fix_book
from app.services.book_descriptions import (
    generate_book_description,
    load_book_content_excerpt,
)
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
    except Exception as exc:
        status = "failed"
        from app.services.error_reporting import report_exception

        report_exception(exc, path=f"/worker/{job_name}", source="worker")
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


def _sha256_of_file(path: str) -> str | None:
    """SHA-256 файла; None, если прочитать не удалось (индексации не мешает)."""
    digest = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError:
        logger.warning("Не удалось посчитать хеш файла %s", path)
        return None
    return digest.hexdigest()


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
                # Книги, загруженные до появления проверки дубликатов, получают
                # хеш при первой же индексации — так их находит «Дубликаты».
                file_sha256 = await asyncio.to_thread(_sha256_of_file, path)
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
                if file_sha256 and not getattr(book, "file_sha256", None):
                    book.file_sha256 = file_sha256
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


async def _autofill_after_indexing(book_id: int) -> list[str]:
    """Дозаполнить название, автора, темы и описание по тексту книги.

    Сбой модели не делает индексацию неуспешной: текст уже в индексе, а
    карточку админ может поправить вручную.
    """
    try:
        async with AsyncSessionLocal() as db:
            changed = await autofill_book(db, book_id)
    except Exception:  # noqa: BLE001 — автозаполнение не должно ронять задачу
        logger.exception("Автозаполнение карточки книги %s не удалось", book_id)
        return []
    if changed:
        logger.info("Карточка книги %s заполнена автоматически: %s", book_id, ", ".join(changed))
    return changed


async def index_book(ctx: dict, book_id: int) -> dict:
    """Задача: проиндексировать одну книгу и дозаполнить её карточку."""
    async with _measure_job(ctx, "index_book"):
        logger.info("Индексация книги %s — старт", book_id)
        sections = await _index_one(book_id)
        logger.info("Индексация книги %s — готово, секций: %d", book_id, sections)
        autofilled = await _autofill_after_indexing(book_id) if sections else []
        if sections:
            await _enqueue_quiz_generation(ctx, book_id)
        return {"book_id": book_id, "indexed_pages": sections, "autofilled": autofilled}


# --- Тесты по книгам ------------------------------------------------------
# Генерация AI-теста идёт здесь, а не в запросе пользователя: модель отвечает
# десятки секунд. Неудачную попытку запоминаем в Redis, чтобы периодическая
# задача не дёргала модель по одной и той же книге каждые десять минут.
QUIZ_FAILURE_KEY = "aegis:quiz:failed:{book_id}"
QUIZ_FAILURE_TTL_SECONDS = 6 * 3600
QUIZ_BATCH_PER_RUN = 5


async def _enqueue_quiz_generation(ctx: dict, book_id: int) -> None:
    """Поставить генерацию теста; сбой очереди не роняет индексацию."""
    redis = ctx.get("redis")
    if redis is None:
        return
    try:
        await redis.delete(QUIZ_FAILURE_KEY.format(book_id=book_id))
        await redis.enqueue_job("generate_book_quiz", book_id, _job_id=f"quiz:{book_id}")
    except Exception:  # noqa: BLE001
        logger.exception("Не удалось поставить генерацию теста книги %s", book_id)


async def _quiz_recently_failed(ctx: dict, book_id: int) -> bool:
    redis = ctx.get("redis")
    if redis is None:
        return False
    try:
        return bool(await redis.exists(QUIZ_FAILURE_KEY.format(book_id=book_id)))
    except Exception:  # noqa: BLE001
        return False


async def _remember_quiz_failure(ctx: dict, book_id: int) -> None:
    redis = ctx.get("redis")
    if redis is None:
        return
    try:
        await redis.set(
            QUIZ_FAILURE_KEY.format(book_id=book_id), "1", ex=QUIZ_FAILURE_TTL_SECONDS
        )
    except Exception:  # noqa: BLE001
        logger.warning("Не удалось запомнить неудачу генерации теста книги %s", book_id)


async def _generate_quiz(ctx: dict, book_id: int) -> str:
    """Сгенерировать AI-тест одной книги. Возвращает итог для логов."""
    from app.services.quizzes import upgrade_quiz_for_book

    async with AsyncSessionLocal() as db:
        book = (
            await db.scalars(
                select(Book).options(selectinload(Book.categories)).where(Book.id == book_id)
            )
        ).first()
        if not book:
            return "missing"
        try:
            rows = await upgrade_quiz_for_book(db, book)
        except Exception:  # noqa: BLE001 — одна книга не должна валить проход
            logger.exception("Генерация теста книги %s упала", book_id)
            await db.rollback()
            rows = None
    if rows:
        return "ok"
    await _remember_quiz_failure(ctx, book_id)
    return "failed"


async def generate_book_quiz(ctx: dict, book_id: int) -> dict:
    """Задача: AI-тест для одной книги (после индексации)."""
    async with _measure_job(ctx, "generate_book_quiz"):
        result = await _generate_quiz(ctx, book_id)
        logger.info("Тест книги %s: %s", book_id, result)
        return {"book_id": book_id, "result": result}


async def generate_missing_quizzes(ctx: dict) -> dict:
    """Периодическая задача: заменить временные тесты на AI-тесты.

    За проход берём несколько книг, чтобы не занимать воркер надолго и не
    расходовать лимит модели разом; остальные дойдут в следующих проходах.
    """
    from app.services.quizzes import books_needing_ai_quiz

    async with _measure_job(ctx, "generate_missing_quizzes"):
        async with AsyncSessionLocal() as db:
            # Запас по выборке: часть книг могла недавно не получиться.
            candidates = await books_needing_ai_quiz(db, limit=QUIZ_BATCH_PER_RUN * 10)

        results: dict[str, int] = {}
        attempted = 0
        for book_id in candidates:
            if attempted >= QUIZ_BATCH_PER_RUN:
                break
            if await _quiz_recently_failed(ctx, book_id):
                continue
            attempted += 1
            outcome = await _generate_quiz(ctx, book_id)
            results[outcome] = results.get(outcome, 0) + 1
        if attempted:
            logger.info("Генерация недостающих тестов: %s", results)
        return {"attempted": attempted, **results}


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
    skipped = 0

    for book_id in book_ids:
        # Книга больше не ждёт индексации: администратор остановил массовую
        # переиндексацию (кнопка «Остановить») или книгу уже проиндексировала
        # отдельная задача. Пропускаем — так остановка не требует убивать
        # задачу в очереди.
        async with AsyncSessionLocal() as db:
            current = await db.scalar(select(Book.indexing_status).where(Book.id == book_id))
        if current != "queued":
            skipped += 1
            continue
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
        "skipped": skipped,
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
                        content_excerpt = await load_book_content_excerpt(db, book.id)

                    description = await generate_book_description(
                        title=title,
                        author=author,
                        categories=categories,
                        content_excerpt=content_excerpt,
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


# Сколько книг проверять одновременно: запросы к модели идут параллельно,
# а БД и воркер при этом почти не нагружены.
METADATA_REVIEW_CONCURRENCY = 4


async def _bump_metadata_job(job_id: str, outcome: str, error: str | None = None) -> None:
    counters = {
        "changed": "changed_books",
        "unchanged": None,
        "skipped": "skipped_books",
        "failed": "failed_books",
    }
    values = {"processed_books": BookMetadataJob.processed_books + 1}
    column = counters.get(outcome)
    if column:
        values[column] = getattr(BookMetadataJob, column) + 1
    if error:
        values["last_error"] = error[:2000]
    async with AsyncSessionLocal() as db:
        await db.execute(update(BookMetadataJob).where(BookMetadataJob.id == job_id).values(**values))
        await db.commit()


async def review_book_metadata_bulk(ctx: dict, job_id: str, book_ids: list[int]) -> dict:
    """Проверить и исправить названия, авторов и теги книг по их тексту."""
    async with _measure_job(ctx, "review_book_metadata_bulk"):
        try:
            async with AsyncSessionLocal() as db:
                job = await db.get(BookMetadataJob, job_id)
                if job is None:
                    raise RuntimeError(f"Задача проверки карточек {job_id} не найдена")
                if job.status != "queued":
                    # Задачу поднимали в начало очереди — эту копию уже
                    # выполнили или выполняют.
                    return {"job_id": job_id, "skipped": job.status}
                job.status = "running"
                job.started_at = datetime.now(UTC)
                job.finished_at = None
                await db.commit()

            semaphore = asyncio.Semaphore(METADATA_REVIEW_CONCURRENCY)

            async def review(book_id: int) -> None:
                async with semaphore:
                    try:
                        async with AsyncSessionLocal() as db:
                            outcome = await review_and_fix_book(db, book_id, job_id=job_id)
                        await _bump_metadata_job(job_id, outcome)
                    except Exception as exc:  # noqa: BLE001 — одна книга не валит остальные
                        message = f"Книга {book_id}: {type(exc).__name__}: {exc}"
                        logger.warning("Не удалось проверить карточку: %s", message)
                        await _bump_metadata_job(job_id, "failed", message)

            await asyncio.gather(*(review(book_id) for book_id in book_ids))

            async with AsyncSessionLocal() as db:
                job = await db.get(BookMetadataJob, job_id)
                result = {"job_id": job_id}
                if job:
                    job.status = "completed"
                    job.finished_at = datetime.now(UTC)
                    await db.commit()
                    result.update(
                        total_books=job.total_books,
                        changed_books=job.changed_books,
                        failed_books=job.failed_books,
                    )
            logger.info("Проверка карточек завершена: %s", result)
            return result
        except Exception as exc:
            async with AsyncSessionLocal() as db:
                job = await db.get(BookMetadataJob, job_id)
                if job:
                    job.status = "failed"
                    job.last_error = f"{type(exc).__name__}: {exc}"[:2000]
                    job.finished_at = datetime.now(UTC)
                    await db.commit()
            raise


async def on_worker_startup(ctx: dict) -> None:
    """Действия при старте воркера (то есть после каждой выкладки)."""
    await recover_interrupted_indexing(ctx)
    await requeue_stuck_indexing(ctx)
    await _clean_offtopic_quizzes()


async def _clean_offtopic_quizzes() -> None:
    """Убрать вопросы «про ИБ вообще» из старых временных тестов.

    Идемпотентно: после первого прохода находить нечего. Сбой не мешает
    воркеру стартовать — тесты всё равно заменит периодическая генерация.
    """
    from app.services.quizzes import remove_offtopic_temporary_questions

    try:
        async with AsyncSessionLocal() as db:
            removed = await remove_offtopic_temporary_questions(db)
    except Exception:  # noqa: BLE001
        logger.exception("Очистка временных тестов не удалась")
        return
    if removed:
        logger.info(
            "Из временных тестов убраны вопросы не по теме: книг %d, вопросов %d",
            len(removed), sum(item["removed"] for item in removed),
        )


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


async def requeue_stuck_indexing(ctx: dict) -> int:
    """Вернуть в очередь книги, чья задача индексации пропала.

    Массовая переиндексация — одна долгая задача на весь каталог. Если воркер
    падает посреди неё (книга не влезла в память, выкладка), задача теряется,
    а оставшиеся книги навсегда висят «в очереди». При старте ставим каждой
    такой книге собственную задачу. Задачи, которые ещё ждут в очереди, не
    трогаем; «выполняется» при старте означает, что выполнял её умерший
    процесс (воркер один, и сам он ещё ничего не начал).
    """
    redis = ctx.get("redis")
    if redis is None:
        return 0
    from arq.jobs import Job, JobStatus

    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(Book.id, Book.indexing_job_id).where(Book.indexing_status == "queued")
        )).all()
    if not rows:
        return 0

    waiting: dict[str, bool] = {}
    for job_id in {job_id for _book_id, job_id in rows if job_id}:
        try:
            status = await Job(job_id, redis).status()
        except Exception:  # noqa: BLE001 — неизвестно: считаем пропавшей
            status = None
        waiting[job_id] = status in (JobStatus.queued, JobStatus.deferred)

    stuck = [book_id for book_id, job_id in rows if not (job_id and waiting.get(job_id))]
    requeued = 0
    for book_id in stuck:
        try:
            job = await redis.enqueue_job("index_book", book_id)
        except Exception:  # noqa: BLE001
            logger.exception("Не удалось вернуть в очередь книгу %s", book_id)
            continue
        if job is None:
            continue
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(Book)
                .where(Book.id == book_id, Book.indexing_status == "queued")
                .values(indexing_job_id=job.job_id)
            )
            await db.commit()
        requeued += 1
    if requeued:
        logger.warning("Возвращено в очередь книг с пропавшей задачей индексации: %d", requeued)
    return requeued


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
        review_book_metadata_bulk,
        cleanup_expired_sessions,
        generate_book_quiz,
        generate_missing_quizzes,
    ]
    on_startup = on_worker_startup

    # Раз в сутки ночью подчищаем отработавшие записи. Отдельный systemd-таймер
    # не нужен: планировщик встроен в ARQ. Временные тесты заменяем на
    # AI-тесты каждые десять минут, по несколько книг за раз.
    cron_jobs = [
        cron(cleanup_expired_sessions, hour=4, minute=17),
        cron(generate_missing_quizzes, minute={3, 13, 23, 33, 43, 53}),
    ]
    redis_settings = redis_settings()
    # Индексация упирается в диск и CPU — параллелить сильно смысла нет,
    # а память растёт линейно числу одновременных книг.
    max_jobs = 2
    # Большая книга может индексироваться долго; таймаут по умолчанию (300с) мал.
    job_timeout = 21600
    # Результаты держим сутки, чтобы фронт успел их забрать.
    keep_result = 86400
