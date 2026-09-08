// Очередь и синхронизация прогресса чтения.
// ========== ОФФЛАЙН-ОЧЕРЕДЬ СИНХРОНИЗАЦИИ ==========
// Если сохранить прогресс на сервер не удалось (нет сети) — кладём в очередь
// и досылаем, когда сеть появится. Конфликт прогресса решается по max(page).
const SYNC_QUEUE_KEY = 'aegis_sync_queue';

function _loadSyncQueue() {
  try { return JSON.parse(lsGet(SYNC_QUEUE_KEY) || '{}'); }
  catch (_) { return {}; }
}
function _saveSyncQueue(q) {
  lsSet(SYNC_QUEUE_KEY, JSON.stringify(q));
}

// Поставить прогресс книги в очередь (перезаписывает прежний — нужен только последний)
function queueProgress(bookId, currentPage, totalPages) {
  const q = _loadSyncQueue();
  q['progress_' + bookId] = {
    type: 'progress', bookId, currentPage, totalPages, ts: Date.now(),
  };
  _saveSyncQueue(q);
}

// Досылка очереди на сервер
let _syncing = false;
async function flushSyncQueue() {
  if (_syncing || !navigator.onLine || !api.isAuthenticated()) return;
  const q = _loadSyncQueue();
  const keys = Object.keys(q);
  if (!keys.length) return;
  _syncing = true;
  let sentAny = false;
  for (const key of keys) {
    const item = q[key];
    try {
      if (item.type === 'progress') {
        await api.library.updateProgress(item.bookId, item.currentPage, item.totalPages);
      }
      delete q[key];
      sentAny = true;
    } catch (e) {
      const status = e && e.status;
      // 4xx (кроме 429) — сервер не примет эту запись никогда: книгу удалили,
      // данные не проходят валидацию. Без выброса такая запись оставалась в
      // очереди навсегда и долбила сервер при каждом опросе.
      if (status && status >= 400 && status < 500 && status !== 429) {
        console.warn('Отбрасываю невосстановимую запись очереди', key, status);
        delete q[key];
        continue;
      }
      // Сеть или сервер — оставляем в очереди и ждём следующего раза
      break;
    }
  }
  _saveSyncQueue(q);
  _syncing = false;
  if (sentAny && Object.keys(q).length === 0) {
    // всё досланоо — обновим прогресс с сервера (вдруг другое устройство тоже писало)
    await loadProgressFromApi(false);
  }
}

// При появлении сети — досылаем очередь
window.addEventListener('online', () => {
  showToast('Соединение восстановлено, синхронизируем…');
  flushSyncQueue();
});
window.addEventListener('offline', () => {
  showToast('Нет сети — изменения сохранятся локально');
});

// ========== ПЕРИОДИЧЕСКАЯ СИНХРОНИЗАЦИЯ (polling) ==========
// Раз в 30 сек, когда вкладка активна, подтягиваем свежий прогресс с сервера
// (на случай чтения с другого устройства) и досылаем очередь.
let _syncPollTimer = null;
const SYNC_POLL_MS = 30000;

function startSyncPolling() {
  if (_syncPollTimer) return;
  _syncPollTimer = setInterval(async () => {
    if (document.hidden || !api.isAuthenticated() || !navigator.onLine) return;
    // не мешаем активному чтению — синхронизируем прогресс в фоне
    await flushSyncQueue();
    try {
      await loadProgressFromApi();
      // обновим экран «Продолжить чтение», если пользователь на главной
      if (state.currentScreen === 'home' && typeof renderHome === 'function') renderHome();
    } catch (_) { /* Следующий polling повторит синхронизацию. */ }
  }, SYNC_POLL_MS);
}

function stopSyncPolling() {
  if (_syncPollTimer) { clearInterval(_syncPollTimer); _syncPollTimer = null; }
}

// При возврате на вкладку — сразу синхронизируем
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && api.isAuthenticated()) {
    flushSyncQueue();
  }
});

async function loadProgressFromApi(flushQueue = true) {
  try {
    const entries = await api.library.progress();
    const serverProgress = {};
    entries.forEach(p => {
      serverProgress[p.book_id] = {
        currentPage: p.current_page,
        totalPages: p.total_pages,
        started: p.started,
        lastReadAt: p.last_read_at || null,
      };
    });
    // Разрешение конфликта: если локально прочитано ДАЛЬШE, чем на сервере —
    // оставляем локальный прогресс и досылаем его на сервер (мы прочитали больше).
    const local = state.readingProgress || {};
    Object.keys(local).forEach(bid => {
      const lp = local[bid], sp = serverProgress[bid];
      if (lp && lp.started && (!sp || (lp.currentPage || 0) > (sp.currentPage || 0))) {
        serverProgress[bid] = lp;
        queueProgress(Number(bid), lp.currentPage, lp.totalPages);
      }
    });
    state.readingProgress = serverProgress;
    if (flushQueue) flushSyncQueue();
    startSyncPolling();
    return true;
  } catch (err) {
    console.error('Не удалось загрузить прогресс с API:', err);
    showToast('Не удалось загрузить прогресс чтения');
    return false;
  }
}

// ========== PROGRESS DEBOUNCE ==========
const PROGRESS_DEBOUNCE_MS = 2000;
let progressDebounceTimer = null;
let progressPendingBookId = null;

function scheduleProgressSave(bookId) {
  progressPendingBookId = bookId;
  if (progressDebounceTimer) clearTimeout(progressDebounceTimer);
  progressDebounceTimer = setTimeout(() => {
    flushPendingProgress();
  }, PROGRESS_DEBOUNCE_MS);
}

async function flushPendingProgress() {
  if (progressDebounceTimer) {
    clearTimeout(progressDebounceTimer);
    progressDebounceTimer = null;
  }
  const bookId = progressPendingBookId;
  progressPendingBookId = null;
  if (!bookId) return;

  const p = state.readingProgress[bookId];
  if (!p) return;

  try {
    await api.library.updateProgress(bookId, p.currentPage, p.totalPages);
  } catch (err) {
    console.error('Не удалось сохранить прогресс, ставим в очередь:', err);
    queueProgress(bookId, p.currentPage, p.totalPages);
  }
}

window.addEventListener('beforeunload', () => {
  if (!progressPendingBookId) return;
  const bookId = progressPendingBookId;
  const p = state.readingProgress[bookId];
  if (!p) return;

  // Сначала сохраняем локально: keepalive-запрос при закрытии вкладки остаётся
  // best effort и браузер не обязан дождаться ответа. Повторная отправка
  // безопасна — backend сохраняет максимальную подтверждённую страницу.
  queueProgress(bookId, p.currentPage, p.totalPages);

  const accessToken = api.tokens.access;
  if (!accessToken) return;
  try {
    fetch(api.baseUrl + '/books/' + bookId + '/progress', {
      method: 'PUT',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + accessToken,
      },
      body: JSON.stringify({ current_page: p.currentPage, total_pages: p.totalPages }),
    });
  } catch (e) { /* ignored */ }
});
