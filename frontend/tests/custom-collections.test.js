'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'custom-collections.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM('<body></body>');
let collectionLoads = 0;
const calls = [];
const toasts = [];
let vibrations = 0;
let collections = [{ id: 4, name: '<Favorites>', icon: '<i>', book_ids: [7] }];
const api = {
  library: {
    collections: async () => { collectionLoads += 1; return collections; },
    removeFromCollection: async (...args) => calls.push(['remove', ...args]),
    addToCollection: async (...args) => calls.push(['add', ...args]),
    createCollection: async name => { calls.push(['create', name]); return { id: 9 }; },
  },
};
const context = {
  document: dom.window.document,
  api,
  navigator: { vibrate: value => { vibrations += value; } },
  eh: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  showToast: message => toasts.push(message),
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  const first = await context.getCollections(false);
  const second = await context.getCollections(false);
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(collectionLoads, 1);

  await context.openAddToCollection(7);
  const modal = dom.window.document.getElementById('addToColModal');
  assert.ok(modal);
  assert.match(modal.textContent, /<Favorites>/);
  assert.doesNotMatch(modal.innerHTML, /<Favorites>|<i>/);
  assert.match(modal.innerHTML, /toggleBookInCollection\(4,7,true\)/);

  await context.toggleBookInCollection(4, 7, true);
  await Promise.resolve();
  assert.deepEqual(calls[0], ['remove', 4, 7]);
  assert.equal(vibrations, 10);

  const input = dom.window.document.getElementById('newColName');
  input.value = '  ';
  await context.createCollectionFromModal(7);
  assert.equal(toasts.at(-1), 'Введите название');

  input.value = 'Работа';
  await context.createCollectionFromModal(7);
  assert.ok(calls.some(call => call[0] === 'create' && call[1] === 'Работа'));
  assert.ok(calls.some(call => call[0] === 'add' && call[1] === 9 && call[2] === 7));
  assert.ok(toasts.includes('Коллекция создана'));

  collections = [];
  await context.openAddToCollection(7);
  assert.match(dom.window.document.getElementById('addToColModal').textContent, /Пока нет коллекций/);

  assert.doesNotMatch(appSource, /let _collectionsCache|function getCollections|function openAddToCollection|function toggleBookInCollection|function createCollectionFromModal/);
  assert.ok(indexSource.indexOf('custom-collections.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /['"]\/custom-collections\.js['"]/);
  assert.match(workerSource, /aegis-cache-v\d+/);
  console.log('Custom collections tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
