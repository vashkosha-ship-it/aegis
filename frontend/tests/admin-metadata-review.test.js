'use strict';

// «Названия и теги»: прерванная проверка (перезапуск сервера) не висит
// «в работе», а предлагает продолжить с места остановки.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<button id="adminMetadataBtn"></button><button id="adminMetadataChangesBtn" hidden></button>');
let latest = null;
const started = [];
const modals = [];
const toasts = [];
const context = {
  window: dom.window, document: dom.window.document, console, setTimeout, clearTimeout,
  state: { books: [] },
  api: { library: {
    latestMetadataReview: async () => latest,
    startMetadataReview: async () => { started.push(true); return { started: true, reason: 'resumed', job: { total_books: 1398 } }; },
  } },
  showConfirmModal: opts => modals.push(opts),
  showToast: text => toasts.push(text),
  watchAdminTask: () => {},
  notifyAdminTaskDone: () => {},
  loadBooksFromApi: async () => {},
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'admin-metadata-review.js'), 'utf8'), context);

(async () => {
  const interrupted = { status: 'failed', total_books: 3533, processed_books: 2151, changed_books: 40, failed_books: 0, skipped_books: 0 };
  assert.equal(context.metadataJobSummary(interrupted), 'Названия и теги · продолжить (2151/3533)');
  assert.equal(context.metadataJobSummary({ ...interrupted, status: 'completed', processed_books: 3533 }), 'Названия и теги');
  assert.equal(context.metadataJobSummary({ ...interrupted, status: 'running' }), 'Названия и теги · 2151/3533');

  latest = interrupted;
  await context.refreshMetadataReviewStatus();
  const button = dom.window.document.getElementById('adminMetadataBtn');
  assert.equal(button.disabled, false);
  assert.match(button.title, /прервалась на 2151 из 3533/);

  await context.startMetadataReviewUI();
  assert.equal(modals.at(-1).title, 'Продолжить проверку?');
  assert.match(modals.at(-1).message, /осталось около 1382/);
  latest = { ...interrupted, status: 'running', processed_books: 0, total_books: 1398 };
  await modals.at(-1).onConfirm();
  assert.equal(started.length, 1);
  assert.equal(toasts.at(-1), 'Проверка продолжена: осталось 1398 книг');
  // Проверка «идёт» — модуль опрашивает статус каждые 5 с; завершаем тест явно.
  console.log('Admin metadata review tests passed');
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
