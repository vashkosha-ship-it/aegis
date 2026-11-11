// PDF/EPUB loading and rendering core.
// Loaded as a classic script before app.js; shared reader state lives in app-state.js.

async function loadEpub(b) {
  isEpubMode = true;
  if (typeof updatePdfZoomControls === 'function') updatePdfZoomControls();
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
    if (typeof hardenEpubBook === 'function') hardenEpubBook(book);
    epubBook = book;
    // Встроенные стили книги — в разрешённом CSP виде (иначе их блокировали).
    if (typeof attachEpubCspStyles === 'function') {
      if (typeof epubCspCleanup === 'function') epubCspCleanup();
      epubCspCleanup = attachEpubCspStyles(book);
    }
    if (typeof refreshTocAvailability === 'function') refreshTocAvailability();
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
    if (typeof attachEpubMovedStylesApply === 'function') attachEpubMovedStylesApply(rendition);
    // Применяем тему после создания rendition
    setTimeout(() => applyReaderTheme(getReaderTheme()), 100);

    // До book.ready spine ещё может быть пустым: locations.generate() тогда
    // молча создаёт ноль CFI и восстановить сохранённую позицию невозможно.
    if (typeof waitEpubUsable === 'function') await waitEpubUsable(book);
    else await book.ready;
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
      const startLocation = book.locations.locationFromCfi(loc.start.cfi);
      const endLocation = loc.end && loc.end.cfi ? book.locations.locationFromCfi(loc.end.cfi) : startLocation;
      // Страница — кусок в 1000 знаков, а на экране их помещается несколько.
      // Если нужная страница (после перехода по номеру) уже на экране,
      // оставляем её номер, иначе он съезжал бы на начало экрана.
      const shown = epubCurrentPage - 1;
      const current = Number.isInteger(startLocation) && startLocation >= 0
        && Number.isInteger(endLocation) && shown >= startLocation && shown <= endLocation
        ? shown
        : startLocation;
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
      const cfi = currentEpubCfi(rendition);
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

// Пока epub.js перерисовывает страницу (читатель листает), currentLocation()
// бросает исключение изнутри библиотеки. Это не ошибка — места просто ещё нет.
function currentEpubCfi(rendition) {
  try {
    const cfi = rendition.currentLocation()?.start?.cfi;
    return typeof cfi === 'string' ? cfi : null;
  } catch (_) {
    return null;
  }
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
    if (typeof refreshTocAvailability === 'function') refreshTocAvailability();
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

    // Скан без текста — один раз предупреждаем, что не будет работать.
    // Проверяем после первой страницы, чтобы не задерживать её показ.
    if (typeof checkScannedBookNotice === 'function') {
      setTimeout(() => checkScannedBookNotice(
        b.id, loadedDoc,
        () => myToken === _pdfLoadToken && state.currentScreen === 'reader',
      ), 1500);
    }

    // Читалка тянет PDF кусками и целого файла не держит. Чтобы следующее
    // открытие шло с устройства, докачиваем файл в кэш фоном — с паузой,
    // чтобы не мешать первым страницам.
    // Только для небольших файлов: скан на сотни мегабайт, скачиваемый
    // целиком, надолго забивает канал, и всё приложение начинает тормозить.
    // Большие книги по-прежнему читаются кусками, офлайн их сохраняют кнопкой.
    if (!fromOffline && !fromCache) {
      setTimeout(async () => {
        let size = 0;
        try { size = Number((await loadedDoc.getDownloadInfo()).length) || 0; } catch (_) { /* размер неизвестен */ }
        if (size > 0 && size <= BOOK_CACHE_BACKGROUND_MAX_BYTES) cacheBookInBackground(b, 'pdf');
      }, 3000);
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

// Ключ кэша отрисованной страницы: тёмная и светлая версии хранятся отдельно.
function _pdfCacheKey(pn, targetWidth, dpr, dark) {
  return pn + '@' + targetWidth + 'x' + dpr + (dark ? ':dark' : '');
}

// Тёмная тема — у этой страницы? Первая страница (обложка) не перекрашивается.
function pdfPageIsDark(pn) {
  return pn !== 1 && typeof getReaderTheme === 'function' && getReaderTheme() === 'dark';
}

// Страница целиком, уже в нужной теме. Тёмная версия собирается вне экрана —
// раньше на экране сперва появлялась светлая страница и лишь потом темнела.
async function renderPdfPageReady(page, viewport, dpr, cancellable, dark) {
  if (!dark) return renderPdfPageOffscreen(page, viewport, dpr, cancellable);
  // Где на странице картинки — считаем параллельно с отрисовкой.
  const rectsWork = pdfImageRects(page, viewport, dpr).catch(() => []);
  const rendered = await renderPdfPageOffscreen(page, viewport, dpr, cancellable);
  const rects = await rectsWork;
  const out = document.createElement('canvas');
  out.width = rendered.width;
  out.height = rendered.height;
  try {
    paintPdfDark(out.getContext('2d'), rendered, rects);
  } catch (err) {
    console.warn('Тёмная тема страницы не применилась:', err);
    return rendered;
  }
  // Исходная светлая отрисовка больше не нужна — освобождаем память.
  rendered.width = 0;
  rendered.height = 0;
  return out;
}

async function getRenderedPdfPage(pn, page, viewport, dpr, targetWidth, dark = false) {
  const cache = _pdfCacheFor(pdfDoc);
  const key = _pdfCacheKey(pn, targetWidth, dpr, dark);
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
  const work = renderPdfPageReady(page, viewport, dpr, true, dark);
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
  _pdfBackgroundTasks.add(task);
  if (cancellable) {
    if (_pdfRenderTask) { try { _pdfRenderTask.cancel(); } catch (_) { /* уже завершён */ } }
    _pdfRenderTask = task;
  }
  try {
    await task.promise;
  } finally {
    _pdfBackgroundTasks.delete(task);
    if (cancellable && _pdfRenderTask === task) _pdfRenderTask = null;
  }
  return off;
}

// Все незавершённые отрисовки, включая фоновую подготовку соседних страниц.
const _pdfBackgroundTasks = new Set();

// Выход из книги. Тяжёлую страницу (например, обложку-JPEG на 5 МБ) телефон
// декодирует десятки секунд; раньше это продолжалось и после нажатия
// «назад», и приложение подвисало. Теперь всё незавершённое отменяется,
// а кэш отрисованных страниц освобождается.
function stopPdfRendering() {
  _pdfRenderToken += 1;
  _pdfLoadToken += 1;
  if (_pdfRenderTask) {
    try { _pdfRenderTask.cancel(); } catch (_) { /* уже завершён */ }
    _pdfRenderTask = null;
  }
  _pdfBackgroundTasks.forEach(task => {
    try { task.cancel(); } catch (_) { /* уже завершён */ }
  });
  _pdfBackgroundTasks.clear();
  if (typeof showPdfPageLoading === 'function') showPdfPageLoading(false);
  if (window._bookLoadHintTimer) { clearTimeout(window._bookLoadHintTimer); window._bookLoadHintTimer = null; }
  if (pdfDoc) {
    try { _pdfCacheFor(pdfDoc).clear(); } catch (_) { /* кэша нет */ }
    try { pdfDoc.cleanup(); } catch (_) { /* документ уже закрыт */ }
  }
}

function schedulePdfNeighbourPrerender(pn, dpr, targetWidth, token, onlyNext = false) {
  const doc = pdfDoc;
  const run = async () => {
    // Следующую страницу готовим всегда: читают вперёд, и именно на слабом
    // телефоне без этого каждое листание ждёт отрисовки. Предыдущую — только
    // если устройство и страница лёгкие.
    for (const next of PDF_WEAK_DEVICE || onlyNext ? [pn + 1] : [pn + 1, pn - 1]) {
      if (token !== _pdfRenderToken || doc !== pdfDoc) return;
      if (next < 1 || next > pdfTotalPages) continue;
      const cache = _pdfCacheFor(doc);
      const dark = pdfPageIsDark(next);
      const key = _pdfCacheKey(next, targetWidth, dpr, dark);
      if (cache.has(key)) continue;
      try {
        const page = await doc.getPage(next);
        const viewport = page.getViewport({ scale: targetWidth / page.getViewport({ scale: 1 }).width });
        const work = renderPdfPageReady(page, viewport, dpr, false, dark);
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

// ========== ТЁМНАЯ ТЕМА PDF БЕЗ ИНВЕРСИИ КАРТИНОК ==========
// Раньше вся страница инвертировалась CSS-фильтром — вместе с фотографиями
// и схемами (негатив). Теперь инвертируем страницу, а иллюстрации внутри
// картинок, которые рисовал pdf.js, возвращаем из исходной отрисовки.
function _pdfMul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

async function pdfImageRects(page, viewport, dpr) {
  const OPS = pdfjsLib.OPS;
  const list = await page.getOperatorList();
  const rects = [];
  const stack = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || ctm;
    else if (fn === OPS.transform) ctm = _pdfMul(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      if (Array.isArray(args?.[0]) && args[0].length === 6) ctm = _pdfMul(ctm, args[0]);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || ctm;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintJpegXObject) {
      // Картинка рисуется в единичный квадрат текущей системы координат.
      const m = _pdfMul(viewport.transform, ctm);
      const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]];
      const ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
      // Внутрь на пиксель: иначе по краю картинки остаётся светлая полоса фона.
      const x = Math.ceil(Math.min(...xs) * dpr) + 1;
      const y = Math.ceil(Math.min(...ys) * dpr) + 1;
      const w = Math.floor(Math.max(...xs) * dpr) - 1 - x;
      const h = Math.floor(Math.max(...ys) * dpr) - 1 - y;
      if (w > 2 && h > 2) rects.push({ x, y, w, h });
    }
  }
  return rects;
}

// Инверсия светлоты с сохранением оттенка — то же, что invert + hue-rotate(180°).
function _invertLightness(ctx, width, height) {
  const image = ctx.getImageData(0, 0, width, height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const shift = 255 - Math.max(r, g, b) - Math.min(r, g, b);
    d[i] = r + shift; d[i + 1] = g + shift; d[i + 2] = b + shift;
  }
  ctx.putImageData(image, 0, 0);
}

// Где внутри картинки настоящие иллюстрации. Картинкой в PDF бывает и
// отдельная фотография, и вся страница целиком (сканы: текст, фон и рисунки —
// одно изображение). Поэтому решаем не «вся картинка да/нет», а по клеткам:
// клетка с текстом — светлый бесцветный фон и тёмные штрихи; клетка
// иллюстрации — цвет или полутона. Связные группы клеток иллюстраций
// возвращаем в исходных цветах, всё остальное (текст, фон, чёрно-белые схемы)
// перекрашивается вместе со страницей.
const DARK_TILES_PER_PAGE = 48;
const DARK_TILE_PICTURE_SHARE = 0.35;

function _looksLikeText(paperShare, inkShare) {
  return paperShare > 0.25 && inkShare > 0.04;
}

// Цвет бумаги этой страницы: самый частый светлый бесцветный цвет. Сравниваем
// с ним, а не просто «светлое = бумага»: иначе бледное небо или светлый фон
// на фотографии принимались за бумагу и темнели.
function _paperColor(d) {
  const bins = new Map();
  for (let i = 0; i < d.length; i += 16) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b);
    if (max < 190 || max - Math.min(r, g, b) >= 45) continue;
    const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3);
    const bin = bins.get(key);
    if (bin) { bin.n++; bin.r += r; bin.g += g; bin.b += b; } else bins.set(key, { n: 1, r, g, b });
  }
  let best = null;
  bins.forEach(bin => { if (!best || bin.n > best.n) best = bin; });
  return best ? [best.r / best.n, best.g / best.n, best.b / best.n] : [255, 255, 255];
}

const DARK_PAPER_TOLERANCE = 20;

function _pixelKind(r, g, b, paper) {
  if (Math.abs(r - paper[0]) <= DARK_PAPER_TOLERANCE
    && Math.abs(g - paper[1]) <= DARK_PAPER_TOLERANCE
    && Math.abs(b - paper[2]) <= DARK_PAPER_TOLERANCE) return 0; // бумага
  if (Math.max(r, g, b) <= 110 && Math.max(r, g, b) - Math.min(r, g, b) < 45) return 1; // чернила
  return 2; // цвет или полутон — признак иллюстрации
}

function _pictureRegions(source, r, pageWidth) {
  const tile = Math.max(8, Math.round(pageWidth / DARK_TILES_PER_PAGE));
  const cols = Math.ceil(r.w / tile);
  const rows = Math.ceil(r.h / tile);
  const d = source.getContext('2d').getImageData(r.x, r.y, r.w, r.h).data;
  const paperColor = _paperColor(d);
  const total = new Uint32Array(cols * rows);
  const picture = new Uint32Array(cols * rows);
  const paper = new Uint32Array(cols * rows);
  const ink = new Uint32Array(cols * rows);
  // Каждый второй пиксель по обеим осям — в 4 раза быстрее, точности хватает.
  for (let y = 0; y < r.h; y += 2) {
    const rowBase = Math.floor(y / tile) * cols;
    for (let x = 0; x < r.w; x += 2) {
      const i = (y * r.w + x) * 4;
      const t = rowBase + Math.floor(x / tile);
      total[t]++;
      const kind = _pixelKind(d[i], d[i + 1], d[i + 2], paperColor);
      if (kind === 2) picture[t]++;
      else if (kind === 0) paper[t]++;
      else ink[t]++;
    }
  }
  const isPicture = new Uint8Array(cols * rows);
  for (let t = 0; t < isPicture.length; t++) {
    // Вокруг текста на сканах тоже есть полутона (сглаживание, шум JPEG), но
    // текст — это всегда бумага и чернила вместе; в иллюстрации такой пары нет.
    isPicture[t] = total[t]
      && picture[t] / total[t] > DARK_TILE_PICTURE_SHARE
      && !_looksLikeText(paper[t] / total[t], ink[t] / total[t]) ? 1 : 0;
  }
  // Группы клеток (разрыв в одну клетку не делит иллюстрацию на части).
  const seen = new Uint8Array(cols * rows);
  const regions = [];
  for (let start = 0; start < isPicture.length; start++) {
    if (!isPicture[start] || seen[start]) continue;
    const queue = [start];
    seen[start] = 1;
    let minC = cols, maxC = -1, minR = rows, maxR = -1, count = 0;
    while (queue.length) {
      const t = queue.pop();
      const c = t % cols, row = (t - c) / cols;
      count++;
      if (c < minC) minC = c; if (c > maxC) maxC = c;
      if (row < minR) minR = row; if (row > maxR) maxR = row;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nc = c + dx, nr = row + dy;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          const n = nr * cols + nc;
          if (isPicture[n] && !seen[n]) { seen[n] = 1; queue.push(n); }
        }
      }
    }
    const spanC = maxC - minC + 1, spanR = maxR - minR + 1;
    // Цветной заголовок или выделенное слово — узкая полоса, не иллюстрация.
    if (spanC < 4 || spanR < 3 || count / (spanC * spanR) < 0.4) continue;
    regions.push(_refineRegion(d, r, paperColor, {
      x: minC * tile, y: minR * tile,
      w: Math.min(r.w, (maxC + 1) * tile) - minC * tile,
      h: Math.min(r.h, (maxR + 1) * tile) - minR * tile,
    }, tile));
  }
  return regions.map(g => ({ x: r.x + g.x, y: r.y + g.y, w: g.w, h: g.h, paper: paperColor }));
}

