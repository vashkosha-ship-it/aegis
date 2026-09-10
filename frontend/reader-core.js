// PDF/EPUB loading and rendering core.
// Loaded as a classic script before app.js; shared reader state lives in app-state.js.

async function loadEpub(b) {
  isEpubMode = true;
  document.getElementById('pdfViewport').classList.add('hidden');
  document.getElementById('epubViewport').classList.remove('hidden');
  document.getElementById('annotationLayer').replaceChildren();

  const container = document.getElementById('epubContainer');
  container.innerHTML = loadingSpinnerHTML('Загрузка книги…');

  // Лениво подгружаем epub.js при первом открытии EPUB
  try {
    await ensureEpubLoaded();
  } catch (e) {
    replaceWithStaticText(container, 'Не удалось загрузить EPUB-движок. Проверьте соединение.', 'a507');
    return;
  }

  try {
    let epubData = null;
    let fromOffline = false;

    // 1. Сначала пробуем IndexedDB
    if (offlineBookIds.has(b.id)) {
      try {
        const blob = await offlineStorage.getFile(b.id, 'epub');
        if (blob) {
          epubData = await blob.arrayBuffer();
          fromOffline = true;
        }
      } catch (e) {
        console.warn('Не удалось прочитать EPUB из IndexedDB:', e);
      }
    }

    // 2. Если в IndexedDB нет — пробуем API
    if (!epubData) {
      if (!b.has_file) {
        showToast('EPUB-файл не найден');
        closeReader();
        return;
      }
      try {
        const resp = await api.request('/books/' + b.id + '/pdf', { raw: true });
        epubData = await resp.arrayBuffer();
      } catch (err) {
        showToast('Нет связи. Сохраните книгу оффлайн заранее.');
        closeReader();
        return;
      }
    }

    // 3. Рендерим EPUB
    if (typeof ePub === 'undefined') {
      showToast('EPUB-движок не загрузился. Проверьте интернет/доступ к CDN.');
      closeReader();
      return;
    }
    epubBook = ePub(epubData);
    epubRendition = epubBook.renderTo(container, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
    });
    // Применяем тему после создания rendition
  setTimeout(() => applyReaderTheme(getReaderTheme()), 100);

    const location = await epubBook.locations.generate(1000);
    epubRendition.display();

    epubTotalPages = location.total || 1;
    epubCurrentPage = Math.min(state.readingProgress[b.id]?.currentPage || 1, epubTotalPages);

    if (!state.readingProgress[b.id]) {
      state.readingProgress[b.id] = { currentPage: 1, totalPages: epubTotalPages, started: false };
    } else {
      state.readingProgress[b.id].totalPages = epubTotalPages;
    }

    updatePageIndicator();
    container.replaceChildren();
    epubRendition.display(epubCurrentPage - 1);

    epubRendition.on('relocated', (loc) => {
      const current = epubBook.locations.locationFromCfi(loc.start);
      if (current !== null && current !== undefined) {
        epubCurrentPage = current + 1;
        if (state.currentBook) {
          state.readingProgress[state.currentBook.id].currentPage = epubCurrentPage;
          scheduleProgressSave(state.currentBook.id);
        }
        updatePageIndicator();
      }
    });
// === Выделение текста в EPUB ===
    epubRendition.on('selected', (cfiRange, contents) => {
      handleEpubSelection(cfiRange, contents);
    });

    // Подгружаем уже сохранённые highlights и рендерим их поверх текста
    await loadAndApplyEpubHighlights();

    saveState();
    if (fromOffline) showToast('Читаем из оффлайн-хранилища');
  } catch (err) {
    console.error('Ошибка загрузки EPUB:', err);
    showToast('Не удалось загрузить EPUB');
    closeReader();
  }
}

// ========== PDF READER ==========
let _pdfLoadToken = 0;          // защита от параллельных/повторных загрузок книги
let _pdfLoadingTask = null;     // текущая задача pdf.js, чтобы отменить прошлую

