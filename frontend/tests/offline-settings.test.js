'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontendDir = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(frontendDir, 'offline-settings.js'), 'utf8');
const appSource = fs.readFileSync(path.join(frontendDir, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');
const swSource = fs.readFileSync(path.join(frontendDir, 'sw.js'), 'utf8');

const stored = new Map([['aegis_auto_preload', '1']]);
const savedBooks = [];
const deletedCaches = [];
const responses = new Map([
  ['one', { clone: () => ({ blob: async () => ({ size: 12 }) }) }],
  ['two', { clone: () => ({ blob: async () => ({ size: 8 }) }) }],
]);
const cache = {
  async keys() { return ['one', 'two']; },
  async match(request) { return responses.get(request); },
};
const caches = {
  async keys() { return ['books']; },
  async open() { return cache; },
  async delete(name) { deletedCaches.push(name); return true; },
};

const context = vm.createContext({
  window: { caches },
  caches,
  navigator: {
    connection: { type: 'wifi' },
    storage: { estimate: async () => ({ usage: 100, quota: 1000 }) },
  },
  localStorage: {
    getItem(key) { return stored.get(key) ?? null; },
    setItem(key, value) { stored.set(key, value); },
  },
  state: {
    books: [1, 2, 3, 4].map((id) => ({ id, has_file: true })),
    readingProgress: { 1: { started: true }, 2: { started: true }, 3: { started: true }, 4: { started: true } },
  },
  offlineBookIds: new Set(),
  async saveBookOffline(id, quiet) { savedBooks.push([id, quiet]); },
});

vm.runInContext(source, context);

(async () => {
  await vm.runInContext('maybeAutoPreload()', context);
  assert.deepEqual(savedBooks, [[1, true], [2, true], [3, true]], 'Автопредзагрузка ограничена тремя книгами');

  context.navigator.connection.type = 'cellular';
  await vm.runInContext('maybeAutoPreload()', context);
  assert.equal(savedBooks.length, 3, 'По мобильной сети автопредзагрузка не запускается');

  const stats = await vm.runInContext('getStorageStats()', context);
  assert.deepEqual(
    JSON.parse(JSON.stringify(stats)),
    { used: 100, quota: 1000, cacheSize: 20, cacheCount: 2 },
  );

  await vm.runInContext('clearAllAppCache()', context);
  assert.deepEqual(deletedCaches, ['books']);

  assert.doesNotMatch(appSource, /const WIFI_ONLY_KEY|function maybeAutoPreload|function getStorageStats/);
  assert.ok(
    indexSource.indexOf('src="offline-settings.js"') < indexSource.indexOf('src="app.js"'),
    'offline-settings.js должен подключаться раньше app.js',
  );
  assert.match(swSource, /const CACHE_NAME = 'aegis-cache-v205'/);
  assert.match(swSource, /'\/offline-settings\.js'/);

  console.log('Offline settings tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
