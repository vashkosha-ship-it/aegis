"""Абстракция файлового хранилища Aegis."""
from __future__ import annotations

import asyncio
import mimetypes
import tempfile
import uuid
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import aiofiles
import aiofiles.os

from app.core.config import settings

# --- ошибки -----------------------------------------------------------------


class StorageError(Exception):
    """Базовая ошибка слоя хранилища."""


class StorageNotFound(StorageError):
    """Запрашиваемого ключа нет в хранилище."""


@dataclass(frozen=True, slots=True)
class StorageObject:
    """Метаданные объекта без раскрытия абсолютного пути хранилища."""

    key: str
    size_bytes: int
    modified_at: datetime


# --- интерфейс --------------------------------------------------------------


class StorageBackend(ABC):
    """Абстракция над хранилищем бинарных файлов.

    Ключ (key) — это относительный путь внутри хранилища, например
    "books/pdf/8f3a1b2c.pdf". Бэкенд сам решает, как его материализовать.
    """

    @abstractmethod
    async def save_stream(
        self,
        key: str,
        chunks: AsyncIterator[bytes],
        max_bytes: int,
    ) -> int:
        """Сохранить поток байтов под ключом. Вернуть итоговый размер.

        Если поток превышает max_bytes — поднять StorageError и удалить
        частично записанный файл (атомарность на уровне «или всё, или ничего»).
        """

    @abstractmethod
    async def delete(self, key: str) -> None:
        """Удалить файл. Если ключа нет — молча проигнорировать (идемпотентно)."""

    @abstractmethod
    async def exists(self, key: str) -> bool:
        ...

    @abstractmethod
    async def size(self, key: str) -> int:
        """Размер в байтах. StorageNotFound, если ключа нет."""

    @abstractmethod
    async def open_stream(self, key: str) -> AsyncIterator[bytes]:
        """Асинхронный итератор по чанкам — для StreamingResponse."""

    @abstractmethod
    async def open_range(self, key: str, start: int, end: int) -> AsyncIterator[bytes]:
        """Итератор по байтам [start, end] включительно — для HTTP Range (206).

        start/end — абсолютные смещения в файле (end включительно, как в HTTP).
        StorageNotFound, если ключа нет.
        """

    async def list_objects(self, prefixes: tuple[str, ...]) -> list[StorageObject]:
        """Перечислить объекты под управляемыми префиксами.

        Не абстрактный метод сохраняет совместимость с тестовыми и будущими
        реализациями хранилища. Бэкенд обязан реализовать его до включения
        сверки файлов.
        """
        raise StorageError("Storage backend does not support object listing")

    async def check_writable(self) -> None:
        """Проверить полный цикл записи, чтения и удаления маленького объекта."""
        key = self.make_key("_health", ".probe")
        saved = False

        async def _payload() -> AsyncIterator[bytes]:
            yield b"ok"

        try:
            await self.save_stream(key, _payload(), max_bytes=2)
            saved = True
            if await self.size(key) != 2:
                raise StorageError("Storage readiness probe has unexpected size")
            stream = await self.open_stream(key)
            if b"".join([chunk async for chunk in stream]) != b"ok":
                raise StorageError("Storage readiness probe returned unexpected data")
        finally:
            if saved:
                await self.delete(key)

    # Утилита: генерация нового уникального ключа.
    # Здесь, а не в роутере, чтобы при переезде на S3 можно было
    # подмешать в ключ префикс/шардинг без правок в API.
    @staticmethod
    def make_key(prefix: str, suffix: str) -> str:
        """prefix='books/pdf', suffix='.pdf' -> 'books/pdf/<uuid>.pdf'."""
        return f"{prefix.strip('/')}/{uuid.uuid4().hex}{suffix}"


# --- локальная реализация ---------------------------------------------------


