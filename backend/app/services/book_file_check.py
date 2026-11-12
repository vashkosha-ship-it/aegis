"""Проверка, откроется ли файл книги у читателя.

Книги, файл которых не открывается (повреждён, загружен не полностью,
защищён паролем или DRM), скрываются от читателей — см. books.reader_visible.
Решение принимает только эта проверка: сбой индексации по другим причинам
(таймаут, нехватка памяти, скан без текста) книгу не скрывает.

PDF проверяем через PDFium — движок PDF из Chrome — и, если он не
справился, через pypdf: так же, как индексатор. Книга считается
повреждённой, только если её не открыл ни один из них. Пароль пробуем пустой:
PDF, защищённые лишь от печати и редактирования, открываются нормально.

Проверка идёт в отдельном процессе с ограничением по времени и памяти, как
и извлечение текста. Если она не успела или не хватило памяти, ответ
«неизвестно» — книга остаётся видимой.
"""
from __future__ import annotations

import logging
import posixpath
from dataclasses import dataclass

logger = logging.getLogger(__name__)

PROBLEM_DAMAGED = "damaged"
PROBLEM_PASSWORD = "password"
PROBLEM_MISSING = "missing"
PROBLEMS = (PROBLEM_DAMAGED, PROBLEM_PASSWORD, PROBLEM_MISSING)

CHECK_TIMEOUT_SECONDS = 120

# Обфускация шрифтов в EPUB описывается в том же encryption.xml, что и DRM,
# но читать книгу не мешает.
_FONT_OBFUSCATION = {
    "http://www.idpf.org/2008/embedding",
    "http://ns.adobe.com/pdf/enc#RC",
}


@dataclass(frozen=True)
class FileCheck:
    """Итог проверки: problem=None — файл открывается."""

    problem: str | None
    detail: str = ""

    @property
    def ok(self) -> bool:
        return self.problem is None


def _pypdf_opens(path: str) -> bool:
    from pypdf import PdfReader

    try:
        reader = PdfReader(path, strict=False)
        if reader.is_encrypted and not reader.decrypt(""):
            return False
        return len(reader.pages) > 0
    except Exception:  # noqa: BLE001 — не открылся и pypdf
        return False


def _check_pdf_worker(path: str) -> tuple[str | None, str]:
    """Выполняется в отдельном процессе."""
    import pypdfium2 as pdfium

    with open(path, "rb") as f:
        head = f.read(1024)
    if b"%PDF-" not in head:
        return PROBLEM_DAMAGED, "Внутри файла не PDF"
    try:
        document = pdfium.PdfDocument(path)
    except pdfium.PdfiumError as exc:
        message = str(exc)
        if "password" in message.lower():
            return PROBLEM_PASSWORD, "PDF защищён паролем"
        # Как и индексатор: что не открыл PDFium, пробуем pypdf — он
        # восстанавливает часть файлов, на которых PDFium сдаётся.
        if _pypdf_opens(path):
            return None, ""
        return PROBLEM_DAMAGED, f"PDF повреждён или загружен не полностью ({message})"
    try:
        if len(document) == 0:
            return PROBLEM_DAMAGED, "В PDF нет ни одной страницы"
        document[0].close()
    except Exception as exc:  # noqa: BLE001 — первая страница не открывается
        return PROBLEM_DAMAGED, f"Первая страница PDF не открывается ({exc})"
    finally:
        document.close()
    return None, ""


def _check_epub_worker(path: str) -> tuple[str | None, str]:
    """Выполняется в отдельном процессе."""
    import zipfile
    from xml.etree import ElementTree

    try:
        archive = zipfile.ZipFile(path)
    except (zipfile.BadZipFile, OSError) as exc:
        return PROBLEM_DAMAGED, f"EPUB повреждён или загружен не полностью ({exc})"
    with archive:
        infos = archive.infolist()
        if any(info.flag_bits & 0x1 for info in infos):
            return PROBLEM_PASSWORD, "EPUB-архив защищён паролем"
        names = {info.filename for info in infos}

        if "META-INF/encryption.xml" in names:
            try:
                root = ElementTree.fromstring(archive.read("META-INF/encryption.xml"))
            except (ElementTree.ParseError, zipfile.BadZipFile, OSError) as exc:
                return PROBLEM_DAMAGED, f"EPUB повреждён ({exc})"
            algorithms = {
                el.get("Algorithm", "")
                for el in root.iter()
                if el.tag.endswith("EncryptionMethod")
            }
            if algorithms - _FONT_OBFUSCATION:
                return PROBLEM_PASSWORD, "EPUB защищён DRM"

        try:
            container = ElementTree.fromstring(archive.read("META-INF/container.xml"))
            rootfile = next(el for el in container.iter() if el.tag.endswith("rootfile"))
            opf_path = rootfile.get("full-path") or ""
            opf = ElementTree.fromstring(archive.read(opf_path))
        except (KeyError, StopIteration, ElementTree.ParseError, zipfile.BadZipFile, OSError) as exc:
            return PROBLEM_DAMAGED, f"В EPUB нет описания книги (OPF) ({exc})"

        base = posixpath.dirname(opf_path)
        manifest = {
            el.get("id"): el.get("href", "")
            for el in opf.iter()
            if el.tag.endswith("}item") or el.tag == "item"
        }
        spine = [el.get("idref") for el in opf.iter() if el.tag.endswith("itemref") or el.tag == "itemref"]
        chapters = [
            posixpath.normpath(posixpath.join(base, manifest[ref].split("#", 1)[0]))
            for ref in spine
            if ref in manifest
        ]
        present = [name for name in chapters if name in names]
        if not present:
            return PROBLEM_DAMAGED, "В EPUB нет ни одной главы"
        # Первая глава должна распаковываться: битый архив обычно ломается здесь.
        try:
            archive.read(present[0])
        except (zipfile.BadZipFile, OSError, EOFError, ValueError) as exc:
            return PROBLEM_DAMAGED, f"EPUB повреждён ({exc})"
    return None, ""


async def check_book_file(path: str, file_format: str) -> FileCheck | None:
    """Проверить скачанный файл. None — проверить не удалось (книгу не скрываем)."""
    from app.services.search_index import ExtractionOutOfMemory, _run_extraction

    worker = _check_epub_worker if file_format == "epub" else _check_pdf_worker
    try:
        problem, detail = await _run_extraction(worker, path, CHECK_TIMEOUT_SECONDS)
    except (TimeoutError, ExtractionOutOfMemory):
        logger.warning("Проверка файла %s не уложилась в ограничения — пропускаю", path)
        return None
    except Exception:  # noqa: BLE001 — сбой самой проверки не скрывает книгу
        logger.exception("Проверка файла %s упала", path)
        return None
    return FileCheck(problem, detail[:500])
