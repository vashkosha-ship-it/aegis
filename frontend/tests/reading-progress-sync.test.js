'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'reading-progress-sync.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM('');
const storage = new Map();
const updates = [];
const queuedTimers = [];
const fetches = [];
let updateFails = false;
let serverProgress = [];
const state = {
  currentScreen: 'reader',
  readingProgress: { 7: { currentPage: 8, totalPages: 100, started: true } },
};
const api = {
  baseUrl: 'https://api.example.test',
  tokens: { access: 'token' },
  isAuthenticated: () => true,
  library: {
    updateProgress: async (...args) => {
      updates.push(args);
      if (updateFails) throw new Error('offline');
    },
    progress: async () => serverProgress,
  },
};
const context = {
  window: dom.window,
  document: dom.window.document,
  navigator: { onLine: true },
  state,
  api,
  lsGet: key => storage.get(key) ?? null,
  lsSet: (key, value) => storage.set(key, value),
  showToast: () => {},
  renderHome: () => {},
  fetch: async (...args) => { fetches.push(args); return {}; },
  setTimeout: (fn, delay) => { queuedTimers.push({ fn, delay }); return queuedTimers.length; },
  clearTimeout: () => {},
  setInterval: () => 1,
  clearInterval: () => {},
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  context.queueProgress(7, 3, 100);
  let queue = JSON.parse(storage.get('aegis_sync_queue'));
  assert.equal(queue.progress_7.currentPage, 3);
  context.queueProgress(7, 4, 100);
  queue = JSON.parse(storage.get('aegis_sync_queue'));
  assert.equal(queue.progress_7.currentPage, 4);

  storage.set('aegis_sync_queue', '{}');
  context.scheduleProgressSave(7);
  assert.equal(queuedTimers.at(-1).delay, 2000);
  await context.flushPendingProgress();
  assert.deepEqual(updates.at(-1), [7, 8, 100]);

  updateFails = true;
  context.scheduleProgressSave(7);
  await context.flushPendingProgress();
  queue = JSON.parse(storage.get('aegis_sync_queue'));
  assert.equal(queue.progress_7.currentPage, 8);

  context.scheduleProgressSave(7);
  dom.window.dispatchEvent(new dom.window.Event('beforeunload'));
  assert.equal(fetches.length, 1);
  assert.equal(fetches[0][1].keepalive, true);
  assert.match(fetches[0][1].headers.Authorization, /token/);

  updateFails = false;
  storage.set('aegis_sync_queue', '{}');
  serverProgress = [{ book_id: 7, current_page: 2, total_pages: 100, started: true }];
  assert.equal(await context.loadProgressFromApi(), true);
  assert.equal(state.readingProgress[7].currentPage, 8);
  await Promise.resolve();
  assert.ok(updates.some(args => args[0] === 7 && args[1] === 8));

  assert.doesNotMatch(appSource, /const SYNC_QUEUE_KEY|function queueProgress|function loadProgressFromApi|function scheduleProgressSave/);
  assert.ok(indexSource.indexOf('reading-progress-sync.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /['"]\/reading-progress-sync\.js['"]/);
  assert.match(workerSource, /aegis-cache-v239/);
  console.log('Reading progress sync tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
