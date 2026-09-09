'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'offline-profile.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM('<div id="offlineBooksSection"></div>');
const state = { currentUser: { id: 7 } };
let books = [{
  id: 3,
  title: '<Security>',
  author: '<Author>',
  file_format: 'epub',
  savedAt: '2026-01-02T00:00:00Z',
}];
let quota = { usage: 9 * 1024, quota: 10 * 1024 };
let storageError = false;
const offlineStorage = {
  listAll: async () => {
    if (storageError) throw new Error('IndexedDB unavailable');
    return books;
  },
  getQuotaEstimate: async () => quota,
};
const context = {
  document: dom.window.document,
  dynamicStyleToken: () => 'test-style',
  state,
  offlineStorage,
  ICONS: { cloudDownload: 'cloud', eye: 'eye', trash: 'trash' },
  eh: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  console: { error: () => {} },
  Date,
  Math,
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  assert.equal(context.formatBytes(0), '0 Б');
  assert.equal(context.formatBytes(1536), '1.5 КБ');
  assert.equal(context.formatBytes(2 * 1024 * 1024), '2.0 МБ');

  await context.renderOfflineBooks();
  const container = dom.window.document.getElementById('offlineBooksSection');
  assert.match(container.textContent, /Хранилище почти заполнено/);
  assert.match(container.textContent, /SECURITY/i);
  assert.match(container.textContent, /EPUB/);
  assert.doesNotMatch(container.innerHTML, /<Security>|<Author>/);
  assert.match(container.innerHTML, /openBookDetail\(3\)/);
  assert.match(container.innerHTML, /removeBookOffline\(3\)/);

  books = [];
  quota = null;
  await context.renderOfflineBooks();
  assert.match(container.textContent, /Нет скачанных книг/);

  state.currentUser = null;
  container.innerHTML = 'old';
  await context.renderOfflineBooks();
  assert.equal(container.innerHTML, '');

  state.currentUser = { id: 7 };
  storageError = true;
  await context.renderOfflineBooks();
  assert.match(container.textContent, /Не удалось прочитать/);

  assert.doesNotMatch(appSource, /function formatBytes|function renderOfflineBooks/);
  assert.ok(indexSource.indexOf('offline-library.js') < indexSource.indexOf('offline-profile.js'));
  assert.ok(indexSource.indexOf('offline-profile.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /['"]\/offline-profile\.js['"]/);
  assert.match(workerSource, /aegis-cache-v[0-9]+/);
  console.log('Offline profile tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
