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
const readerSource = fs.readFileSync(path.join(FRONTEND, 'reader-core.js'), 'utf8');

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
const fileBlob = new Blob([new Uint8Array(2 * 1024 * 1024)], { type: 'application/pdf' });
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
  cacheGet: async (...args) => {
    cacheReads.push(args);
    const entry = cacheEntries.get(args[1] + ':' + args[2]);
    if (!entry) return null;
    // Как в настоящем хранилище: устаревшая версия файла — промах кэша.
    if (args[3] && entry.version && entry.version !== args[3]) return null;
    return entry.blob;
  },
  cachePut: async (userId, bookId, type, blob, version) => {
    cacheWrites.push([userId, bookId, type, blob, version]);
    cacheEntries.set(bookId + ':' + type, { blob, version });
    return true;
  },
  cacheRemove: async (...args) => cacheRemoved.push(args),
};
const cacheEntries = new Map();
const cacheReads = [];
const cacheWrites = [];
const cacheRemoved = [];
const api = {
  request: async url => {
    requestedUrls.push(url);
    return { blob: async () => fileBlob };
  },
  ApiError: class ApiError extends Error {},
  books: { markSavedOffline: async bookId => markedOffline.push(bookId) },
};
const markedOffline = [];
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
  Blob,
  navigator: { onLine: true },
  isWifiOnlyEnabled: () => wifiOnly,
  isOnWifi: () => false,
  console,
};
let wifiOnly = false;
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
  await new Promise(resolve => setImmediate(resolve));
  // Сохранение офлайн отмечается на сервере для счётчика в админке.
  assert.deepEqual(markedOffline, [3, 4]);

  // Сохранённая офлайн книга убирается из кэша открытых книг.
  assert.deepEqual(cacheRemoved, [[17, 3], [17, 4]]);

  // ---- Кэш открытых книг ----
  const cachedBook = { id: 5, title: 'Cached', file_format: 'pdf', has_file: true, file_version: 'v1' };
  state.books.push(cachedBook);
  assert.equal(await context.readBookFromCache(cachedBook, 'pdf'), null);
  assert.deepEqual(cacheReads.at(-1), [17, 5, 'pdf', 'v1']);

  // Фоновая докачка: одна загрузка на книгу, файл с версией ложится в кэш.
  const first = context.cacheBookInBackground(cachedBook, 'pdf');
  const second = context.cacheBookInBackground(cachedBook, 'pdf');
  assert.equal(first, second);
  assert.equal(await first, true);
  assert.equal(requestedUrls.filter(url => url === '/books/5/pdf').length, 1);
  assert.equal(cacheWrites.at(-1)[1], 5);
  assert.equal(cacheWrites.at(-1)[4], 'v1');

  // Повторное открытие — файл с устройства, без запроса к серверу.
  const requestsBefore = requestedUrls.length;
  assert.equal(await context.readBookFromCache(cachedBook, 'pdf'), fileBlob);
  assert.equal(await context.cacheBookInBackground(cachedBook, 'pdf'), true);
  assert.equal(requestedUrls.length, requestsBefore);

  // Админ заменил файл — версия сменилась, кэш не используется.
  assert.equal(await context.readBookFromCache({ ...cachedBook, file_version: 'v2' }, 'pdf'), null);

  // Сохранение офлайн берёт файл из кэша, а не скачивает заново.
  await context.saveBookOffline(5, true);
  assert.equal(requestedUrls.length, requestsBefore);
  assert.equal(saved.at(-1)[2], fileBlob);

  // Офлайн-книги в кэш не дублируются.
  assert.equal(await context.writeBookToCache(cachedBook, 'pdf', fileBlob), false);

  // Одна фоновая загрузка за раз.
  const pending = context.cacheBookInBackground({ id: 21, has_file: true }, 'pdf');
  assert.ok(pending);
  assert.equal(context.cacheBookInBackground({ id: 22, has_file: true }, 'pdf'), null);
  await pending;

  // Режим экономии трафика — фоном не качаем.
  context.navigator.connection = { saveData: true };
  assert.equal(context.cacheBookInBackground({ id: 23, has_file: true }, 'pdf'), null);
  delete context.navigator.connection;

  // «Только по Wi-Fi» на мобильной сети — фоном не качаем.
  wifiOnly = true;
  assert.equal(context.cacheBookInBackground({ id: 6, has_file: true }, 'pdf'), null);
  wifiOnly = false;

  // Из EPUB-байтов кэш собирает Blob сам.
  const epubBook = { id: 7, has_file: true, file_version: 'e1' };
  assert.equal(await context.writeBookToCache(epubBook, 'epub', new ArrayBuffer(4)), true);
  assert.equal(cacheWrites.at(-1)[3].type, 'application/epub+zip');

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
  // Читалка сначала смотрит в кэш и только потом идёт в сеть.
  assert.match(readerSource, /readBookFromCache\(b, 'epub'\)/);
  assert.match(readerSource, /readBookFromCache\(b, 'pdf'\)/);
  assert.match(readerSource, /writeBookToCache\(b, 'epub'/);
  assert.match(readerSource, /cacheBookInBackground\(b, 'pdf'\)/);
  // Большие PDF фоном не качаются целиком — это забивало канал.
  assert.match(readerSource, /size <= BOOK_CACHE_BACKGROUND_MAX_BYTES\) cacheBookInBackground\(b, 'pdf'\)/);
  assert.equal(vm.runInContext('BOOK_CACHE_BACKGROUND_MAX_BYTES', context), 40 * 1024 * 1024);
  assert.ok(readerSource.indexOf("readBookFromCache(b, 'pdf')") < readerSource.indexOf('pdfStreamConfig'));
  console.log('Offline library tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
