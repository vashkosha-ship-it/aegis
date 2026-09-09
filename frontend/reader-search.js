// ========== ПОИСК ПО КНИГЕ ==========

let readerSearchResults = [];   // массив совпадений
let readerSearchIndex = -1;     // текущий индекс
let readerSearchActive = false;
let readerSearchDebounce = null;

function toggleReaderSearch() {
  const panel = document.getElementById('readerSearchPanel');
  if (!panel) return;
  const willOpen = panel.style.display === 'none' || !panel.style.display;
  panel.style.display = willOpen ? 'flex' : 'none';
  if (willOpen) {
    // Заполняем SVG-иконки на кнопках (один раз)
    const prev = document.getElementById('readerSearchPrev');
    const next = document.getElementById('readerSearchNext');
    const close = document.getElementById('readerSearchClose');
    if (prev && !prev.innerHTML.trim()) prev.innerHTML = ICONS.chevronUp;
    if (next && !next.innerHTML.trim()) next.innerHTML = ICONS.chevronDown;
    if (close && !close.innerHTML.trim()) close.innerHTML = ICONS.closeX;

    readerSearchActive = true;
    const input = document.getElementById('readerSearchInput');
    input.value = '';
    setReaderSearchStatus('—');
    setTimeout(() => input.focus(), 50);
  } else {
    closeReaderSearch();
  }
}

function closeReaderSearch() {
  const panel = document.getElementById('readerSearchPanel');
  if (panel) panel.style.display = 'none';
  readerSearchActive = false;
  readerSearchResults = [];
  readerSearchIndex = -1;
  clearReaderSearchHighlights();
}

function setReaderSearchStatus(text) {
  const el = document.getElementById('readerSearchStatus');
  if (el) el.textContent = text;
}

async function runReaderSearch(query) {
  query = (query || '').trim();
  if (!query || query.length < 2) {
    readerSearchResults = [];
    readerSearchIndex = -1;
    setReaderSearchStatus('—');
    clearReaderSearchHighlights();
    return;
  }
  setReaderSearchStatus('Идёт поиск…');
  try {
    if (isEpubMode) {
      readerSearchResults = await searchInEpub(query);
    } else {
      readerSearchResults = await searchInPdf(query);
    }
    if (readerSearchResults.length === 0) {
      readerSearchIndex = -1;
      setReaderSearchStatus('0 / 0');
      return;
    }
    readerSearchIndex = 0;
    setReaderSearchStatus(`1 / ${readerSearchResults.length}`);
    await jumpToSearchResult(0);
  } catch (e) {
    console.error('Search error:', e);
    setReaderSearchStatus('Ошибка');
  }
}

async function readerSearchNext() {
  if (readerSearchResults.length === 0) return;
  readerSearchIndex = (readerSearchIndex + 1) % readerSearchResults.length;
  setReaderSearchStatus(`${readerSearchIndex + 1} / ${readerSearchResults.length}`);
  await jumpToSearchResult(readerSearchIndex);
}

async function readerSearchPrev() {
  if (readerSearchResults.length === 0) return;
  readerSearchIndex = (readerSearchIndex - 1 + readerSearchResults.length) % readerSearchResults.length;
  setReaderSearchStatus(`${readerSearchIndex + 1} / ${readerSearchResults.length}`);
  await jumpToSearchResult(readerSearchIndex);
}

async function jumpToSearchResult(idx) {
  const r = readerSearchResults[idx];
  if (!r) return;
  if (isEpubMode) {
    if (epubRendition && r.cfi) {
      try {
        // Снимаем предыдущую подсветку поиска
        if (window._lastEpubSearchCfi) {
          try { epubRendition.annotations.remove(window._lastEpubSearchCfi, 'highlight'); } catch (_) { /* Предыдущая подсветка могла уже исчезнуть. */ }
        }
        await epubRendition.display(r.cfi);
        // Подсвечиваем найденное место
        try {
          epubRendition.annotations.highlight(
            r.cfi,
            {},
            () => {},
            'epub-search-match',
            { fill: 'rgba(251, 191, 36, 0.5)', 'fill-opacity': 1 }
          );
          window._lastEpubSearchCfi = r.cfi;
        } catch (_) { /* EPUB может не поддержать подсветку этого CFI. */ }
      } catch (e) { console.warn(e); }
    }
  }else {
    if (r.page && r.page !== pdfCurrentPage) {
      pdfCurrentPage = r.page;
      await renderPdfPage(pdfCurrentPage);
      updateReaderUI();
    }
    // подсветка совпадения (после рендера text layer)
    setTimeout(() => highlightPdfMatchOnPage(r), 200);
  }
}

function clearReaderSearchHighlights() {
  document.querySelectorAll('.search-match-highlight').forEach(el => el.classList.remove('search-match-highlight'));
}

