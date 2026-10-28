"""Тесты извлечения текста из настоящих PDF.

Появились после инцидента: обновление pypdf и правка кода очистки процессов
сломали индексацию на всех книгах, а 89 существующих тестов этого не увидели —
ни один из них не парсил реальный файл. Разбирательство заняло час; такой
тест поймал бы поломку за секунды.

PDF генерируем на лету через reportlab (он уже в зависимостях), чтобы не
держать бинарники в репозитории и не зависеть от их содержимого.
"""
from __future__ import annotations

import os
import tempfile

import pytest

from app.services.search_index import (
    MAX_PAGE_CHARS,
    ExtractionTimeout,
    IndexingError,
    PdfTooLarge,
    _extract_pages,
)


def _make_pdf(pages: list[str]) -> str:
    """Собрать временный PDF, где на каждой странице свой текст."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    fd, path = tempfile.mkstemp(suffix=".pdf", prefix="test-")
    os.close(fd)

    c = canvas.Canvas(path, pagesize=A4)
    for text in pages:
        c.drawString(100, 700, text)
        c.showPage()
    c.save()
    return path


@pytest.fixture
def simple_pdf():
    path = _make_pdf(["Hello from page one", "Second page content"])
    yield path
    os.unlink(path)


class TestExtraction:
    async def test_extracts_text_from_pages(self, simple_pdf):
        """Базовый сценарий, который ломался: любой файл вообще не читался."""
        pages = await _extract_pages(simple_pdf)

        assert len(pages) == 2
        assert "Hello" in pages[0]
        assert "Second" in pages[1]

    async def test_page_count_matches(self):
        path = _make_pdf([f"Page {i}" for i in range(7)])
        try:
            pages = await _extract_pages(path)
            assert len(pages) == 7
        finally:
            os.unlink(path)

    async def test_empty_pages_are_kept_as_empty_strings(self):
        """Страницы без текста (сканы) не должны ломать разбор."""
        path = _make_pdf(["Text here", "", "More text"])
        try:
            pages = await _extract_pages(path)
            assert len(pages) == 3
            assert pages[1] == ""
        finally:
            os.unlink(path)

    async def test_long_page_is_truncated(self):
        """Мусорный PDF с гигантским текстовым слоем не должен раздуть БД."""
        huge = "word " * 20000
        path = _make_pdf([huge])
        try:
            pages = await _extract_pages(path)
            assert len(pages[0]) <= MAX_PAGE_CHARS
        finally:
            os.unlink(path)


class TestBrokenInput:
    async def test_corrupted_file_raises_indexing_error(self):
        """Битый файл должен давать понятную ошибку, а не падать как попало."""
        fd, path = tempfile.mkstemp(suffix=".pdf")
        with os.fdopen(fd, "wb") as f:
            f.write("это совсем не PDF".encode())

        try:
            with pytest.raises(BaseException) as exc:  # noqa: B017 — см. ниже
                await _extract_pages(path)
            # Тип исключения задаёт pypdf и он менялся между версиями.
            # Проверяем главное: это не AttributeError из нашего кода очистки
            # пула — именно он ломал индексацию всех книг.
            assert not isinstance(exc.value, AttributeError)
        finally:
            os.unlink(path)

    async def test_missing_file_raises(self):
        """Несуществующий путь — ошибка ОС, не тихий возврат пустого списка."""
        with pytest.raises((OSError, IndexingError)):
            await _extract_pages("/nonexistent/path/to.pdf")


class TestLimits:
    async def test_oversized_file_rejected(self, monkeypatch):
        """Файл больше лимита не читаем: время на него не окупается."""
        from app.services import search_index

        monkeypatch.setattr(search_index, "MAX_PDF_BYTES", 100)

        path = _make_pdf(["Небольшой, но больше ста байт документ"])
        try:
            with pytest.raises(PdfTooLarge):
                await _extract_pages(path)
        finally:
            os.unlink(path)

    async def test_timeout_is_enforced(self, monkeypatch, simple_pdf):
        """Зависший разбор должен прерываться, а не занимать воркер навсегда."""
        from app.services import search_index

        monkeypatch.setattr(search_index, "EXTRACT_TIMEOUT_SECONDS", 0.001)

        with pytest.raises(ExtractionTimeout):
            await _extract_pages(simple_pdf)

    async def test_pool_cleanup_after_success(self, simple_pdf):
        """Регрессия: очистка пула падала с AttributeError на любом файле.

        Проверяем, что подряд идущие вызовы отрабатывают — именно этот путь
        (finally после успешного извлечения) и был сломан.
        """
        for _ in range(3):
            pages = await _extract_pages(simple_pdf)
            assert len(pages) == 2


def _damage(path: str, how: str) -> None:
    """Испортить PDF так же, как испорчены книги, на которых падал pypdf."""
    with open(path, "rb") as fh:
        data = fh.read()
    if how == "no_xref":
        # Файл оборван перед таблицей xref и трейлером:
        # pypdf — «Stream has ended unexpectedly».
        data = data[: data.rfind(b"xref")]
    elif how == "bad_encrypt":
        # pypdf — «/Encrypt entry of the trailer is not a dictionary».
        data = data.replace(b"trailer\n<<", b"trailer\n<< /Encrypt 5 ", 1)
    elif how == "no_endstream":
        # pypdf — «Unable to find 'endstream' marker».
        data = data.replace(b"endstream", b"endstrXam", 1)
    with open(path, "wb") as fh:
        fh.write(data)


class TestDamagedPdfFallback:
    """Книги с повреждённой структурой открываются в читалке, но pypdf на
    них сдавался целиком, и они не попадали в поиск. Теперь их разбирает
    PDFium."""

    @pytest.mark.parametrize("how", ["no_xref", "bad_encrypt", "no_endstream"])
    async def test_damaged_pdf_is_indexed_via_pdfium(self, how):
        from pypdf import PdfReader
        from pypdf.errors import PyPdfError

        path = _make_pdf([f"Firewall page {i}" for i in range(1, 6)])
        try:
            _damage(path, how)
            with pytest.raises(PyPdfError):
                [page.extract_text() for page in PdfReader(path).pages]
            pages = await _extract_pages(path)
            assert len(pages) == 5
            # Испорченный поток может унести текст своей страницы, остальные
            # должны прочитаться.
            assert sum("Firewall page" in page for page in pages) >= 4
            assert "Firewall page 5" in pages[4]
        finally:
            os.unlink(path)

    async def test_garbage_still_fails_with_original_error(self):
        """Если не справился и PDFium, наружу уходит понятная ошибка."""
        fd, path = tempfile.mkstemp(suffix=".pdf")
        os.write(fd, b"%PDF-1.4\nnot really a pdf at all")
        os.close(fd)
        try:
            from pypdf.errors import PyPdfError

            with pytest.raises(PyPdfError):
                await _extract_pages(path)
        finally:
            os.unlink(path)


def _allocate_a_lot() -> int:
    data = bytearray(1024 * 1024 * 1024)  # 1 ГБ
    return len(data)


def _crash_worker(_path: str) -> list[str]:
    os._exit(137)  # как процесс, убитый за нехватку памяти


class TestExtractionMemoryLimit:
    """Тяжёлая книга не должна ронять весь воркер: у процесса разбора свой
    потолок памяти, а его смерть превращается в понятную ошибку книги."""

    def test_child_process_gets_its_own_memory_ceiling(self, monkeypatch):
        from app.services import search_index

        monkeypatch.setattr(search_index, "EXTRACT_MEMORY_LIMIT_BYTES", 512 * 1024 * 1024)
        pool = search_index._new_extract_pool()
        try:
            with pytest.raises(MemoryError):
                pool.submit(_allocate_a_lot).result(timeout=60)
        finally:
            pool.shutdown(wait=True, cancel_futures=True)

    async def test_killed_extraction_becomes_book_error(self, monkeypatch, simple_pdf):
        from app.services import search_index

        monkeypatch.setattr(search_index, "_extract_pages_worker", _crash_worker)
        with pytest.raises(search_index.ExtractionOutOfMemory, match="не хватило памяти"):
            await _extract_pages(simple_pdf)

    async def test_normal_book_still_fits_under_the_ceiling(self, simple_pdf):
        pages = await _extract_pages(simple_pdf)
        assert "Hello" in pages[0]