class LocalStorage(StorageBackend):
    """Хранение файлов в локальной папке."""

    # Размер чанка для чтения/записи. 1 МБ — хороший баланс для PDF.
    CHUNK_SIZE = 1024 * 1024

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    # --- внутреннее ---------------------------------------------------------

    def _resolve(self, key: str) -> Path:
        """Безопасно превратить key в абсолютный путь.

        Защита от path traversal: после resolve() путь обязан быть
        внутри self.root, иначе ValueError. Это критично — иначе
        злонамеренный ключ "../../etc/passwd" утечёт за пределы хранилища.
        """
        if not key or key.startswith("/") or "\\" in key:
            raise ValueError(f"Invalid storage key: {key!r}")
        path = (self.root / key).resolve()
        # Path.is_relative_to доступен с Python 3.9
        if not path.is_relative_to(self.root):
            raise ValueError(f"Key escapes storage root: {key!r}")
        return path

    # --- API ---------------------------------------------------------------

    async def save_stream(
        self,
        key: str,
        chunks: AsyncIterator[bytes],
        max_bytes: int,
    ) -> int:
        path = self._resolve(key)
        await aiofiles.os.makedirs(path.parent, exist_ok=True)

        # Пишем во временный файл, в конце атомарно переименовываем —
        # чтобы наполовину записанный PDF никогда не оказался под живым ключом.
        tmp = path.with_suffix(path.suffix + ".part")
        written = 0
        try:
            async with aiofiles.open(tmp, "wb") as f:
                async for chunk in chunks:
                    written += len(chunk)
                    if written > max_bytes:
                        raise StorageError(
                            f"File exceeds maximum size of {max_bytes} bytes"
                        )
                    await f.write(chunk)
            # os.replace атомарен в рамках одной ФС
            await asyncio.to_thread(tmp.replace, path)
            return written
        except BaseException:
            # Чистим частичный файл на любой ошибке (включая отмену)
            try:
                await aiofiles.os.remove(tmp)
            except FileNotFoundError:
                pass
            raise

    async def delete(self, key: str) -> None:
        path = self._resolve(key)
        try:
            await aiofiles.os.remove(path)
        except FileNotFoundError:
            return  # идемпотентно

    async def exists(self, key: str) -> bool:
        path = self._resolve(key)
        return await asyncio.to_thread(path.is_file)

    async def size(self, key: str) -> int:
        path = self._resolve(key)
        try:
            stat = await aiofiles.os.stat(path)
        except FileNotFoundError as e:
            raise StorageNotFound(key) from e
        return stat.st_size

    async def open_stream(self, key: str) -> AsyncIterator[bytes]:
        path = self._resolve(key)
        if not await asyncio.to_thread(path.is_file):
            raise StorageNotFound(key)

        async def _iter() -> AsyncIterator[bytes]:
            async with aiofiles.open(path, "rb") as f:
                while True:
                    chunk = await f.read(self.CHUNK_SIZE)
                    if not chunk:
                        break
                    yield chunk

        return _iter()

    async def open_range(self, key: str, start: int, end: int) -> AsyncIterator[bytes]:
        path = self._resolve(key)
        if not await asyncio.to_thread(path.is_file):
            raise StorageNotFound(key)

        async def _iter() -> AsyncIterator[bytes]:
            remaining = end - start + 1  # end включительно
            async with aiofiles.open(path, "rb") as f:
                await f.seek(start)
                while remaining > 0:
                    to_read = min(self.CHUNK_SIZE, remaining)
                    chunk = await f.read(to_read)
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return _iter()

    async def list_objects(self, prefixes: tuple[str, ...]) -> list[StorageObject]:
        """Безопасно просканировать только явно разрешённые префиксы."""

        def _scan() -> list[StorageObject]:
            objects: list[StorageObject] = []
            for prefix in prefixes:
                prefix_path = self._resolve(prefix.strip("/"))
                if not prefix_path.is_dir():
                    continue
                for path in prefix_path.rglob("*"):
                    try:
                        # Симлинки не считаем объектами: они могут вести за root.
                        if path.is_symlink() or not path.is_file():
                            continue
                        resolved = path.resolve()
                        if not resolved.is_relative_to(self.root):
                            continue
                        stat = resolved.stat()
                    except FileNotFoundError:
                        # Файл мог исчезнуть при параллельной замене.
                        continue
                    objects.append(
                        StorageObject(
                            key=resolved.relative_to(self.root).as_posix(),
                            size_bytes=stat.st_size,
                            modified_at=datetime.fromtimestamp(stat.st_mtime, tz=UTC),
                        )
                    )
            return sorted(objects, key=lambda item: item.key)

        return await asyncio.to_thread(_scan)


# --- S3 / MinIO ------------------------------------------------------------