// Подгоняем края к самой иллюстрации: клетки грубые, без этого вокруг
// рисунка остаётся белая рамка или срезается его край.
function _refineRegion(d, r, paperColor, g, tile) {
  // Похожа ли строка или столбец пикселей на продолжение рисунка.
  const isPictureLine = (x0, y0, x1, y1) => {
    let pic = 0, pap = 0, inkCount = 0, n = 0;
    for (let y = Math.max(0, y0); y < Math.min(r.h, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(r.w, x1); x++) {
        const i = (y * r.w + x) * 4;
        const kind = _pixelKind(d[i], d[i + 1], d[i + 2], paperColor);
        n++;
        if (kind === 2) pic++; else if (kind === 0) pap++; else inkCount++;
      }
    }
    if (!n) return false;
    return pic / n > 0.3 && pap / n < 0.9 && !_looksLikeText(pap / n, inkCount / n);
  };
  let { x, y, w, h } = g;
  const limit = tile;
  // Наружу — пока за краем продолжается рисунок.
  for (let k = 0; k < limit && y > 0 && isPictureLine(x, y - 1, x + w, y); k++) { y--; h++; }
  for (let k = 0; k < limit && y + h < r.h && isPictureLine(x, y + h, x + w, y + h + 1); k++) h++;
  for (let k = 0; k < limit && x > 0 && isPictureLine(x - 1, y, x, y + h); k++) { x--; w++; }
  for (let k = 0; k < limit && x + w < r.w && isPictureLine(x + w, y, x + w + 1, y + h); k++) w++;
  // Внутрь — пока край не рисунок (поля, подпись под ним).
  for (let k = 0; k < limit && h > 2 && !isPictureLine(x, y, x + w, y + 1); k++) { y++; h--; }
  for (let k = 0; k < limit && h > 2 && !isPictureLine(x, y + h - 1, x + w, y + h); k++) h--;
  for (let k = 0; k < limit && w > 2 && !isPictureLine(x, y, x + 1, y + h); k++) { x++; w--; }
  for (let k = 0; k < limit && w > 2 && !isPictureLine(x + w - 1, y, x + w, y + h); k++) w--;
  return { x, y, w, h };
}

