// PDF/EPUB loading and rendering core.
// Loaded as a classic script before app.js; shared reader state lives in app-state.js.

async function loadEpub(b) {
  isEpubMode = true;
  document.getElementById('pdfViewport').classList.add('hidden');
  document.getElementById('epubViewport').classList.remove('hidden');
  document.getElementById('annotationLayer').replaceChildren();

  const container = document.getElementById('epubContainer');
  renderLoadingSpinner(container, 'Загрузка книги…');

  // Лениво подгружаем epub.js при первом открытии EPUB
  try {
    await ensureEpubLoaded();
  } catch (e) {
    replaceWithStaticText(container, 'Не удалось загрузить EPUB-движок. Проверьте соединение.', 'a507');
    return;
  }

  let epubFromCache = false;
  try {
    let epubData = null;
    let fromOffline = false;

    // 1. Сначала пробуем IndexedDB
    if (offlineBookIds.has(b.id)) {
      try {
        const blob = await offlineStorage.getFile(currentOfflineUserId(), b.id, 'epub');
        if (blob) {
          epubData = await blob.arrayBuffer();
          fromOffline = true;
        }
      } catch (e) {
        console.warn('Не удалось прочитать EPUB из IndexedDB:', e);
      }
    }

    // 2. Книгу уже открывали на этом устройстве — берём файл из кэша.
    if (!epubData) {
      const cached = await readBookFromCache(b, 'epub');
      if (cached) {
        epubData = await cached.arrayBuffer();
        epubFromCache = true;
      }
    }

    // 3. Нигде нет — скачиваем и кладём в кэш для следующих открытий.
    if (!epubData) {
      if (!b.has_file) {
        showToast('EPUB-файл не найден');
        closeReader();
        return;
      }
      try {
        const resp = await api.request('/books/' + b.id + '/epub', { raw: true });
        epubData = await resp.arrayBuffer();
        writeBookToCache(b, 'epub', epubData.slice(0));
      } catch (err) {
        showToast('Нет связи. Сохраните книгу оффлайн заранее.');
        closeReader();
        return;
      }
    }

    // 4. Рендерим EPUB
    if (typeof ePub === 'undefined') {
      showToast('EPUB-движок не загрузился. Проверьте интернет/доступ к CDN.');
      closeReader();
      return;
    }
    const book = ePub(epubData);
    epubBook = book;
    epubLocationsReady = false;
    // Убираем спиннер до renderTo: очистка после renderTo удаляет созданный
    // epub.js iframe и оставляет rendition в неконсистентном состоянии.
    container.replaceChildren();
    epubRendition = book.renderTo(container, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      allowScriptedContent: false,
    });
    const rendition = epubRendition;
    // Применяем тему после создания rendition
    setTimeout(() => applyReaderTheme(getReaderTheme()), 100);

    // До book.ready spine ещё может быть пустым: locations.generate() тогда
    // молча создаёт ноль CFI и восстановить сохранённую позицию невозможно.
    await book.ready;
    if (book !== epubBook) return;   // пока готовились, читалку закрыли или открыли другую книгу

    // Нумерация страниц (locations) у epub.js считается по всему тексту книги:
    // на большой книге это десятки секунд, а на телефоне — минута. Раньше
    // книга показывалась только после подсчёта, и всё это время читатель
    // видел пустой экран — «EPUB не открывается». Теперь нумерация берётся
    // из кэша, а если её там нет, книга открывается сразу, а страницы
    // досчитываются фоном.
    const savedPage = state.readingProgress[b.id]?.currentPage || 1;
    const savedTotal = state.readingProgress[b.id]?.totalPages || 0;
    const restored = await restoreEpubLocations(b, book);
    if (book !== epubBook) return;

    let startCfi;
    if (restored) {
      applyEpubLocations(b, book, savedPage);
      // Место на этом устройстве (CFI) точнее номера страницы: страница —
      // это кусок в 1000 знаков, и открытие по номеру сдвигало читателя на
      // начало экрана. Берём CFI, если он о том же месте, что и прогресс на
      // сервере; иначе читали на другом устройстве — открываем по номеру.
      const localCfi = getSavedEpubCfi(b.id);
      const localPage = localCfi ? book.locations.locationFromCfi(localCfi) + 1 : 0;
      if (localCfi && localPage > 0 && Math.abs(localPage - epubCurrentPage) <= 2) {
        startCfi = localCfi;
      } else {
        const cfi = book.locations.cfiFromLocation(epubCurrentPage - 1);
        startCfi = typeof cfi === 'string' ? cfi : undefined;
      }
    } else {
      // Пока нумерации нет, место чтения на этом устройстве восстанавливаем
      // по CFI, а номер страницы показываем последний известный.
      startCfi = getSavedEpubCfi(b.id) || undefined;
      epubTotalPages = Math.max(savedTotal, savedPage, 1);
      epubCurrentPage = savedPage;
    }
    if (!state.readingProgress[b.id]) {
      state.readingProgress[b.id] = { currentPage: epubCurrentPage, totalPages: epubTotalPages, started: false };
    }

    updatePageIndicator();

    rendition.on('relocated', (loc) => {
      if (!loc || !loc.start || !loc.start.cfi) return;
      saveEpubCfi(b.id, loc.start.cfi);
      if (!epubLocationsReady || book !== epubBook) return;
      // Нужна строка CFI: объект loc.start epub.js не принимает и падает
      // внутри сравнения CFI, из-за чего номер страницы не обновлялся.
      const current = book.locations.locationFromCfi(loc.start.cfi);
      // epub.js возвращает -1 для CFI до первой сгенерированной локации.
      // Такой результат нельзя превращать в current_page=0: API его отвергает.
      if (Number.isInteger(current) && current >= 0) {
        epubCurrentPage = current + 1;
        if (state.currentBook) {
          state.readingProgress[state.currentBook.id].currentPage = epubCurrentPage;
          scheduleProgressSave(state.currentBook.id);
        }
        updatePageIndicator();
      }
    });

    await rendition.display(startCfi);
    if (book !== epubBook) return;

    if (!restored) generateEpubLocationsInBackground(b, book, rendition, savedPage, !!startCfi);

// === Выделение текста в EPUB ===
    epubRendition.on('selected', (cfiRange, contents) => {
      handleEpubSelection(cfiRange, contents);
    });

    // Подгружаем уже сохранённые highlights и рендерим их поверх текста
    await loadAndApplyEpubHighlights();

    saveState();
    if (fromOffline) showToast('Читаем из оффлайн-хранилища');
  } catch (err) {
    // Испорченная копия в кэше не должна ломать книгу при каждом открытии.
    if (epubFromCache) dropBookFromCache(b);
    console.error('Ошибка загрузки EPUB:', err);
    showToast('Не удалось загрузить EPUB');
    closeReader();
  }
}

