// Обезличенная статистика использования интерфейса.
//
// Считаем, какие экраны открывают и какие кнопки нажимают, — только имена
// из кода (navigateTo('profile'), data-onclick="openTOC()"), без текста,
// который вводит человек. Счётчики копятся в памяти и раз в 30 секунд
// уходят на сервер одной пачкой; сервер хранит суммы за день без
// привязки к пользователю. Тема и цвет оформления отправляются отдельно —
// по ним в админке строится распределение.
//
// Если в браузере включено «Не отслеживать» (Do Not Track), ничего не
// отправляем.
(function () {
  // Статистика копится и уходит пачкой раз в 2 минуты (и при сворачивании).
  const FLUSH_INTERVAL_MS = 2 * 60 * 1000;
  const FLUSH_AT_EVENTS = 40;
  const MAX_COUNT_PER_EVENT = 100;
  const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_:.-]{0,63}$/;
  // navigateTo уже учитывается как открытие экрана.
  const IGNORED_ACTIONS = new Set(['navigateTo']);

  const queue = new Map();
  let queued = 0;
  let prefsDirty = true;
  let timer = null;

  function trackingAllowed() {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return false;
    return typeof state !== 'undefined' && Boolean(state.currentUser)
      && typeof api !== 'undefined' && Boolean(api.library && api.library.reportUsage);
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; flushUsage(false); }, FLUSH_INTERVAL_MS);
  }

  function trackUsage(kind, name) {
    if (kind !== 'screen' && kind !== 'action') return;
    if (!NAME_PATTERN.test(String(name || ''))) return;
    if (kind === 'action' && IGNORED_ACTIONS.has(name)) return;
    const key = kind + '\u0000' + name;
    queue.set(key, (queue.get(key) || 0) + 1);
    queued += 1;
    if (queued >= FLUSH_AT_EVENTS) flushUsage(false);
    else schedule();
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

  function flushUsage(keepalive) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!trackingAllowed()) {
      // До входа копить нечего: счётчики анонимного экрана входа не нужны.
      queue.clear();
      queued = 0;
      return Promise.resolve();
    }
    if (!queue.size && !prefsDirty) return Promise.resolve();

    const events = [];
    queue.forEach((count, key) => {
      const [kind, name] = key.split('\u0000');
      for (let left = count; left > 0; left -= MAX_COUNT_PER_EVENT) {
        events.push({ kind, name, count: Math.min(left, MAX_COUNT_PER_EVENT) });
      }
    });
    const payload = { events: events.slice(0, 100) };
    if (prefsDirty) payload.prefs = currentPrefs();
    queue.clear();
    queued = 0;
    prefsDirty = false;
    return api.library.reportUsage(payload, { keepalive: Boolean(keepalive) })
      .catch(() => { /* статистика необязательна — молча теряем пачку */ });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushUsage(true);
  });

  window.trackUsage = trackUsage;
  window.markUiPrefsChanged = markUiPrefsChanged;
  window.flushUsage = flushUsage;
})();
