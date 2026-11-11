'use strict';

// Отсканированные книги: страницы — картинки, текста в файле нет. При первом
// открытии такой книги предупреждаем, какие функции читалки в ней не работают.
//
// Признак скана — на нескольких страницах из разных мест книги pdf.js не
// находит текста. Результат проверки запоминаем по книге: окно показывается
// один раз, а книги с текстом повторно не проверяются.

const SCAN_NOTICE_KEY_PREFIX = 'aegis_book_text_layer:';
const SCAN_TEXT_MIN_CHARS = 40;

function _scanNoticeKey(bookId) {
  return SCAN_NOTICE_KEY_PREFIX + bookId;
}

function _readScanState(bookId) {
  try { return localStorage.getItem(_scanNoticeKey(bookId)); } catch (_) { return null; }
}

function _writeScanState(bookId, value) {
  try { localStorage.setItem(_scanNoticeKey(bookId), value); } catch (_) { /* не критично */ }
}

// Страницы для проверки: не обложка, середина и ближе к концу.
function scanSamplePages(total) {
  if (!total || total < 2) return [];
  const pages = [Math.min(3, total), Math.ceil(total / 2), Math.max(2, total - 5)];
  return [...new Set(pages)].filter(n => n >= 1 && n <= total);
}

async function pdfHasTextLayer(doc) {
  const pages = scanSamplePages(doc.numPages);
  if (!pages.length) return true;
  let chars = 0;
  for (const n of pages) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    chars += (content.items || []).reduce((sum, item) => sum + String(item.str || '').trim().length, 0);
    if (chars >= SCAN_TEXT_MIN_CHARS) return true;
  }
  return false;
}

function showScannedBookNotice() {
  showInfoModal({
    id: 'scanNoticeModal',
    title: 'Отсканированная книга',
    message: 'Страницы этой книги сохранены как изображения — текста в файле нет. Поэтому здесь не работают:',
    items: [
      'выделение и копирование текста;',
      'выделение цветом и заметки к фрагменту;',
      'поиск по тексту книги;',
      'вопросы ИИ-ассистенту о содержимом страницы.',
    ],
    footnote: 'Читать, листать, масштабировать и ставить закладки можно как обычно.',
  });
}

// Вызывается читалкой после открытия PDF. doc — документ pdf.js.
async function checkScannedBookNotice(bookId, doc, isStillOpen) {
  if (!bookId || !doc) return;
  const known = _readScanState(bookId);
  if (known === 'text' || known === 'scan-shown') return;
  let hasText;
  try {
    hasText = await pdfHasTextLayer(doc);
  } catch (error) {
    console.warn('Не удалось проверить текстовый слой книги:', error);
    return;
  }
  if (hasText) {
    _writeScanState(bookId, 'text');
    return;
  }
  if (typeof isStillOpen === 'function' && !isStillOpen()) return;
  _writeScanState(bookId, 'scan-shown');
  showScannedBookNotice();
}