// ---------- Нумерация страниц EPUB ----------
const EPUB_LOCATION_CHARS = 1000;

async function restoreEpubLocations(b, book) {
  try {
    const blob = await readBookFromCache(b, 'locations');
    if (!blob) return false;
    book.locations.load(await blob.text());
    return Number(book.locations.length()) > 0;
  } catch (error) {
    console.warn('Нумерация EPUB из кэша не подошла:', error);
    return false;
  }
}

// Нумерация готова: выставляем число страниц и текущую страницу.
function applyEpubLocations(b, book, page) {
  // epub.js возвращает из generate() массив CFI, а не объект с полем total.
  // Из-за чтения location.total число страниц всегда становилось равным 1,
  // и сохранённая позиция любой EPUB-книги сбрасывалась на начало.
  epubTotalPages = Math.max(1, Number(book.locations.length()) || 1);
  epubCurrentPage = Math.min(Math.max(1, page || 1), epubTotalPages);
  epubLocationsReady = true;
  if (state.readingProgress[b.id]) state.readingProgress[b.id].totalPages = epubTotalPages;
}

function generateEpubLocationsInBackground(b, book, rendition, savedPage, positionedByCfi) {
  const indicator = document.getElementById('pageIndicatorTop');
  if (indicator && book === epubBook) indicator.textContent = 'Считаем страницы…';
  book.locations.generate(EPUB_LOCATION_CHARS)
    .then(() => {
      // Нумерацию сохраняем, даже если книгу уже закрыли: следующее открытие
      // будет мгновенным.
      saveEpubLocations(b, book);
      if (book !== epubBook) return;

      // Номер страницы берём из того места, где читатель сейчас: пока шёл
      // подсчёт, он мог уже полистать.
      const cfi = rendition.currentLocation()?.start?.cfi;
      const location = cfi ? book.locations.locationFromCfi(cfi) : -1;
      const current = Number.isInteger(location) && location >= 0 ? location + 1 : 1;
      applyEpubLocations(b, book, current);
      updatePageIndicator();

      // Прогресс с другого устройства известен только номером страницы:
      // переходим к нему, если читатель ещё не листал сам.
      if (!positionedByCfi && savedPage > 1 && current <= 1) {
        goToPage(savedPage);
      } else if (state.readingProgress[b.id] && state.readingProgress[b.id].currentPage !== current) {
        state.readingProgress[b.id].currentPage = current;
        scheduleProgressSave(b.id);
      }
    })
    .catch(error => {
      if (book === epubBook) console.warn('Не удалось посчитать страницы EPUB:', error);
    });
}

