'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'offline-library.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const storage = new Map([['legacy', 'old-value']]);
const removed = [];
const cleared = [];
const saved = [];
const listedFor = [];
const requestedUrls = [];
const toasts = [];
const state = {
  currentUser: { id: 17, name: 'reader' },
  currentScreen: 'home',
  books: [
    { id: 3, title: 'Book', file_format: 'pdf', has_file: true, has_cover: false },
    { id: 4, title: 'EPUB Book', file_format: 'epub', has_file: true, has_cover: false },
  ],
  readingProgress: {},
  mylist: {},
  reviews: {},
  completedQuizzes: {},
};
const fileBlob = { size: 2 * 1024 * 1024 };
const offlineStorage = {
  listAll: async userId => {
    listedFor.push(['all', userId]);
    return [{ id: 3, title: 'Saved', author: 'A', file_format: 'pdf' }];
  },
  listIds: async userId => {
    listedFor.push(['ids', userId]);
    return [3];
  },
  save: async (...args) => saved.push(args),
  remove: async (...args) => removed.push(args),
  clearUser: async userId => cleared.push(userId),
};
const api = {
  request: async url => {
    requestedUrls.push(url);
    return { blob: async () => fileBlob };
  },
  ApiError: class ApiError extends Error {},
};
const context = {
  state,
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  },
  offlineStorage,
  api,
  adaptBookFromApi: book => book,
  ensureProgress: () => {},
  showToast: message => toasts.push(message),
  renderHome: () => {},
  renderBookInfo: () => {},
  renderProfile: () => {},
  confirm: () => true,
  currentBookId: 3,
  SYNC_QUEUE_KEY: 'sync',
  PAGE_BOOKMARKS_KEY: 'bookmarks',
  SRS_KEY: 'srs',
  TOC_READ_KEY: 'toc',
  FAV_CATS_KEY: 'favorites',
  READING_GOAL_KEY: 'reading-goal',
  BOOKS_GOAL_KEY: 'books-goal',
  REVIEW_PROMPT_KEY: 'review-prompt',
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  assert.equal(context.uk('setting'), 'setting:17');
  assert.equal(context.lsGet('legacy'), 'old-value');
  assert.equal(storage.get('legacy:17'), 'old-value');
  assert.equal(storage.has('legacy'), false);

  context.cacheUserForOffline(state.currentUser);
  assert.equal(context.getCachedUser().id, 17);
  context.clearCachedUser();
  assert.equal(context.getCachedUser(), null);

  await context.loadOfflineBookIds();
  assert.equal(vm.runInContext('offlineBookIds.has(3)', context), true);
  assert.deepEqual(listedFor[0], ['ids', 17]);

  await context.saveBookOffline(3, false);
  assert.equal(saved.length, 1);
  assert.equal(saved[0][0], 17);
  assert.equal(saved[0][3], 'pdf');
  assert.equal(requestedUrls[0], '/books/3/pdf');
  assert.ok(toasts.includes('Сохранено оффлайн (2.0 МБ)'));

  await context.saveBookOffline(4, false);
  assert.equal(saved.length, 2);
  assert.equal(saved[1][0], 17);
  assert.equal(saved[1][3], 'epub');
  assert.equal(requestedUrls[1], '/books/4/epub');

  await context.removeBookOffline(3);
  assert.deepEqual(removed, [[17, 3]]);
  assert.equal(vm.runInContext('offlineBookIds.has(3)', context), false);

  await context.clearUserScopedData(17);
  assert.deepEqual(cleared, [17]);
  assert.equal(vm.runInContext('offlineBookIds.size', context), 0);

  assert.doesNotMatch(appSource, /const offlineBookIds|function loadBooksFromOffline|function saveBookOffline/);
  assert.ok(indexSource.indexOf('offline-library.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /['"]\/offline-library\.js['"]/);
  assert.match(workerSource, /aegis-cache-v[0-9]+/);
  assert.match(source, /offlineStorage\.listAll\(userId\)/);
  assert.match(source, /offlineStorage\.clearUser\(userId\)/);
  console.log('Offline library tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
