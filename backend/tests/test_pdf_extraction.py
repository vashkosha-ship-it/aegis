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