// Будут реализованы в следующих итерациях
async function searchInPdf(query) {
  if (!pdfDoc) return [];
  const lowerQuery = query.toLowerCase();
  const results = [];

  // Кэш текста страниц — чтобы при повторном поиске не парсить заново
  if (!window._pdfTextCache) window._pdfTextCache = {};

  for (let pageNum = 1; pageNum <= pdfTotalPages; pageNum++) {
    let pageText = window._pdfTextCache[`${currentBookId}_${pageNum}`];
    if (!pageText) {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const content = await page.getTextContent();
        pageText = content.items.map(it => it.str).join(' ');
        window._pdfTextCache[`${currentBookId}_${pageNum}`] = pageText;
      } catch (e) {
        continue; // пропустить битую страницу
      }
    }

    const lowerText = pageText.toLowerCase();
    let pos = 0;
    while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
      // Контекст ±40 символов вокруг совпадения
      const start = Math.max(0, pos - 40);
      const end = Math.min(pageText.length, pos + lowerQuery.length + 40);
      const snippet = (start > 0 ? '…' : '') + pageText.substring(start, end) + (end < pageText.length ? '…' : '');
      results.push({
        page: pageNum,
        snippet,
        matchStart: pos,
        matchEnd: pos + lowerQuery.length,
        query: query,
      });
      pos += lowerQuery.length;
      // Защита от слишком большого количества совпадений
      if (results.length > 500) return results;
    }

    // Прогресс в статусе каждые 20 страниц (для больших PDF)
    if (pageNum % 20 === 0) {
      setReaderSearchStatus(`Идёт поиск… ${pageNum}/${pdfTotalPages}`);
    }
  }
  return results;
}

async function searchInEpub(query) {
  if (!epubBook) return [];
  const lowerQuery = query.toLowerCase();
  const results = [];

  // epub.js: book.spine.spineItems — массив всех глав/разделов
  const spineItems = epubBook.spine.spineItems || [];
  const total = spineItems.length;

  for (let i = 0; i < total; i++) {
    const item = spineItems[i];
    try {
      // Загружаем главу
      await item.load(epubBook.load.bind(epubBook));
      const doc = item.document;
      if (!doc) {
        item.unload();
        continue;
      }

      // Достаём весь текст главы
      const text = doc.body ? (doc.body.innerText || doc.body.textContent || '') : '';
      const lowerText = text.toLowerCase();

      let pos = 0;
      while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
        // Контекст ±40 символов
        const start = Math.max(0, pos - 40);
        const end = Math.min(text.length, pos + lowerQuery.length + 40);
        const snippet = (start > 0 ? '…' : '') + text.substring(start, end) + (end < text.length ? '…' : '');

        // Получаем CFI для этого места
        // Используем cfiFromRange на временном Range
        let cfi = null;
        try {
          cfi = makeEpubCfiForOffset(doc, item, pos, pos + lowerQuery.length);
        } catch (e) {
          // Если не получилось — fallback: CFI на начало главы
          cfi = item.cfiBase ? item.cfiBase : null;
        }

        results.push({
          cfi: cfi,
          snippet: snippet,
          chapterIndex: i,
          query: query,
        });

        pos += lowerQuery.length;
        if (results.length > 500) {
          item.unload();
          return results;
        }
      }

      // Освобождаем главу
      item.unload();
    } catch (e) {
      console.warn('Search chapter error:', e);
      try { item.unload(); } catch (_) { /* Глава уже могла быть выгружена. */ }
    }

    // Прогресс в статусе
    if ((i + 1) % 5 === 0) {
      setReaderSearchStatus(`Идёт поиск… ${i + 1}/${total}`);
    }
  }
  return results;
}

// Вспомогательная: построить CFI для смещения в тексте главы
function makeEpubCfiForOffset(doc, spineItem, startOffset, endOffset) {
  if (!doc || !doc.body) return null;

  // Обходим текстовые ноды и считаем символы, пока не дойдём до startOffset
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
  let accumulated = 0;
  let startNode = null, startNodeOffset = 0;
  let endNode = null, endNodeOffset = 0;

  let node;
  while ((node = walker.nextNode())) {
    const len = node.textContent.length;
    if (!startNode && accumulated + len > startOffset) {
      startNode = node;
      startNodeOffset = startOffset - accumulated;
    }
    if (!endNode && accumulated + len >= endOffset) {
      endNode = node;
      endNodeOffset = endOffset - accumulated;
      break;
    }
    accumulated += len;
  }
  if (!startNode || !endNode) return null;

  const range = doc.createRange();
  range.setStart(startNode, startNodeOffset);
  range.setEnd(endNode, endNodeOffset);

  // epub.js: spineItem.cfiFromRange(range)
  if (typeof spineItem.cfiFromRange === 'function') {
    return spineItem.cfiFromRange(range);
  }
  return null;
}

function highlightPdfMatchOnPage(result) {
  clearReaderSearchHighlights();
  const textLayer = document.getElementById('pdfTextLayer');
  if (!textLayer || !result || !result.query) return;

  const query = result.query.toLowerCase();
  // Обходим все спаны text layer'а и подсвечиваем те, что содержат query
  const spans = textLayer.querySelectorAll('span');
  let firstMatch = null;
  spans.forEach(span => {
    const text = (span.textContent || '').toLowerCase();
    if (text.includes(query)) {
      span.classList.add('search-match-highlight');
      if (!firstMatch) firstMatch = span;
    }
  });
  // Скроллим к первому совпадению на странице
  if (firstMatch) {
    firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Привязываем ввод и горячие клавиши поиска.
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('readerSearchInput');
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(readerSearchDebounce);
    readerSearchDebounce = setTimeout(() => runReaderSearch(input.value), 350);
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) readerSearchPrev();
      else readerSearchNext();
    } else if (event.key === 'Escape') {
      closeReaderSearch();
    }
  });
});
