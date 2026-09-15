"""Сверка файлового хранилища со ссылками в базе данных."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import StorageBackend, StorageObject
from app.models.book import Book
from app.models.user import User

logger = logging.getLogger(__name__)

MANAGED_PREFIXES = ("books/pdf", "books/epub", "books/cover", "avatars")
DEFAULT_ORPHAN_GRACE_HOURS = 24


@dataclass(frozen=True, slots=True)
class StorageAudit:
    referenced_count: int
    stored_count: int
    orphan_objects: tuple[StorageObject, ...]
    recent_unreferenced_objects: tuple[StorageObject, ...]
    missing_keys: tuple[str, ...]


async def commit_with_storage_cleanup(
    db: AsyncSession,
    storage: StorageBackend,
    new_key: str,
) -> None:
    """Закоммитить ссылку на новый файл или удалить файл при сбое БД."""
    try:
        await db.commit()
    except BaseException:
        try:
            await db.rollback()
        except Exception:  # noqa: BLE001
            logger.exception("Failed to roll back DB after storing %s", new_key)
        try:
            await storage.delete(new_key)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to remove uncommitted storage object %s", new_key)
        raise


async def referenced_storage_keys(db: AsyncSession) -> set[str]:
    """Получить все непустые файловые ключи из базы."""
    keys: set[str] = set()
    rows = (
        await db.execute(
            select(
                Book.pdf_storage_key,
                Book.epub_storage_key,
                Book.cover_storage_key,
            )
        )
    ).all()
    for row in rows:
        keys.update(key for key in row if key)
    avatars = await db.scalars(select(User.avatar_url).where(User.avatar_url.is_not(None)))
    keys.update(key for key in avatars.all() if key)
    return keys


async def audit_storage(
    db: AsyncSession,
    storage: StorageBackend,
    *,
    grace_hours: int = DEFAULT_ORPHAN_GRACE_HOURS,
    now: datetime | None = None,
) -> StorageAudit:
    """Найти потерянные ссылки и файлы-сироты, не изменяя данные."""
    referenced = await referenced_storage_keys(db)
    objects = await storage.list_objects(MANAGED_PREFIXES)
    stored = {item.key: item for item in objects}
    cutoff = (now or datetime.now(UTC)) - timedelta(hours=grace_hours)
    unreferenced = [item for item in objects if item.key not in referenced]
    orphans = tuple(item for item in unreferenced if item.modified_at <= cutoff)
    recent = tuple(item for item in unreferenced if item.modified_at > cutoff)
    return StorageAudit(
        referenced_count=len(referenced),
        stored_count=len(objects),
        orphan_objects=orphans,
        recent_unreferenced_objects=recent,
        missing_keys=tuple(sorted(referenced - stored.keys())),
    )


async def delete_orphaned_storage(
    db: AsyncSession,
    storage: StorageBackend,
    *,
    grace_hours: int = DEFAULT_ORPHAN_GRACE_HOURS,
) -> tuple[StorageAudit, tuple[str, ...], tuple[str, ...]]:
    """После свежей сверки удалить только достаточно старые файлы-сироты."""
    audit = await audit_storage(db, storage, grace_hours=grace_hours)
    # Повторная выборка сужает окно гонки: старый файл могли снова привязать
    # к записи между построением отчёта и подтверждением удаления.
    current_references = await referenced_storage_keys(db)
    deleted: list[str] = []
    failed: list[str] = []
    for item in audit.orphan_objects:
        if item.key in current_references:
            continue
        try:
            await storage.delete(item.key)
            deleted.append(item.key)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to delete orphaned storage object %s", item.key)
            failed.append(item.key)
    return audit, tuple(deleted), tuple(failed)