async function loadPdf(b) {
  // Повторный вызов (двойной тап, перерисовка) не должен перетирать уже
  // открытую книгу — актуальность загрузки проверяем по токену.
  //
  // ВАЖНО: не вызывать destroy() у предыдущей задачи. pdf.js использует один
  // общий worker на все документы, и destroy() убивает его целиком — следующая
  // книга падает с «Worker was terminated» и висит на спиннере навсегда.
  const myToken = ++_pdfLoadToken;
  isEpubMode = false;
  document.getElementById('epubViewport').classList.add('hidden');
  document.getElementById('pdfViewport').classList.remove('hidden');

  const c = document.getElementById('pdfCanvas');
  const pl = document.getElementById('pdfPlaceholder');

  pl.classList.remove('hidden');
  pl.innerHTML = loadingSpinnerHTML('Загрузка книги…');
  c.classList.add('hidden');

  // Если загрузка затянулась (большой PDF) — обновляем подпись, чтобы человек
  // понимал, что всё идёт штатно, просто книга большая.
  if (window._bookLoadHintTimer) clearTimeout(window._bookLoadHintTimer);
  window._bookLoadHintTimer = setTimeout(() => {
    const sp = document.getElementById('pdfPlaceholder');
    if (sp && sp.querySelector('.aegis-spinner')) {
      sp.innerHTML = loadingSpinnerHTML('Загружаем большую книгу, ещё несколько секунд…');
    }
  }, 3000);

  // Лениво подгружаем pdf.js при первом открытии PDF
  try {
    await ensurePdfLoaded();
  } catch (e) {
    pl.textContent = 'Не удалось загрузить PDF-движок. Проверьте соединение.';
    return;
  }

  // Сначала пробуем IndexedDB (оффлайн-книги — читаем из байтов)
  let bytes = null;
  let fromOffline = false;
  if (offlineBookIds.has(b.id)) {
    try {
      const blob = await offlineStorage.getFile(b.id, 'pdf');
      if (blob) {
        bytes = await blob.arrayBuffer();
        fromOffline = true;
      }
    } catch (e) {
      console.warn('Не удалось прочитать PDF из IndexedDB:', e);
    }
  }

  if (typeof pdfjsLib === 'undefined') {
    showToast('PDF-движок не загрузился. Проверьте интернет/доступ к CDN.');
    return;
  }

  // Если не оффлайн — грузим ПРОГРЕССИВНО по URL (pdf.js тянет страницы по частям,
  // первая страница появляется почти сразу, не дожидаясь всего файла).
  try {
    let loadingTask;
    if (fromOffline && bytes) {
      loadingTask = pdfjsLib.getDocument({ data: bytes });
    } else {
      if (!b.has_file) {
        pl.classList.remove('hidden');
        c.classList.add('hidden');
        generateDemoPdf(b);
        return;
      }
      const cfg = api.books.pdfStreamConfig(b.id);
      loadingTask = pdfjsLib.getDocument({
        url: cfg.url,
        httpHeaders: cfg.httpHeaders,
        withCredentials: cfg.withCredentials,
        rangeChunkSize: 1048576,       // 1 МБ на чанк — меньше round-trip'ов
        // true — качаем только то, что нужно показанным страницам.
        // При false pdf.js берёт первую страницу через Range, показывает
        // её, а потом фоном дотягивает файл целиком: для сканов на сотню
        // мегабайт это и есть «Загрузка книги… 0%» на несколько минут.
        disableAutoFetch: true,
        // Ключевое для больших книг: без этого pdf.js открывает полный поток
        // и тянет весь файл (144 МБ), несмотря на Range-поддержку сервера.
        disableStream: true,
        disableRange: false,
      });
    }

    // Прогресс загрузки: на медленной сети показываем проценты вместо
    // бесконечного спиннера.
    _pdfLoadingTask = loadingTask;
    loadingTask.onProgress = ({ loaded, total }) => {
      if (myToken !== _pdfLoadToken) return;   // загрузка устарела
      const box = document.getElementById('pdfPlaceholder');
      if (!box || box.classList.contains('hidden')) return;
      if (total && total > 0) {
        const pct = Math.min(99, Math.round(loaded / total * 100));
        box.innerHTML = loadingSpinnerHTML(`Загрузка книги… ${pct}%`);
      }
    };

    const loadedDoc = await loadingTask.promise;
    if (myToken !== _pdfLoadToken) return;   // пока грузили, открыли другую книгу
    pdfDoc = loadedDoc;

    pdfTotalPages = pdfDoc.numPages;
    const prevProgress = state.readingProgress[b.id];
    if (!prevProgress) {
      state.readingProgress[b.id] = { currentPage: 1, totalPages: pdfTotalPages, started: false };
    } else {
      // Если в базе осталось неверное число страниц (например, 10 от старого
      // аварийного фолбэка), чиним его: отправляем серверу реальное значение.
      const wasWrong = prevProgress.totalPages !== pdfTotalPages;
      prevProgress.totalPages = pdfTotalPages;
      if (wasWrong) {
        const page = Math.min(prevProgress.currentPage || 1, pdfTotalPages);
        api.library.updateProgress(b.id, page, pdfTotalPages)
          .catch(() => { /* не критично: поправится при следующем открытии */ });
      }
    }
    pdfCurrentPage = Math.min(state.readingProgress[b.id].currentPage || 1, pdfTotalPages);

    if (window._bookLoadHintTimer) { clearTimeout(window._bookLoadHintTimer); window._bookLoadHintTimer = null; }
    pl.classList.add('hidden');
    c.classList.remove('hidden');
    updatePageIndicator();
    
    // Ждём, пока canvas станет видимым
    setTimeout(async () => {
      await renderPdfPage(pdfCurrentPage);
    }, 100);
    
    if (fromOffline) showToast('Читаем из оффлайн-хранилища');
  } catch (err) {
    console.error('Ошибка рендеринга PDF:', err);
    showToast('Ошибка: ' + err.message);
    generateDemoPdf(b);
  }
}

