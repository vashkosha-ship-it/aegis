"""Валидация загружаемых файлов (PDF, обложки).

Проверяем magic bytes — самый надёжный способ. Content-Type из заголовков
и расширение легко подделать, поэтому используем их только как первый фильтр,
а решение принимаем по содержимому.
"""
from __future__ import annotations

import posixpath
import zipfile
from typing import BinaryIO

# --- PDF --------------------------------------------------------------------

PDF_MIME = "application/pdf"
PDF_MAGIC = b"%PDF-"  # все валидные PDF начинаются с этого

# --- EPUB -------------------------------------------------------------------

EPUB_MIME = "application/epub+zip"
EPUB_ZIP_MAGIC = b"PK\x03\x04"
ALLOWED_EPUB_MIMES = frozenset({EPUB_MIME, "application/zip", "application/octet-stream"})

# --- Обложки ----------------------------------------------------------------

# MIME -> расширение файла. Источник истины для генерации ключей в storage.
COVER_MIME_TO_EXT: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

ALLOWED_COVER_MIMES = frozenset(COVER_MIME_TO_EXT.keys())


# --- ошибки -----------------------------------------------------------------


class FileValidationError(ValueError):
    """Файл не прошёл валидацию. Сообщение безопасно показывать пользователю."""


# --- проверки ---------------------------------------------------------------


def validate_pdf_head(head: bytes, *, declared_mime: str | None) -> None:
    """Проверить, что head — начало валидного PDF.

    head: первые ≥5 байт файла, прочитанные ДО основной записи.
    declared_mime: значение Content-Type из multipart-заголовка (для подсказки).
    """
    if declared_mime and declared_mime != PDF_MIME:
        raise FileValidationError(
            f"Expected {PDF_MIME}, got {declared_mime!r}"
        )
    if not head.startswith(PDF_MAGIC):
        raise FileValidationError(
            "File does not look like a PDF (missing %PDF- header)"
        )


def validate_epub_head(head: bytes, *, declared_mime: str | None) -> None:
    """Быстро проверить MIME и ZIP-сигнатуру до сохранения файла."""
    if declared_mime and declared_mime not in ALLOWED_EPUB_MIMES:
        raise FileValidationError(
            f"Expected {EPUB_MIME}, got {declared_mime!r}"
        )
    if not head.startswith(EPUB_ZIP_MAGIC):
        raise FileValidationError("File does not look like an EPUB (missing ZIP header)")


def validate_epub_archive(
    stream: BinaryIO,
    *,
    max_files: int = 10_000,
    max_uncompressed_bytes: int = 1024 * 1024 * 1024,
) -> None:
    """Проверить структуру EPUB и ограничить ZIP-bomb/path traversal.

    EPUB является ZIP-контейнером. Одной сигнатуры недостаточно: обычный ZIP
    иначе прошёл бы загрузку, а архив с огромным распакованным размером мог бы
    исчерпать память браузера читателя.
    """
    try:
        with zipfile.ZipFile(stream) as archive:
            entries = archive.infolist()
            if not entries or len(entries) > max_files:
                raise FileValidationError("EPUB contains an invalid number of files")

            total = 0
            for entry in entries:
                raw_name = entry.filename.replace("\\", "/")
                normalized = posixpath.normpath(raw_name)
                if (
                    raw_name.startswith("/")
                    or normalized == ".."
                    or normalized.startswith("../")
                ):
                    raise FileValidationError("EPUB contains an unsafe file path")
                if entry.flag_bits & 0x1:
                    raise FileValidationError("Encrypted EPUB files are not supported")
                total += entry.file_size
                if total > max_uncompressed_bytes:
                    raise FileValidationError("EPUB is too large after unpacking")

            names = {entry.filename for entry in entries}
            if "mimetype" not in names or "META-INF/container.xml" not in names:
                raise FileValidationError("EPUB structure is incomplete")
            if archive.read("mimetype", pwd=None).strip() != EPUB_MIME.encode("ascii"):
                raise FileValidationError("EPUB mimetype entry is invalid")
    except FileValidationError:
        raise
    except (OSError, zipfile.BadZipFile, RuntimeError, KeyError) as exc:
        raise FileValidationError("EPUB archive is damaged or unsupported") from exc
    finally:
        stream.seek(0)


def detect_cover_ext(head: bytes, *, declared_mime: str | None) -> str:
    """По magic bytes определить тип обложки и вернуть расширение (с точкой).

    Возвращает ".jpg" / ".png" / ".webp". Если не распознали — FileValidationError.
    declared_mime используется только для расхождения (чтобы поймать
    обманные Content-Type, например заявлен PNG, а пришёл что-то другое).
    """
    actual_mime = _sniff_image_mime(head)
    if actual_mime is None:
        raise FileValidationError(
            "Cover must be JPEG, PNG or WEBP (unrecognized file signature)"
        )
    if declared_mime and declared_mime not in ALLOWED_COVER_MIMES:
        raise FileValidationError(
            f"Unsupported cover Content-Type: {declared_mime!r}"
        )
    if declared_mime and declared_mime != actual_mime:
        raise FileValidationError(
            f"Content-Type {declared_mime!r} does not match file contents ({actual_mime})"
        )
    return COVER_MIME_TO_EXT[actual_mime]


def _sniff_image_mime(head: bytes) -> str | None:
    """Определить тип изображения по первым байтам. None — если не распознан."""
    if len(head) < 12:
        return None
    # JPEG: FF D8 FF
    if head[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    # PNG:  89 50 4E 47 0D 0A 1A 0A
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    # WEBP: 'RIFF' .... 'WEBP'
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return None
