// Офлайн-сессия и скачанные книги.
const offlineBookIds = new Set();
const CACHED_USER_KEY = 'aegis_cached_user';
// Последнее место чтения EPUB на устройстве: { bookId: CFI }.
const EPUB_CFI_KEY = 'aegis_epub_cfi';

function currentOfflineUserId() {
  const id = Number(state.currentUser && state.currentUser.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function uk(base, userId = currentOfflineUserId()) {
  const id = userId || 'anon';
  return base + ':' + id;
}

function lsGet(base) {
  const key = uk(base);
  let value = null;
  try { value = localStorage.getItem(key); } catch (_) { return null; }
  if (value === null) {
    try {
      const legacy = localStorage.getItem(base);
      if (legacy !== null) {
        localStorage.setItem(key, legacy);
        localStorage.removeItem(base);
        value = legacy;
      }
    } catch (_) { /* Миграция localStorage выполняется по возможности. */ }
  }
  return value;
}

function lsSet(base, value) {
  try { localStorage.setItem(uk(base), value); } catch (_) { /* Хранилище может быть отключено. */ }
}

function lsRemove(base, userId = currentOfflineUserId()) {
  try { localStorage.removeItem(uk(base, userId)); } catch (_) { /* Хранилище может быть отключено. */ }
}

function cacheUserForOffline(user) {
  if (!user) return;
  try { localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user)); } catch (_) { /* Кэш необязателен. */ }
}

function getCachedUser() {
  try { return JSON.parse(localStorage.getItem(CACHED_USER_KEY) || 'null'); }
  catch (_) { return null; }
}

function clearCachedUser() {
  try { localStorage.removeItem(CACHED_USER_KEY); } catch (_) { /* Кэш необязателен. */ }
}

// Строим список при вызове: часть ключей объявлена в соседних модулях.
function userScopedKeys() {
  return [
    CACHED_USER_KEY,
    SYNC_QUEUE_KEY,
    PAGE_BOOKMARKS_KEY,
    SRS_KEY,
    TOC_READ_KEY,
    FAV_CATS_KEY,
    READING_GOAL_KEY,
    BOOKS_GOAL_KEY,
    REVIEW_PROMPT_KEY,
    EPUB_CFI_KEY,
  ];
}

async function clearUserScopedData(userId = currentOfflineUserId() || getCachedUser()?.id) {
  for (const key of userScopedKeys()) {
    lsRemove(key, userId);
    try { localStorage.removeItem(key); } catch (_) { /* Продолжаем очистку остальных ключей. */ }
  }

  state.readingProgress = {};
  state.mylist = {};
  state.reviews = {};
  state.completedQuizzes = {};
  state.books = [];
  offlineBookIds.clear();

  if (userId) {
    try {
      await offlineStorage.clearUser(userId);
    } catch (error) {
      console.warn('Не удалось очистить офлайн-хранилище:', error);
    }
  }
}

async function loadBooksFromOffline() {
  const userId = currentOfflineUserId();
  if (!userId) return false;
  try {
    const saved = (await offlineStorage.listAll(userId)) || [];
    state.books = saved.map(metadata => adaptBookFromApi({
      id: metadata.id,
      title: metadata.title,
      author: metadata.author,
      file_format: metadata.file_format,
      has_file: true,
      has_cover: metadata.has_cover,
      total_pages: metadata.total_pages,
      icon: metadata.icon,
      rating: 0,
      categories: [],
    }));
    state.books.forEach(book => ensureProgress(book));
    return state.books.length > 0;
  } catch (error) {
    console.error('Не удалось собрать книги из оффлайн-хранилища:', error);
    if (!state.books) state.books = [];
    return false;
  }
}

async function loadOfflineBookIds() {
  if (state.currentUser) cacheUserForOffline(state.currentUser);
  const userId = currentOfflineUserId();
  offlineBookIds.clear();
  if (!userId) return;
  try {
    const ids = await offlineStorage.listIds(userId);
    ids.forEach(id => offlineBookIds.add(id));
  } catch (error) {
    console.error('Не удалось получить список оффлайн-книг:', error);
  }
}

async function saveBookOffline(bookId, silent) {
  const userId = currentOfflineUserId();
  if (!userId) { if (!silent) showToast('Войдите в аккаунт'); return; }
  const book = state.books.find(candidate => candidate.id === bookId);
  if (!book) { if (!silent) showToast('Книга не найдена'); return; }
  if (!book.has_file) { if (!silent) showToast('У книги нет файла для скачивания'); return; }
  if (!silent) showToast('Скачиваем книгу...');

  try {
    const fileType = book.file_format === 'epub' ? 'epub' : 'pdf';
    // Книгу уже открывали — файл лежит в кэше, второй раз не скачиваем.
    let fileBlob = await readBookFromCache(book, fileType);
    if (!fileBlob) {
      const fileResponse = await api.request('/books/' + bookId + '/' + fileType, { raw: true });
      fileBlob = await fileResponse.blob();
    }

    let coverBlob = null;
    if (book.has_cover) {
      try {
        const coverResponse = await api.request('/books/' + bookId + '/cover', { raw: true });
        coverBlob = await coverResponse.blob();
      } catch (error) {
        console.warn('Не удалось скачать обложку:', error);
      }
    }

    await offlineStorage.save(userId, book, fileBlob, fileType, coverBlob);
    offlineBookIds.add(bookId);
    // Сохранённая офлайн книга читается из своего хранилища, копия в кэше
    // только занимала бы место.
    if (typeof offlineStorage.cacheRemove === 'function') {
      offlineStorage.cacheRemove(userId, bookId).catch(() => { /* Не критично. */ });
    }
    // Счётчик «Сохранено офлайн» в админке. Сбой отметки не должен
    // выглядеть как сбой сохранения: книга уже на устройстве.
    Promise.resolve()
      .then(() => api.books.markSavedOffline(bookId))
      .catch(error => console.warn('Не удалось отметить сохранение офлайн:', error));
    const sizeMB = (fileBlob.size / 1024 / 1024).toFixed(1);
    if (!silent) showToast(`Сохранено оффлайн (${sizeMB} МБ)`);
    if (state.currentScreen === 'detail' && currentBookId === bookId) renderBookInfo();
    if (state.currentScreen === 'home') renderHome();
  } catch (error) {
    console.error('Ошибка сохранения оффлайн:', error);
    if (error instanceof api.ApiError) {
      showToast('Ошибка скачивания: ' + (error.detail || error.status));
    } else if (error.name === 'QuotaExceededError') {
      showToast('Не хватает места на устройстве');
    } else {
      showToast('Сервер недоступен');
    }
  }
}