function generateDemoPdf(b) {
  pdfTotalPages = state.readingProgress[b.id]?.totalPages || 10;
  pdfCurrentPage = Math.min(state.readingProgress[b.id]?.currentPage || 1, pdfTotalPages);
  updatePageIndicator();
  document.getElementById('pdfPlaceholder').innerHTML = `<div data-static-style="a239">${ICONS.bookCover}</div><p>${eh(b.title)}</p><p>Стр.${pdfCurrentPage}/${pdfTotalPages}</p>`;
  renderAnnotations();
}

async function renderPdfPage(pn) {
  if (!pdfDoc) return;

  // Защита от гонки при быстром листании: помечаем этот запрос токеном и
  // отменяем предыдущий незавершённый рендер (иначе два рендера в один canvas
  // накладываются → перевёрнутые/битые страницы).
  const myToken = ++_pdfRenderToken;
  if (_pdfRenderTask) {
    try { _pdfRenderTask.cancel(); } catch (e) {}
    _pdfRenderTask = null;
  }

  // При перерисовке страницы — снимаем подсветку поиска
  clearReaderSearchHighlights();

  const page = await pdfDoc.getPage(pn);
  // Если за время await пользователь пролистал дальше — прекращаем (наш рендер устарел)
  if (myToken !== _pdfRenderToken) return;
  const viewport1 = page.getViewport({ scale: 1 });

  const container = document.getElementById('pdfViewport');
  if (!container) return;

  // Иногда clientWidth ещё 0/крошечный (рендер до раскладки) — подстраховываемся
  // шириной окна, иначе страница выходит микроскопической в углу.
  let containerWidth = container.clientWidth;
  if (!containerWidth || containerWidth < 200) {
    containerWidth = Math.min(window.innerWidth - 32, 1100);
  }
  const isMobile = window.innerWidth < 700;
  // На ПК страница ~в 2 раза меньше прежнего (масштаб браузера 100%).
  let maxWidth;
  if (isMobile) {
    maxWidth = containerWidth;
  } else if (window.innerWidth >= 1600) {
    maxWidth = 650;
  } else if (window.innerWidth >= 1024) {
    maxWidth = 550;
  } else {
    maxWidth = 600;
  }
  let targetWidth = Math.min(containerWidth - (isMobile ? 0 : 24), maxWidth);
  // Множитель размера шрифта из настроек (90–130%)
  const fontScale = (parseInt(localStorage.getItem('aegis_reader_font') || '100', 10)) / 100;
  targetWidth = Math.min(targetWidth * fontScale, containerWidth - (isMobile ? 0 : 12));

  const dpr = window.devicePixelRatio || 1;
  const scale = targetWidth / viewport1.width;
  const viewport = page.getViewport({ scale });

  // Рендерим canvas
  const canvas = document.getElementById('pdfCanvas');
  canvas.width = viewport.width * dpr;
  canvas.height = viewport.height * dpr;
  canvas.style.width = targetWidth + 'px';
  canvas.style.height = 'auto';
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';
  // Первая страница (обложка) не инвертируется в тёмной теме
  if (pn === 1) canvas.classList.add('no-invert');
  else canvas.classList.remove('no-invert');

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Запускаем рендер как отменяемую задачу. Если во время рендера пользователь
  // пролистнёт дальше — задача будет отменена (cancel выше), и мы выйдем.
  const renderTask = page.render({
    canvasContext: ctx,
    viewport: viewport,
  });
  _pdfRenderTask = renderTask;
  try {
    await renderTask.promise;
  } catch (err) {
    // RenderingCancelledException — это нормально (пользователь пролистнул дальше)
    if (err && err.name === 'RenderingCancelledException') return;
    throw err;
  }
  if (_pdfRenderTask === renderTask) _pdfRenderTask = null;
  // Наш рендер устарел (пролистали дальше) — не трогаем text layer
  if (myToken !== _pdfRenderToken) return;

  // Text layer для выделения (правильный API для PDF.js 3.x)
  const textLayerDiv = document.getElementById('pdfTextLayer');
  if (textLayerDiv) {
    textLayerDiv.replaceChildren();
    const cssHeight = viewport.height;
    // Читаем offsetLeft/Top ПОСЛЕ применения стилей canvas (через rAF),
    // иначе margin:0 auto ещё не применён и слой уезжает.
    await new Promise(r => requestAnimationFrame(r));
    textLayerDiv.style.position = 'absolute';
    textLayerDiv.style.left = canvas.offsetLeft + 'px';
    textLayerDiv.style.top = canvas.offsetTop + 'px';
    textLayerDiv.style.transform = 'none';
    textLayerDiv.style.width = targetWidth + 'px';
    textLayerDiv.style.height = cssHeight + 'px';
    textLayerDiv.style.pointerEvents = 'auto';
    textLayerDiv.style.setProperty('--scale-factor', String(viewport.scale));

    try {
      const textContent = await page.getTextContent();
      // Сохраняем плоский текст страницы — ассистент сможет отвечать по нему
      try {
        readerCurrentPageText = (textContent.items || []).map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
      } catch (_) { readerCurrentPageText = ''; }
      pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport: viewport,
        textDivs: [],
      });
    } catch (e) {
      console.warn('Text layer error:', e);
    }
  }

  // Восстанавливаем аннотации
  if (typeof renderAnnotations === 'function') {
    await renderAnnotations();
  }
  // Если активен поиск — подсвечиваем совпадения на этой странице
  if (readerSearchActive && readerSearchResults.length > 0) {
    const currentResult = readerSearchResults[readerSearchIndex];
    if (currentResult && currentResult.page === pdfCurrentPage) {
      setTimeout(() => highlightPdfMatchOnPage(currentResult), 100);
    }
  }
}

// ========== RESIZE HANDLER ==========
let resizeTimer = null;
window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.currentScreen === 'reader' && !isEpubMode && pdfDoc) {
      renderPdfPage(pdfCurrentPage);
    }
  }, 300);
});
loadOfflineBookIds();

// ========== ОНБОРДИНГ-ТЕСТ ==========