// Работает ли фильтр холста на самом деле. Safari принимает ctx.filter, но
// при рисовании его игнорирует — страница оставалась белой. Проверяем делом:
// белая точка через invert должна стать чёрной.
let _canvasFilterOk = null;
function canvasFilterWorks() {
  if (_canvasFilterOk !== null) return _canvasFilterOk;
  _canvasFilterOk = false;
  try {
    const src = document.createElement('canvas');
    src.width = src.height = 1;
    const sctx = src.getContext('2d');
    sctx.fillStyle = '#fff';
    sctx.fillRect(0, 0, 1, 1);
    const dst = document.createElement('canvas');
    dst.width = dst.height = 1;
    const dctx = dst.getContext('2d', { willReadFrequently: true });
    dctx.filter = 'invert(1)';
    dctx.drawImage(src, 0, 0);
    _canvasFilterOk = dctx.getImageData(0, 0, 1, 1).data[0] < 128;
  } catch (_) { /* остаёмся на ручной перекраске */ }
  return _canvasFilterOk;
}

// Возвращаем иллюстрации в исходных цветах. Логотип или рисунок на белом
// фоне раньше возвращался вместе с фоном — белые прямоугольники на тёмной
// странице. Теперь пиксели цвета бумаги внутри иллюстрации остаются тёмными.
const DARK_LOGO_PAPER_TOLERANCE = 32;

