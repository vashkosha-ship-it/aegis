"""Проверки компенсации загрузок и сверки файлового хранилища."""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta

import pytest

from app.core.storage import LocalStorage
from app.models.book import Book
from app.services.storage_integrity import (
    audit_storage,
    commit_with_storage_cleanup,
    delete_orphaned_storage,
)


async def _save(storage: LocalStorage, key: str, payload: bytes = b"file") -> None:
    async def chunks():
        yield payload

    await storage.save_stream(key, chunks(), max_bytes=1024)


@pytest.mark.asyncio
async def test_storage_audit_and_cleanup_respect_references_and_grace_period(db, tmp_path):
    storage = LocalStorage(tmp_path)
    now = datetime.now(UTC)
    referenced_key = "books/pdf/referenced.pdf"
    orphan_key = "books/cover/orphan.jpg"
    recent_key = "avatars/recent.jpg"
    missing_key = "books/epub/missing.epub"

    await _save(storage, referenced_key)
    await _save(storage, orphan_key, b"orphan")
    await _save(storage, recent_key, b"recent")
    old_timestamp = (now - timedelta(days=2)).timestamp()
    os.utime(tmp_path / orphan_key, (old_timestamp, old_timestamp))

    db.add(
        Book(
            title="Сверка файлов",
            author="Aegis",
            description="",
            pdf_storage_key=referenced_key,
            cover_storage_key=missing_key,
        )
    )
    await db.commit()

    audit = await audit_storage(db, storage, grace_hours=24, now=now)
    assert audit.referenced_count == 2
    assert audit.stored_count == 3
    assert [item.key for item in audit.orphan_objects] == [orphan_key]
    assert [item.key for item in audit.recent_unreferenced_objects] == [recent_key]
    assert audit.missing_keys == (missing_key,)

    _audit, deleted, failed = await delete_orphaned_storage(
        db, storage, grace_hours=24
    )
    assert deleted == (orphan_key,)
    assert failed == ()
    assert not await storage.exists(orphan_key)
    assert await storage.exists(referenced_key)
    assert await storage.exists(recent_key)


@pytest.mark.asyncio
async def test_failed_db_commit_removes_new_storage_object():
    class FailingDb:
        rolled_back = False

        async def commit(self):
            raise RuntimeError("database unavailable")

        async def rollback(self):
            self.rolled_back = True

    class RecordingStorage:
        deleted: list[str] = []

        async def delete(self, key: str):
            self.deleted.append(key)

    db = FailingDb()
    storage = RecordingStorage()
    with pytest.raises(RuntimeError, match="database unavailable"):
        await commit_with_storage_cleanup(db, storage, "books/pdf/new.pdf")
    assert db.rolled_back is True
    assert storage.deleted == ["books/pdf/new.pdf"]