class S3Storage(StorageBackend):
    """Приватное S3-совместимое хранилище.

    Наружу по-прежнему выдаются только защищённые API Aegis. Bucket не обязан
    быть публичным, а ключи в базе не зависят от имени bucket или провайдера.
    Синхронный boto3 выполняется через asyncio.to_thread, поэтому сетевые
    операции не блокируют event loop FastAPI.
    """

    CHUNK_SIZE = 1024 * 1024
    SPOOL_MEMORY_BYTES = 8 * 1024 * 1024

    def __init__(
        self,
        *,
        bucket: str,
        prefix: str = "",
        client=None,
    ) -> None:
        if not bucket.strip():
            raise StorageError("S3_BUCKET_BOOKS must not be empty")
        self.bucket = bucket.strip()
        self.prefix = prefix.strip("/")
        if self.prefix and any(
            part in ("", ".", "..") for part in self.prefix.split("/")
        ):
            raise StorageError("S3_KEY_PREFIX contains an unsafe path segment")
        self.client = client or self._build_client()

    @staticmethod
    def _build_client():
        import boto3
        from botocore.config import Config

        client_kwargs = {
            "service_name": "s3",
            "region_name": settings.S3_REGION,
            "verify": settings.S3_VERIFY_TLS,
            "config": Config(
                signature_version="s3v4",
                connect_timeout=settings.S3_CONNECT_TIMEOUT_SECONDS,
                read_timeout=settings.S3_READ_TIMEOUT_SECONDS,
                retries={"max_attempts": 4, "mode": "standard"},
                s3={
                    "addressing_style": (
                        "path" if settings.S3_FORCE_PATH_STYLE else "auto"
                    )
                },
            ),
        }
        if settings.S3_ENDPOINT_URL.strip():
            client_kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL.strip()
        if settings.S3_ACCESS_KEY.strip() or settings.S3_SECRET_KEY.strip():
            if not settings.S3_ACCESS_KEY.strip() or not settings.S3_SECRET_KEY.strip():
                raise StorageError(
                    "S3_ACCESS_KEY and S3_SECRET_KEY must be configured together"
                )
            client_kwargs["aws_access_key_id"] = settings.S3_ACCESS_KEY
            client_kwargs["aws_secret_access_key"] = settings.S3_SECRET_KEY
        return boto3.client(**client_kwargs)

    @staticmethod
    def _validate_key(key: str) -> str:
        if (
            not key
            or key.startswith("/")
            or "\\" in key
            or any(part in ("", ".", "..") for part in key.split("/"))
        ):
            raise ValueError(f"Invalid storage key: {key!r}")
        return key

    def _object_key(self, key: str) -> str:
        logical = self._validate_key(key)
        return f"{self.prefix}/{logical}" if self.prefix else logical

    def _logical_key(self, object_key: str) -> str | None:
        if not self.prefix:
            return object_key
        expected = f"{self.prefix}/"
        if not object_key.startswith(expected):
            return None
        return object_key[len(expected):]

    @staticmethod
    def _is_not_found(exc: Exception) -> bool:
        response = getattr(exc, "response", {})
        code = str(response.get("Error", {}).get("Code", ""))
        return code in {"404", "NoSuchKey", "NotFound"}

    async def save_stream(
        self,
        key: str,
        chunks: AsyncIterator[bytes],
        max_bytes: int,
    ) -> int:
        object_key = self._object_key(key)
        written = 0
        with tempfile.SpooledTemporaryFile(
            max_size=self.SPOOL_MEMORY_BYTES,
            mode="w+b",
        ) as spool:
            async for chunk in chunks:
                written += len(chunk)
                if written > max_bytes:
                    raise StorageError(
                        f"File exceeds maximum size of {max_bytes} bytes"
                    )
                await asyncio.to_thread(spool.write, chunk)
            await asyncio.to_thread(spool.seek, 0)
            extra_args: dict[str, str] = {}
            content_type, _ = mimetypes.guess_type(key)
            if content_type:
                extra_args["ContentType"] = content_type
            encryption = settings.S3_SERVER_SIDE_ENCRYPTION.strip()
            if encryption:
                extra_args["ServerSideEncryption"] = encryption
            kwargs = {"ExtraArgs": extra_args} if extra_args else {}
            try:
                await asyncio.to_thread(
                    self.client.upload_fileobj,
                    spool,
                    self.bucket,
                    object_key,
                    **kwargs,
                )
            except Exception as exc:  # boto3 exposes several provider errors
                raise StorageError(f"S3 upload failed for {key!r}") from exc
        return written

    async def delete(self, key: str) -> None:
        object_key = self._object_key(key)
        try:
            await asyncio.to_thread(
                self.client.delete_object,
                Bucket=self.bucket,
                Key=object_key,
            )
        except Exception as exc:
            raise StorageError(f"S3 delete failed for {key!r}") from exc

    async def _head(self, key: str) -> dict:
        object_key = self._object_key(key)
        try:
            return await asyncio.to_thread(
                self.client.head_object,
                Bucket=self.bucket,
                Key=object_key,
            )
        except Exception as exc:
            if self._is_not_found(exc):
                raise StorageNotFound(key) from exc
            raise StorageError(f"S3 metadata read failed for {key!r}") from exc

    async def exists(self, key: str) -> bool:
        try:
            await self._head(key)
            return True
        except StorageNotFound:
            return False

    async def size(self, key: str) -> int:
        result = await self._head(key)
        return int(result["ContentLength"])

    async def _get_body(self, key: str, *, byte_range: str | None = None):
        object_key = self._object_key(key)
        kwargs = {"Bucket": self.bucket, "Key": object_key}
        if byte_range:
            kwargs["Range"] = byte_range
        try:
            response = await asyncio.to_thread(self.client.get_object, **kwargs)
            return response["Body"]
        except Exception as exc:
            if self._is_not_found(exc):
                raise StorageNotFound(key) from exc
            raise StorageError(f"S3 read failed for {key!r}") from exc

    @staticmethod
    def _body_iterator(body) -> AsyncIterator[bytes]:
        async def _iter() -> AsyncIterator[bytes]:
            try:
                while True:
                    chunk = await asyncio.to_thread(body.read, S3Storage.CHUNK_SIZE)
                    if not chunk:
                        break
                    yield chunk
            finally:
                await asyncio.to_thread(body.close)

        return _iter()

    async def open_stream(self, key: str) -> AsyncIterator[bytes]:
        body = await self._get_body(key)
        return self._body_iterator(body)

    async def open_range(self, key: str, start: int, end: int) -> AsyncIterator[bytes]:
        if start < 0 or end < start:
            raise ValueError("Invalid byte range")
        body = await self._get_body(key, byte_range=f"bytes={start}-{end}")
        return self._body_iterator(body)

    async def list_objects(self, prefixes: tuple[str, ...]) -> list[StorageObject]:
        def _list() -> list[StorageObject]:
            objects: dict[str, StorageObject] = {}
            for logical_prefix in prefixes:
                prefix = self._object_key(logical_prefix.strip("/")) + "/"
                continuation: str | None = None
                while True:
                    kwargs = {"Bucket": self.bucket, "Prefix": prefix}
                    if continuation:
                        kwargs["ContinuationToken"] = continuation
                    response = self.client.list_objects_v2(**kwargs)
                    for item in response.get("Contents", []):
                        logical = self._logical_key(item["Key"])
                        if logical is None:
                            continue
                        modified = item["LastModified"]
                        if modified.tzinfo is None:
                            modified = modified.replace(tzinfo=UTC)
                        objects[logical] = StorageObject(
                            key=logical,
                            size_bytes=int(item["Size"]),
                            modified_at=modified,
                        )
                    if not response.get("IsTruncated"):
                        break
                    continuation = response.get("NextContinuationToken")
                    if not continuation:
                        raise StorageError("S3 listing ended without continuation token")
            return sorted(objects.values(), key=lambda item: item.key)

        try:
            return await asyncio.to_thread(_list)
        except StorageError:
            raise
        except Exception as exc:
            raise StorageError("S3 object listing failed") from exc


# --- фабрика ----------------------------------------------------------------


def _build_storage() -> StorageBackend:
    backend = settings.STORAGE_BACKEND.lower()
    if backend == "local":
        return LocalStorage(Path(settings.STORAGE_LOCAL_PATH))
    if backend == "s3":
        return S3Storage(
            bucket=settings.S3_BUCKET_BOOKS,
            prefix=settings.S3_KEY_PREFIX,
        )
    raise RuntimeError(f"Unknown STORAGE_BACKEND: {settings.STORAGE_BACKEND!r}")


# Один singleton на процесс. FastAPI-зависимость просто отдаёт его.
_storage: StorageBackend | None = None


def get_storage() -> StorageBackend:
    """FastAPI dependency. Используется через Depends(get_storage)."""
    global _storage
    if _storage is None:
        _storage = _build_storage()
    return _storage