function _restorePicture(ctx, rendered, g) {
  if (!g.paper) {
    ctx.drawImage(rendered, g.x, g.y, g.w, g.h, g.x, g.y, g.w, g.h);
    return;
  }
  const original = rendered.getContext('2d').getImageData(g.x, g.y, g.w, g.h);
  const painted = ctx.getImageData(g.x, g.y, g.w, g.h);
  const o = original.data, out = painted.data;
  const [pr, pg, pb] = g.paper;
  const tol = DARK_LOGO_PAPER_TOLERANCE;
  for (let i = 0; i < o.length; i += 4) {
    if (Math.abs(o[i] - pr) <= tol && Math.abs(o[i + 1] - pg) <= tol && Math.abs(o[i + 2] - pb) <= tol) continue;
    out[i] = o[i];
    out[i + 1] = o[i + 1];
    out[i + 2] = o[i + 2];
  }
  ctx.putImageData(painted, g.x, g.y);
}

function paintPdfDark(ctx, rendered, rects) {
  const width = rendered.width;
  const height = rendered.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (canvasFilterWorks()) {
    ctx.filter = 'invert(1) hue-rotate(180deg)';
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(rendered, 0, 0);
    ctx.filter = 'none';
  } else {
    _invertLightness(ctx, width, height);
  }
  rects.forEach(r => {
    // Прямоугольник — строго внутри холста: Safari молча не рисует, если
    // исходная область выходит за край.
    const x = Math.max(0, r.x);
    const y = Math.max(0, r.y);
    const w = Math.min(width - x, r.w - (x - r.x));
    const h = Math.min(height - y, r.h - (y - r.y));
    if (w <= 0 || h <= 0) return;
    let regions;
    try {
      regions = _pictureRegions(rendered, { x, y, w, h }, width);
    } catch (_) {
      regions = [{ x, y, w, h }]; // не смогли разобрать — картинку не трогаем
    }
    regions.forEach(g => _restorePicture(ctx, rendered, g));
  });
  ctx.restore();
}

