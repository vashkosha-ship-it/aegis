// Статистика использования интерфейса и журнал действий пользователя.
//
// Записываем, какие экраны открывают и какие кнопки нажимают, — только имена
// из кода (navigateTo('profile'), data-onclick="openTOC()"), без текста,
// который вводит человек (поиск, заметки, сообщения, пароли).
//
// Уходит на сервер двумя частями одной пачкой раз в 2 минуты (и при
// сворачивании приложения):
// - счётчики — суммы за день без пользователя (админка → «Использование»);
// - журнал — что и когда делал этот пользователь в этом сеансе: начало
//   сеанса, экраны, нажатия, открытые книги (админка → «Активность»).
// Сеанс — одно открытие приложения; после 30 минут в фоне начинается новый.
//
// Если в браузере включено «Не отслеживать» (Do Not Track), ничего не
// отправляем.
(function () {
  const FLUSH_INTERVAL_MS = 2 * 60 * 1000;
  const FLUSH_AT_EVENTS = 40;
  const MAX_COUNT_PER_EVENT = 100;
  const MAX_ACTIVITY_PER_BATCH = 300;
  const MAX_ACTIVITY_QUEUE = 1000;
  const NEW_SESSION_AFTER_MS = 30 * 60 * 1000;
  const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_:.-]{0,63}$/;
  // navigateTo уже учитывается как открытие экрана.
  const IGNORED_ACTIONS = new Set(['navigateTo']);
  // В журнале книгу записывают openBookDetail/openReader сами — с её id.
  const ACTIONS_LOGGED_AS_BOOK = new Set(['openBookDetail', 'openReader']);

  const queue = new Map();
  let queued = 0;
  let prefsDirty = true;
  let timer = null;
  let activity = [];
  let sessionId = newSessionId();
  let sessionUserId = null;
  let sessionStarted = false;
  let hiddenAt = null;

  function newSessionId() {
    const bytes = new Uint8Array(12);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  function startNewSession() {
    sessionId = newSessionId();
    sessionStarted = false;
  }

  function trackingAllowed() {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return false;
    return typeof state !== 'undefined' && Boolean(state.currentUser)
      && typeof api !== 'undefined' && Boolean(api.library && api.library.reportUsage);
  }

  // Установленное приложение (APK, ярлык на главном экране) или сайт.
  function displayMode() {
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return 'app';
    } catch (_) { /* старый браузер */ }
    if (navigator.standalone === true) return 'app';
    if (typeof document.referrer === 'string' && document.referrer.startsWith('android-app://')) return 'app';
    return 'browser';
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; flushUsage(false); }, FLUSH_INTERVAL_MS);
  }

  function pushActivity(kind, name, bookId) {
    if (!NAME_PATTERN.test(String(name || ''))) return;
    const event = { kind, name, at: Date.now() };
    if (Number.isInteger(bookId) && bookId > 0) event.book_id = bookId;
    activity.push(event);
    if (activity.length > MAX_ACTIVITY_QUEUE) activity = activity.slice(-MAX_ACTIVITY_QUEUE);
  }

  function trackUsage(kind, name) {
    if (kind !== 'screen' && kind !== 'action') return;
    if (!NAME_PATTERN.test(String(name || ''))) return;
    if (kind === 'action' && IGNORED_ACTIONS.has(name)) return;
    const key = kind + '\u0000' + name;
    queue.set(key, (queue.get(key) || 0) + 1);
    queued += 1;
    if (!(kind === 'action' && ACTIONS_LOGGED_AS_BOOK.has(name))) pushActivity(kind, name);
    if (queued >= FLUSH_AT_EVENTS) flushUsage(false);
    else schedule();
  }

  // Открыта карточка книги (detail) или книга в читалке (read).
  function trackBook(name, bookId) {
    if (name !== 'detail' && name !== 'read') return;
    pushActivity('book', name, Number(bookId));
    schedule();
  }

  function markUiPrefsChanged() {
    prefsDirty = true;
    schedule();
  }

  function currentPrefs() {
    const prefs = {};
    if (typeof getAppTheme === 'function') prefs.theme = getAppTheme();
    if (typeof getAppAccent === 'function') prefs.accent = getAppAccent();
    return prefs;
  }

  function takeActivity() {
    const userId = state.currentUser.id;
    if (sessionUserId !== null && sessionUserId !== userId) startNewSession();
    sessionUserId = userId;
    if (!sessionStarted) {
      sessionStarted = true;
      const firstAt = activity.length ? activity[0].at : Date.now();
      activity.unshift({ kind: 'session', name: 'start', at: firstAt });
    }
    const batch = activity.slice(0, MAX_ACTIVITY_PER_BATCH);
    activity = activity.slice(MAX_ACTIVITY_PER_BATCH);
    return batch;
  }

  function flushUsage(keepalive) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!trackingAllowed()) {
      // До входа копить нечего: экран входа не учитываем.
      queue.clear();
      queued = 0;
      activity = [];
      return Promise.resolve();
    }
    if (!queue.size && !prefsDirty && !activity.length && sessionStarted) return Promise.resolve();

    const events = [];
    queue.forEach((count, key) => {
      const [kind, name] = key.split('\u0000');
      for (let left = count; left > 0; left -= MAX_COUNT_PER_EVENT) {
        events.push({ kind, name, count: Math.min(left, MAX_COUNT_PER_EVENT) });
      }
    });
    const payload = { events: events.slice(0, 100) };
    if (prefsDirty) payload.prefs = currentPrefs();
    payload.session_id = sessionId;
    payload.display = displayMode();
    payload.activity = takeActivity();
    queue.clear();
    queued = 0;
    prefsDirty = false;
    if (activity.length) schedule();
    return api.library.reportUsage(payload, { keepalive: Boolean(keepalive) })
      .catch(() => { /* статистика необязательна — молча теряем пачку */ });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      flushUsage(true);
      return;
    }
    // Вернулись в приложение после долгого перерыва — это новый заход.
    if (hiddenAt && Date.now() - hiddenAt > NEW_SESSION_AFTER_MS) {
      startNewSession();
      schedule();
    }
    hiddenAt = null;
  });

  window.trackUsage = trackUsage;
  window.trackBook = trackBook;
  window.markUiPrefsChanged = markUiPrefsChanged;
  window.flushUsage = flushUsage;
})();
