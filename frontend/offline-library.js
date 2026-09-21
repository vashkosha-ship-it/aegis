// Офлайн-сессия и скачанные книги.
const offlineBookIds = new Set();
const CACHED_USER_KEY = 'aegis_cached_user';

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
    const fileResponse = await api.request('/books/' + bookId + '/' + fileType, { raw: true });
    const fileBlob = await fileResponse.blob();

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
