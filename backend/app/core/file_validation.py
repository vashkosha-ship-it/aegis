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
PDF_MAGIC = b"%PDF-"
# Заголовок %PDF- обычно стоит в самом начале, но спецификация и все
# читалки (Acrobat, pdf.js) допускают мусор перед ним в первых 1024 байтах:
# так выглядят файлы с BOM, MacBinary-обёрткой или «приклеенным» заголовком
# сайта-источника. Раньше такие книги отклонялись, хотя открываются везде.
PDF_HEADER_SEARCH_BYTES = 1024
# Браузер берёт тип файла из системы. На Windows без программы для PDF он
# присылает octet-stream или пустую строку — решаем по содержимому.
ALLOWED_PDF_MIMES = frozenset({
    PDF_MIME, "application/x-pdf", "application/octet-stream", "binary/octet-stream",
})

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


# Что на самом деле лежит в файле с расширением .pdf — чтобы объяснить
# администратору, что делать, а не просто «не PDF».
_NOT_PDF_HINTS = {
    "empty": "Файл пустой — скорее всего, он не докачался. Скачайте книгу заново.",
    "html": "Это не PDF, а веб-страница: вместо книги сохранилась страница сайта "
            "(ссылка истекла или скачивание не завершилось). Скачайте книгу заново.",
    "djvu": "Это не PDF, а DjVu. Сконвертируйте файл в PDF и загрузите снова.",
    "epub": "Это EPUB с расширением .pdf. Загрузите его как EPUB.",
    "word": "Это документ Word, а не PDF. Сохраните его как PDF и загрузите снова.",
    "mobi": "Это книга Kindle (MOBI/AZW), а не PDF. Сконвертируйте в PDF или EPUB.",
    "chm": "Это справка CHM, а не PDF. Сконвертируйте в PDF.",
    "rtf": "Это документ RTF, а не PDF. Сохраните его как PDF.",
    "archive": "Это архив (ZIP/RAR/7z), а не PDF. Распакуйте его и загрузите книгу.",
    "fb2": "Это книга FB2, а не PDF. Сконвертируйте в PDF или EPUB.",
    "image": "Это картинка, а не PDF.",
}


def sniff_book_kind(head: bytes) -> str | None:
    """Определить по первым байтам, что за файл. None — не узнали."""
    if not head:
        return "empty"
    if PDF_MAGIC in head[:PDF_HEADER_SEARCH_BYTES]:
        return "pdf"
    if head.startswith(b"AT&TFORM"):
        return "djvu"
    if head.startswith(EPUB_ZIP_MAGIC):
        if b"mimetypeapplication/epub+zip" in head[:200]:
            return "epub"
        if b"[Content_Types].xml" in head or b"word/" in head:
            return "word"
        return "archive"
    if head.startswith((b"Rar!", b"7z\xbc\xaf\x27\x1c", b"\x1f\x8b")):
        return "archive"
    if head.startswith(b"\xd0\xcf\x11\xe0"):
        return "word"
    if len(head) >= 68 and head[60:68] in (b"BOOKMOBI", b"TEXtREAd"):
        return "mobi"
    if head.startswith(b"ITSF"):
        return "chm"
    if head.startswith(b"{\\rtf"):
        return "rtf"
    if head.startswith((b"\xff\xd8\xff", b"\x89PNG", b"GIF8")):
        return "image"
    text = head[:PDF_HEADER_SEARCH_BYTES].lstrip(b"\xef\xbb\xbf \t\r\n").lower()
    if text.startswith((b"<!doctype html", b"<html", b"<head", b"<!--")) or b"<html" in text[:300]:
        return "html"
    if b"<fictionbook" in text:
        return "fb2"
    return None


def validate_pdf_head(head: bytes, *, declared_mime: str | None) -> None:
    """Проверить, что head — начало PDF.

    head: первые байты файла (до PDF_HEADER_SEARCH_BYTES), прочитанные ДО
    основной записи. declared_mime: Content-Type из multipart-заголовка.
    """
    if declared_mime and declared_mime not in ALLOWED_PDF_MIMES:
        kind = sniff_book_kind(head)
        if kind != "pdf":
            raise FileValidationError(
                _NOT_PDF_HINTS.get(kind or "", f"Это не PDF (тип файла {declared_mime}).")
            )
    kind = sniff_book_kind(head)
    if kind == "pdf":
        return
    raise FileValidationError(
        _NOT_PDF_HINTS.get(
            kind or "",
            "Файл не похож на PDF: в начале нет заголовка %PDF-. "
            "Возможно, он повреждён или это другой формат.",
        )
    )


def validate_epub_head(head: bytes, *, declared_mime: str | None) -> None:
    """Быстро проверить MIME и ZIP-сигнатуру до сохранения файла."""
    if declared_mime and declared_mime not in ALLOWED_EPUB_MIMES:
        raise FileValidationError(
            f"Expected {EPUB_MIME}, got {declared_mime!r}"
        )
    if not head.startswith(EPUB_ZIP_MAGIC):
        kind = sniff_book_kind(head)
        if kind == "pdf":
            raise FileValidationError("Это PDF с расширением .epub. Загрузите его как PDF.")
        hint = _NOT_PDF_HINTS.get(kind or "")
        raise FileValidationError(
            hint.replace("не PDF", "не EPUB") if hint else
            "Файл не похож на EPUB: это не ZIP-архив. Возможно, он повреждён."
        )


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
