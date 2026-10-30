'use strict';

// Без сети обложка сохранённой книги берётся с устройства, а не пропадает.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8').replace(/^'use strict';/m, '');
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://aegis.test/', runScripts: 'outside-only' });
const { window } = dom;
window.URL.createObjectURL = () => 'blob:https://aegis.test/cover-5';
window.URL.revokeObjectURL = () => {};
window.eval(`var state = { currentUser: { id: 7 }, books: [] };`);
window.offlineStorage = {
  listIds: async () => [5],
  getCoverUrl: async (userId, bookId) => (bookId === 5 ? 'blob:https://aegis.test/cover-5' : null),
};
window.eval(read('offline-library.js'));

(async () => {
  await window.loadOfflineBookIds();
  let fallbackRan = false;
  // Общий обработчик ошибок картинок (ставит заглушку) — не должен успеть.
  window.document.addEventListener('error', () => { fallbackRan = true; }, true);

  const saved = window.document.createElement('img');
  saved.setAttribute('src', '/api/books/5/cover');
  window.document.body.appendChild(saved);
  saved.dispatchEvent(new window.Event('error'));
  assert.equal(saved.getAttribute('src'), 'blob:https://aegis.test/cover-5');
  assert.equal(fallbackRan, false);

  // Не сохранённая книга — обычная заглушка.
  const other = window.document.createElement('img');
  other.setAttribute('src', '/api/books/9/cover');
  window.document.body.appendChild(other);
  other.dispatchEvent(new window.Event('error'));
  assert.equal(other.getAttribute('src'), '/api/books/9/cover');
  assert.equal(fallbackRan, true);
  console.log('offline covers: ok');
})().catch(error => { console.error(error); process.exit(1); });