function saveEpubLocations(b, book) {
  try {
    const json = book.locations.save();
    if (!json) return;
    const userId = currentOfflineUserId();
    if (!userId || typeof offlineStorage === 'undefined' || !offlineStorage.cachePut) return;
    offlineStorage.cachePut(
      userId, b.id, 'locations',
      new Blob([json], { type: 'application/json' }),
      b.file_version || null,
    ).catch(error => console.warn('Не удалось сохранить нумерацию EPUB:', error));
  } catch (error) {
    console.warn('Не удалось сохранить нумерацию EPUB:', error);
  }
}

// Последнее место чтения EPUB на этом устройстве (CFI) — чтобы открыть книгу
// на нужной странице, не дожидаясь нумерации.
function _readEpubCfiMap() {
  try { return JSON.parse(lsGet(EPUB_CFI_KEY) || '{}') || {}; }
  catch (_) { return {}; }
}

function getSavedEpubCfi(bookId) {
  const cfi = _readEpubCfiMap()[bookId];
  return typeof cfi === 'string' && cfi.startsWith('epubcfi(') ? cfi : null;
}

function saveEpubCfi(bookId, cfi) {
  const map = _readEpubCfiMap();
  if (map[bookId] === cfi) return;
  map[bookId] = cfi;
  lsSet(EPUB_CFI_KEY, JSON.stringify(map));
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
  renderLoadingSpinner(pl, 'Загрузка книги…');
  c.classList.add('hidden');

  // Если загрузка затянулась (большой PDF) — обновляем подпись, чтобы человек
  // понимал, что всё идёт штатно, просто книга большая.
  if (window._bookLoadHintTimer) clearTimeout(window._bookLoadHintTimer);
  window._bookLoadHintTimer = setTimeout(() => {
    const sp = document.getElementById('pdfPlaceholder');
    if (sp && sp.querySelector('.aegis-spinner')) {
      renderLoadingSpinner(sp, 'Загружаем большую книгу, ещё несколько секунд…');
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
      const blob = await offlineStorage.getFile(currentOfflineUserId(), b.id, 'pdf');
      if (blob) {
        bytes = await blob.arrayBuffer();
        fromOffline = true;
      }
    } catch (e) {
      console.warn('Не удалось прочитать PDF из IndexedDB:', e);
    }
  }

  // Книгу уже открывали на этом устройстве — читаем из кэша без сети.
  let fromCache = false;
  if (!bytes) {
    const cached = await readBookFromCache(b, 'pdf');
    if (myToken !== _pdfLoadToken) return;   // пока читали кэш, открыли другую книгу
    if (cached) {
      bytes = await cached.arrayBuffer();
      fromCache = true;
    }
  }

  if (typeof pdfjsLib === 'undefined') {
    showToast('PDF-движок не загрузился. Проверьте интернет/доступ к CDN.');
    return;
  }

  // Если не оффлайн и не в кэше — грузим ПРОГРЕССИВНО по URL (pdf.js тянет страницы по частям,
  // первая страница появляется почти сразу, не дожидаясь всего файла).
  try {
    let loadingTask;
    if ((fromOffline || fromCache) && bytes) {
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
        renderLoadingSpinner(box, `Загрузка книги… ${pct}%`);
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
    pdfZoom = 1;

    if (window._bookLoadHintTimer) { clearTimeout(window._bookLoadHintTimer); window._bookLoadHintTimer = null; }
    pl.classList.add('hidden');
    c.classList.remove('hidden');
    updatePageIndicator();
    
    // Ждём, пока canvas станет видимым
    setTimeout(async () => {
      await renderPdfPage(pdfCurrentPage);
    }, 100);

    // Читалка тянет PDF кусками и целого файла не держит. Чтобы следующее
    // открытие шло с устройства, докачиваем файл в кэш фоном — с паузой,
    // чтобы не мешать первым страницам.
    if (!fromOffline && !fromCache) {
      setTimeout(() => cacheBookInBackground(b, 'pdf'), 3000);
    }

    if (fromOffline) showToast('Читаем из оффлайн-хранилища');
  } catch (err) {
    if (fromCache) dropBookFromCache(b);
    console.error('Ошибка рендеринга PDF:', err);
    showToast('Ошибка: ' + err.message);
    generateDemoPdf(b);
  }
}

function generateDemoPdf(b) {
  pdfTotalPages = state.readingProgress[b.id]?.totalPages || 10;
  pdfCurrentPage = Math.min(state.readingProgress[b.id]?.currentPage || 1, pdfTotalPages);
  updatePageIndicator();
  const placeholder = document.getElementById('pdfPlaceholder');
  const cover = document.createElement('div');
  cover.setAttribute('data-static-style', 'a239');
  appendTrustedIcon(cover, ICONS.bookCover);
  const title = document.createElement('p');
  title.textContent = String(b.title || '');
  const page = document.createElement('p');
  page.textContent = `Стр.${pdfCurrentPage}/${pdfTotalPages}`;
  placeholder.replaceChildren(cover, title, page);
  renderAnnotations();
}

// ---------- Кэш отрисованных страниц PDF ----------
// Ключ — номер страницы и размер; держим несколько последних страниц.
const PDF_PAGE_CACHE_LIMIT = 3;
let _pdfPageCache = { doc: null, items: new Map() };

function _pdfCacheFor(doc) {
  if (_pdfPageCache.doc !== doc) _pdfPageCache = { doc, items: new Map() };
  return _pdfPageCache.items;
}

async function getRenderedPdfPage(pn, page, viewport, dpr, targetWidth) {
  const cache = _pdfCacheFor(pdfDoc);
  const key = pn + '@' + targetWidth + 'x' + dpr;
  const cached = cache.get(key);
  if (cached) {
    try {
      const ready = await cached;
      cache.delete(key);
      cache.set(key, Promise.resolve(ready));
      return ready;
    } catch (_) {
      // Предыдущую отрисовку этой страницы отменили — рисуем заново.
      cache.delete(key);
    }
  }
  const work = renderPdfPageOffscreen(page, viewport, dpr, true);
  cache.set(key, work);
  try {
    return await work;
  } catch (err) {
    cache.delete(key);
    throw err;
  } finally {
    while (cache.size > PDF_PAGE_CACHE_LIMIT) cache.delete(cache.keys().next().value);
  }
}

async function renderPdfPageOffscreen(page, viewport, dpr, cancellable) {
  const off = document.createElement('canvas');
  off.width = Math.floor(viewport.width * dpr);
  off.height = Math.floor(viewport.height * dpr);
  const ctx = off.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, off.width, off.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const task = page.render({ canvasContext: ctx, viewport });
  if (cancellable) {
    if (_pdfRenderTask) { try { _pdfRenderTask.cancel(); } catch (_) { /* уже завершён */ } }
    _pdfRenderTask = task;
  }
  try {
    await task.promise;
  } finally {
    if (cancellable && _pdfRenderTask === task) _pdfRenderTask = null;
  }
  return off;
}

function schedulePdfNeighbourPrerender(pn, dpr, targetWidth, token) {
  const doc = pdfDoc;
  const run = async () => {
    for (const next of [pn + 1, pn - 1]) {
      if (token !== _pdfRenderToken || doc !== pdfDoc) return;
      if (next < 1 || next > pdfTotalPages) continue;
      const cache = _pdfCacheFor(doc);
      const key = next + '@' + targetWidth + 'x' + dpr;
      if (cache.has(key)) continue;
      try {
        const page = await doc.getPage(next);
        const viewport = page.getViewport({ scale: targetWidth / page.getViewport({ scale: 1 }).width });
        const work = renderPdfPageOffscreen(page, viewport, dpr, false);
        cache.set(key, work);
        await work;
        while (cache.size > PDF_PAGE_CACHE_LIMIT) cache.delete(cache.keys().next().value);
      } catch (_) {
        _pdfCacheFor(doc).delete(key);
      }
    }
  };
  const idle = window.requestIdleCallback || (cb => setTimeout(cb, 120));
  idle(() => { run(); });
}

function showPdfPageLoading(visible) {
  const viewportEl = document.getElementById('pdfViewport');
  if (!viewportEl) return;
  let spinner = document.getElementById('pdfPageLoading');
  if (!spinner && visible) {
    spinner = document.createElement('div');
    spinner.id = 'pdfPageLoading';
    spinner.className = 'pdf-page-loading';
    spinner.setAttribute('role', 'status');
    spinner.setAttribute('aria-label', 'Страница загружается');
    viewportEl.appendChild(spinner);
  }
  if (spinner) spinner.classList.toggle('is-visible', Boolean(visible));
  viewportEl.classList.toggle('is-page-loading', Boolean(visible));
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
  // Телефон, планшет, складной телефон: страница во всю ширину — так текст
  // крупнее всего. На ПК с мышью — колонка удобной ширины, как раньше.
  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const isMobile = isTouch || window.innerWidth < 700;
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
  targetWidth = Math.floor(Math.min(targetWidth * fontScale, containerWidth - (isMobile ? 0 : 12)));
  // Увеличение щипком: страница шире экрана, по ней можно водить пальцем.
  if (pdfZoom > 1) targetWidth = Math.floor(targetWidth * pdfZoom);
  container.classList.toggle('is-zoomed', pdfZoom > 1);

  // Плотность выше 2 на глаз не отличается, а память на телефоне съедает
  // втрое (страница в кэше при 3x — около 60 МБ).
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = targetWidth / viewport1.width;
  const viewport = page.getViewport({ scale });

  // Страница рисуется во внеэкранный холст, а на экране до этого остаётся
  // предыдущая. Раньше видимый холст очищался сразу, и пока тяжёлая страница
  // рисовалась, читатель видел пустой белый лист.
  const loadingTimer = setTimeout(() => showPdfPageLoading(true), 250);
  let rendered;
  try {
    rendered = await getRenderedPdfPage(pn, page, viewport, dpr, targetWidth);
  } catch (err) {
    clearTimeout(loadingTimer);
    showPdfPageLoading(false);
    if (err && err.name === 'RenderingCancelledException') return;
    throw err;
  }
  clearTimeout(loadingTimer);
  if (myToken !== _pdfRenderToken) return;
  showPdfPageLoading(false);

  const canvas = document.getElementById('pdfCanvas');
  canvas.width = rendered.width;
  canvas.height = rendered.height;
  canvas.style.width = targetWidth + 'px';
  canvas.style.height = 'auto';
  canvas.style.display = 'block';
  canvas.style.margin = pdfZoom > 1 ? '0' : '0 auto';
  // Первая страница (обложка) не инвертируется в тёмной теме
  if (pn === 1) canvas.classList.add('no-invert');
  else canvas.classList.remove('no-invert');
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(rendered, 0, 0);

  // Соседние страницы готовим заранее — листание становится мгновенным.
  schedulePdfNeighbourPrerender(pn, dpr, targetWidth, myToken);

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