async function removeBookOffline(bookId) {
  if (!confirm('Удалить книгу из офлайн-хранилища? Файл будет удалён с устройства.')) return;
  const userId = currentOfflineUserId();
  if (!userId) { showToast('Войдите в аккаунт'); return; }
  try {
    await offlineStorage.remove(userId, bookId);
    offlineBookIds.delete(bookId);
    showToast('Удалено из оффлайн');
    if (state.currentScreen === 'detail' && currentBookId === bookId) renderBookInfo();
    if (state.currentScreen === 'home') renderHome();
    if (state.currentScreen === 'profile') renderProfile();
  } catch (error) {
    console.error('Ошибка удаления оффлайн:', error);
    showToast('Не удалось удалить');
  }
}

// ========== Кэш открытых книг ==========
// Файл книги кладётся в IndexedDB при первом открытии. Повторное открытие
// читает его с устройства и не обращается к хранилищу. Запись привязана
// к file_version: если админ заменит файл, книга скачается заново.
const bookCacheInFlight = new Map();
// Больше этого PDF фоном целиком не докачиваем (см. loadPdf).
const BOOK_CACHE_BACKGROUND_MAX_BYTES = 40 * 1024 * 1024;

function bookCacheKey(bookId, fileType) {
  return bookId + ':' + fileType;
}

async function readBookFromCache(book, fileType) {
  const userId = currentOfflineUserId();
  if (!userId || !book || typeof offlineStorage === 'undefined' || !offlineStorage.cacheGet) return null;
  try {
    return await offlineStorage.cacheGet(userId, book.id, fileType, book.file_version || null);
  } catch (error) {
    console.warn('Не удалось прочитать книгу из кэша:', error);
    return null;
  }
}

async function writeBookToCache(book, fileType, data) {
  const userId = currentOfflineUserId();
  if (!userId || !book || !data || typeof offlineStorage === 'undefined' || !offlineStorage.cachePut) return false;
  if (offlineBookIds.has(book.id)) return false;
  try {
    const blob = data instanceof Blob
      ? data
      : new Blob([data], { type: fileType === 'epub' ? 'application/epub+zip' : 'application/pdf' });
    return await offlineStorage.cachePut(userId, book.id, fileType, blob, book.file_version || null);
  } catch (error) {
    // Нет места или IndexedDB недоступна — книга просто не закэшируется.
    console.warn('Не удалось положить книгу в кэш:', error);
    return false;
  }
}

function dropBookFromCache(book) {
  const userId = currentOfflineUserId();
  if (!userId || !book || typeof offlineStorage === 'undefined' || !offlineStorage.cacheRemove) return;
  offlineStorage.cacheRemove(userId, book.id)
    .catch(error => console.warn('Не удалось убрать книгу из кэша:', error));
}

// Скачать файл целиком в фоне и положить в кэш. Нужен для PDF: читалка
// грузит его кусками по Range, полного файла у неё нет. Одна загрузка на
// книгу за раз; на мобильной сети при «Только по Wi-Fi» не качаем.
function cacheBookInBackground(book, fileType) {
  if (!book || !book.has_file || offlineBookIds.has(book.id)) return null;
  if (!currentOfflineUserId()) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  // Включён режим экономии трафика — фоном ничего не качаем.
  const connection = typeof navigator !== 'undefined' && navigator.connection;
  if (connection && connection.saveData) return null;
  // Одна фоновая загрузка за раз: несколько параллельных забивают канал.
  if (bookCacheInFlight.size > 0 && !bookCacheInFlight.has(bookCacheKey(book.id, fileType))) return null;
  if (typeof isWifiOnlyEnabled === 'function' && isWifiOnlyEnabled()
      && typeof isOnWifi === 'function' && !isOnWifi()) return null;
  const key = bookCacheKey(book.id, fileType);
  if (bookCacheInFlight.has(key)) return bookCacheInFlight.get(key);

  const task = (async () => {
    if (await readBookFromCache(book, fileType)) return true;
    const response = await api.request('/books/' + book.id + '/' + fileType, { raw: true });
    const blob = await response.blob();
    return writeBookToCache(book, fileType, blob);
  })()
    .catch(error => {
      console.warn('Фоновое кэширование книги не удалось:', error);
      return false;
    })
    .finally(() => bookCacheInFlight.delete(key));
  bookCacheInFlight.set(key, task);
  return task;
}
