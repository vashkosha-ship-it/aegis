'use strict';

// Уведомления о завершении долгих операций админки: индексация, ИИ-описания,
// «Названия и теги», обложки, подбор книг для схем, массовая загрузка.
//
// Серверные задачи идут в фоне, а сообщение о завершении раньше показывалось
// только при открытой вкладке «Книги» (или окне прогресса индексации).
// Теперь запущенная задача запоминается, и пока администратор в приложении —
// на любом экране — её статус проверяется раз в 20 секунд. Если сайт был
// закрыт, о завершении скажем при следующем открытии.
//
// Сообщение — всплывающее в приложении и, если браузер разрешил,
// системное уведомление (видно и при свёрнутой вкладке).

const ADMIN_WATCH_KEY = 'aegis_admin_task_watch';
const ADMIN_WATCH_INTERVAL_MS = 20000;

const ADMIN_TASKS = {
  reindex: {
    title: 'Индексация поиска',
    async check() {
      const s = await api.library.reindexStatus();
      if (!s || s.active > 0) return null;
      return `Готово: ${s.done} книг, ${s.indexed_pages} страниц` + (s.errors ? `, ошибок: ${s.errors}` : '');
    },
  },
  descriptions: {
    title: 'ИИ-описания',
    async check() {
      const job = await api.library.latestDescriptionGeneration();
      if (!job || ['queued', 'running'].includes(job.status)) return null;
      return `Создано описаний: ${job.succeeded_books}` + (job.failed_books ? ` · ошибок: ${job.failed_books}` : '');
    },
  },
  metadata: {
    title: 'Названия и теги',
    async check() {
      const job = await api.library.latestMetadataReview();
      if (!job || ['queued', 'running'].includes(job.status)) return null;
      return `Исправлено карточек: ${job.changed_books}`
        + (job.skipped_books ? ` · ждут индексации: ${job.skipped_books}` : '')
        + (job.failed_books ? ` · ошибок: ${job.failed_books}` : '');
    },
  },
};

function _readAdminWatch() {
  try { return JSON.parse(localStorage.getItem(ADMIN_WATCH_KEY) || '{}') || {}; } catch (_) { return {}; }
}

function _writeAdminWatch(watch) {
  try { localStorage.setItem(ADMIN_WATCH_KEY, JSON.stringify(watch)); } catch (_) { /* не критично */ }
}

// Попросить разрешение на системные уведомления — только в ответ на действие
// администратора (браузеры не показывают запрос без него).
function requestAdminNotifyPermission() {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  } catch (_) { /* не поддерживается */ }
}

async function _showSystemNotification(title, body) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const options = { body, icon: '/icons/icon-192.png', tag: 'aegis-admin-' + title };
    // В установленном приложении (Android) new Notification запрещён —
    // показываем через service worker.
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg && reg.showNotification) await reg.showNotification(title, options);
    else new Notification(title, options);
  } catch (_) { /* не критично: всплывающее сообщение уже показано */ }
}

// Операция завершилась: всплывающее сообщение и системное уведомление.
// Для серверных задач снимает наблюдение — повторно не сообщим.
function notifyAdminTaskDone(kind, title, message) {
  const watch = _readAdminWatch();
  if (kind && ADMIN_TASKS[kind]) {
    if (!watch[kind]) return; // уже сообщили
    delete watch[kind];
    _writeAdminWatch(watch);
  }
  if (typeof showToast === 'function') showToast(`${title}: ${message}`);
  _showSystemNotification(title + ' — завершено', message);
}

// Запущена серверная задача — следим за ней.
function watchAdminTask(kind) {
  if (!ADMIN_TASKS[kind]) return;
  const watch = _readAdminWatch();
  watch[kind] = Date.now();
  _writeAdminWatch(watch);
  requestAdminNotifyPermission();
  scheduleAdminTaskCheck(ADMIN_WATCH_INTERVAL_MS);
}

let _adminWatchTimer = null;

function scheduleAdminTaskCheck(delay) {
  clearTimeout(_adminWatchTimer);
  _adminWatchTimer = setTimeout(checkAdminTasks, delay);
}

async function checkAdminTasks() {
  _adminWatchTimer = null;
  const isAdmin = typeof state !== 'undefined' && state.currentUser && state.currentUser.role === 'admin';
  const watch = _readAdminWatch();
  const kinds = Object.keys(watch).filter(kind => ADMIN_TASKS[kind]);
  if (!isAdmin || !kinds.length) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    scheduleAdminTaskCheck(ADMIN_WATCH_INTERVAL_MS);
    return;
  }
  for (const kind of kinds) {
    try {
      const message = await ADMIN_TASKS[kind].check();
      if (message) notifyAdminTaskDone(kind, ADMIN_TASKS[kind].title, message);
    } catch (_) { /* проверим в следующий раз */ }
  }
  if (Object.keys(_readAdminWatch()).length) scheduleAdminTaskCheck(ADMIN_WATCH_INTERVAL_MS);
}

// После входа и при возвращении на вкладку — проверить сразу.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleAdminTaskCheck(500);
  });
}
