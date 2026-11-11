'use strict';

// Уведомления о завершении долгих операций админки.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const store = new Map();
const toasts = [];
const system = [];
let reindex = { active: 3, done: 1, indexed_pages: 10, errors: 0 };
let descriptions = { status: 'running', succeeded_books: 0, failed_books: 0 };
const timers = [];

const sandbox = {
  console,
  localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
  showToast: m => toasts.push(m),
  setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  clearTimeout: () => {},
  navigator: { onLine: true, serviceWorker: { getRegistration: async () => ({ showNotification: async (t, o) => system.push(`${t} | ${o.body}`) }) } },
  Notification: Object.assign(function () {}, { permission: 'granted', requestPermission: async () => 'granted' }),
  state: { currentUser: { role: 'admin' } },
  api: { library: {
    reindexStatus: async () => reindex,
    latestDescriptionGeneration: async () => descriptions,
    latestMetadataReview: async () => null,
  } },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'admin-task-watch.js'), 'utf8'), sandbox);

(async () => {
  sandbox.watchAdminTask('reindex');
  sandbox.watchAdminTask('descriptions');
  assert.equal(timers.at(-1).ms, 20000);

  // Обе задачи идут — молчим, проверка повторится.
  await sandbox.checkAdminTasks();
  assert.equal(toasts.length, 0);

  // Индексация закончилась — одно сообщение и системное уведомление.
  reindex = { active: 0, done: 120, indexed_pages: 34000, errors: 2 };
  await sandbox.checkAdminTasks();
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /Индексация поиска: Готово: 120 книг, 34000 страниц, ошибок: 2/);
  await new Promise(r => setImmediate(r));
  assert.match(system[0], /Индексация поиска — завершено/);

  // Повторно о той же задаче не сообщаем; описания — когда закончатся.
  descriptions = { status: 'succeeded', succeeded_books: 15, failed_books: 0 };
  await sandbox.checkAdminTasks();
  assert.equal(toasts.length, 2);
  assert.match(toasts[1], /ИИ-описания: Создано описаний: 15/);
  await sandbox.checkAdminTasks();
  assert.equal(toasts.length, 2);
  assert.equal(store.get('aegis_admin_task_watch'), '{}');

  // Сообщение с экрана (например, окно прогресса) — тоже один раз.
  sandbox.watchAdminTask('reindex');
  sandbox.notifyAdminTaskDone('reindex', 'Индексация поиска', 'готово');
  sandbox.notifyAdminTaskDone('reindex', 'Индексация поиска', 'готово');
  assert.equal(toasts.length, 3);

  // Клиентские операции (обложки) — без наблюдения, сразу.
  sandbox.notifyAdminTaskDone(null, 'Обложки', 'создано: 5');
  assert.equal(toasts.at(-1), 'Обложки: создано: 5');

  // Не администратор — ничего не проверяем.
  sandbox.state.currentUser.role = 'reader';
  sandbox.watchAdminTask('descriptions');
  descriptions = { status: 'succeeded', succeeded_books: 1, failed_books: 0 };
  const before = toasts.length;
  await sandbox.checkAdminTasks();
  assert.equal(toasts.length, before);

  console.log('admin-task-watch: ok');
})().catch(e => { console.error(e); process.exit(1); });
