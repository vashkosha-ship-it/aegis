from __future__ import annotations

import io
from datetime import UTC, datetime

import pytest

from app.core.storage import LocalStorage, S3Storage, StorageError, StorageNotFound
from scripts.migrate_storage_to_s3 import build_plan, execute_plan


class FakeClientError(Exception):
    def __init__(self, code: str = "404") -> None:
        self.response = {"Error": {"Code": code}}


class FakeS3Client:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}
        self.extra_args: dict | None = None

    def upload_fileobj(self, fileobj, bucket, key, ExtraArgs=None):
        self.objects[(bucket, key)] = fileobj.read()
        self.extra_args = ExtraArgs

    def delete_object(self, *, Bucket, Key):
        self.objects.pop((Bucket, Key), None)

    def head_object(self, *, Bucket, Key):
        try:
            payload = self.objects[(Bucket, Key)]
        except KeyError as exc:
            raise FakeClientError() from exc
        return {"ContentLength": len(payload)}

    def get_object(self, *, Bucket, Key, Range=None):
        try:
            payload = self.objects[(Bucket, Key)]
        except KeyError as exc:
            raise FakeClientError("NoSuchKey") from exc
        if Range:
            start, end = (int(value) for value in Range.removeprefix("bytes=").split("-"))
            payload = payload[start:end + 1]
        return {"Body": io.BytesIO(payload)}

    def list_objects_v2(self, *, Bucket, Prefix, ContinuationToken=None):
        assert ContinuationToken is None
        contents = [
            {
                "Key": key,
                "Size": len(payload),
                "LastModified": datetime(2026, 9, 16, tzinfo=UTC),
            }
            for (bucket, key), payload in sorted(self.objects.items())
            if bucket == Bucket and key.startswith(Prefix)
        ]
        return {"Contents": contents, "IsTruncated": False}


async def _chunks(*parts: bytes):
    for part in parts:
        yield part


async def test_s3_round_trip_range_listing_and_delete(monkeypatch):
    from app.core import storage as storage_module

    monkeypatch.setattr(storage_module.settings, "S3_SERVER_SIDE_ENCRYPTION", "AES256")
    client = FakeS3Client()
    storage = S3Storage(bucket="private-books", prefix="prod", client=client)

    saved = await storage.save_stream(
        "books/pdf/book.pdf",
        _chunks(b"abc", b"def"),
        max_bytes=6,
    )
    assert saved == 6
    assert client.objects[("private-books", "prod/books/pdf/book.pdf")] == b"abcdef"
    assert client.extra_args == {
        "ContentType": "application/pdf",
        "ServerSideEncryption": "AES256",
    }
    assert await storage.exists("books/pdf/book.pdf") is True
    assert await storage.size("books/pdf/book.pdf") == 6

    stream = await storage.open_stream("books/pdf/book.pdf")
    assert b"".join([part async for part in stream]) == b"abcdef"
    byte_range = await storage.open_range("books/pdf/book.pdf", 1, 4)
    assert b"".join([part async for part in byte_range]) == b"bcde"

    objects = await storage.list_objects(("books/pdf", "books/cover"))
    assert [(item.key, item.size_bytes) for item in objects] == [
        ("books/pdf/book.pdf", 6)
    ]

    await storage.delete("books/pdf/book.pdf")
    assert await storage.exists("books/pdf/book.pdf") is False
    with pytest.raises(StorageNotFound):
        await storage.size("books/pdf/book.pdf")


async def test_s3_rejects_oversize_and_unsafe_keys():
    client = FakeS3Client()
    storage = S3Storage(bucket="books", client=client)

    with pytest.raises(StorageError, match="maximum size"):
        await storage.save_stream("books/pdf/large.pdf", _chunks(b"123"), max_bytes=2)
    assert not client.objects

    with pytest.raises(ValueError, match="Invalid storage key"):
        await storage.save_stream("books/pdf/../../secret", _chunks(b"x"), max_bytes=1)


async def test_s3_readiness_probe_is_removed():
    client = FakeS3Client()
    storage = S3Storage(bucket="books", prefix="prod", client=client)

    await storage.check_writable()

    assert client.objects == {}


async def test_migration_is_resumable_and_detects_conflicts(tmp_path):
    local = LocalStorage(tmp_path)
    await local.save_stream("books/pdf/a.pdf", _chunks(b"pdf"), max_bytes=3)
    await local.save_stream("books/cover/a.jpg", _chunks(b"cover"), max_bytes=5)
    client = FakeS3Client()
    target = S3Storage(bucket="books", client=client)
    client.objects[("books", "books/pdf/a.pdf")] = b"pdf"
    client.objects[("books", "books/cover/a.jpg")] = b"wrong-size"

    plan = await build_plan(local, target)
    assert plan.upload == ()
    assert plan.unchanged == (("books/pdf/a.pdf", 3),)
    assert plan.conflicts == (("books/cover/a.jpg", 5, 10),)

    with pytest.raises(RuntimeError, match="другого размера"):
        await execute_plan(local, target, plan, overwrite=False)

    await execute_plan(local, target, plan, overwrite=True)
    verified = await build_plan(local, target)
    assert verified.upload == ()
    assert verified.conflicts == ()
    assert len(verified.unchanged) == 2
