"""Storage backend abstraction.

Этап 2: используется LocalStorage (файлы пишутся в локальную папку).
Этап 4: добавится S3Storage (boto3/aioboto3), переключение через STORAGE_BACKEND в .env.
Контракт сознательно минимален — ровно столько, сколько нужно роутерам книг.
"""
from __future__ import annotations

import asyncio
import uuid
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from pathlib import Path

import aiofiles
import aiofiles.os

from app.core.config import settings

# --- ошибки -----------------------------------------------------------------


class StorageError(Exception):
    """Базовая ошибка слоя хранилища."""


class StorageNotFound(StorageError):
    """Запрашиваемого ключа нет в хранилище."""


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

    # Утилита: генерация нового уникального ключа.
    # Здесь, а не в роутере, чтобы при переезде на S3 можно было
    # подмешать в ключ префикс/шардинг без правок в API.
    @staticmethod
    def make_key(prefix: str, suffix: str) -> str:
        """prefix='books/pdf', suffix='.pdf' -> 'books/pdf/<uuid>.pdf'."""
        return f"{prefix.strip('/')}/{uuid.uuid4().hex}{suffix}"


# --- локальная реализация ---------------------------------------------------


class LocalStorage(StorageBackend):
    """Хранение файлов в локальной папке. Подходит для разработки."""

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


# --- фабрика ----------------------------------------------------------------


def _build_storage() -> StorageBackend:
    backend = settings.STORAGE_BACKEND.lower()
    if backend == "local":
        return LocalStorage(Path(settings.STORAGE_LOCAL_PATH))
    # На Этапе 4 здесь появится:
    # if backend == "s3":
    #     return S3Storage(...)
    raise RuntimeError(f"Unknown STORAGE_BACKEND: {settings.STORAGE_BACKEND!r}")


# Один singleton на процесс. FastAPI-зависимость просто отдаёт его.
_storage: StorageBackend | None = None


def get_storage() -> StorageBackend:
    """FastAPI dependency. Используется через Depends(get_storage)."""
    global _storage
    if _storage is None:
        _storage = _build_storage()
    return _storage