// Слабое устройство: мало ядер или памяти (дешёвые планшеты).
const PDF_WEAK_DEVICE = typeof navigator !== 'undefined' && (
  (navigator.hardwareConcurrency || 8) <= 4
  || (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 3));

// Плотность отрисовки. Выше 2 на глаз не отличается, а память съедает втрое.
// Кроме того, ограничиваем число точек холста: на большом планшете в
// горизонтальной ориентации страница при 2x — больше 9 млн точек, и
// дешёвый планшет рисует её секундами. На слабых устройствах — максимум 1.5x
// и 3 млн точек: текст остаётся чётким, страница появляется в разы быстрее.
function pdfRenderDpr(viewport) {
  const deviceDpr = window.devicePixelRatio || 1;
  let dpr = Math.min(deviceDpr, PDF_WEAK_DEVICE ? 1.5 : 2);
  const maxPixels = PDF_WEAK_DEVICE ? 3e6 : 8e6;
  const area = Math.max(1, viewport.width * viewport.height);
  dpr = Math.min(dpr, Math.sqrt(maxPixels / area));
  return Math.max(1, Math.round(dpr * 100) / 100);
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
  // Меньше 100 % — страница уже экрана (видна целиком в горизонтальной ориентации).
  if (pdfZoom !== 1) targetWidth = Math.floor(targetWidth * pdfZoom);
  container.classList.toggle('is-zoomed', pdfZoom > 1);
  if (typeof updatePdfZoomControls === 'function') updatePdfZoomControls();

  const scale = targetWidth / viewport1.width;
  const viewport = page.getViewport({ scale });
  const dpr = pdfRenderDpr(viewport);

  // Страница рисуется во внеэкранный холст, а на экране до этого остаётся
  // предыдущая. Раньше видимый холст очищался сразу, и пока тяжёлая страница
  // рисовалась, читатель видел пустой белый лист.
  const loadingTimer = setTimeout(() => showPdfPageLoading(true), 250);
  let rendered;
  const renderStartedAt = performance.now();
  try {
    rendered = await getRenderedPdfPage(pn, page, viewport, dpr, targetWidth, pdfPageIsDark(pn));
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
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // В тёмной теме страница уже перекрашена (renderPdfPageReady).
  ctx.drawImage(rendered, 0, 0);

  // Соседние страницы готовим заранее — листание становится мгновенным.
  // Тяжёлая страница (дольше полутора секунд) — готовим только следующую.
  schedulePdfNeighbourPrerender(pn, dpr, targetWidth, myToken,
    performance.now() - renderStartedAt >= 1500);

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
