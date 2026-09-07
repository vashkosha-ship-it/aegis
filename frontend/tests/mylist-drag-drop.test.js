'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'mylist-drag-drop.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM(`
  <div id="mylistGrid">
    <article class="book-card-compact" data-book-id="42"><span id="dragHandle">Книга</span></article>
  </div>
  <button class="mylist-tab" data-mylist="reading">Читаю</button>
`);

const values = new Map();
const dataTransfer = {
  effectAllowed: '',
  dropEffect: '',
  setData: (type, value) => values.set(type, value),
  getData: type => values.get(type) || '',
};
const updates = [];
let renders = 0;
const toasts = [];

const context = {
  document: dom.window.document,
  updateBookStatus: async (bookId, status) => updates.push([bookId, status]),
  renderMyList: () => { renders += 1; },
  showToast: message => toasts.push(message),
  Number,
  WeakSet,
};
vm.createContext(context);
vm.runInContext(source, context);

context.initDragAndDrop();
context.initDragAndDrop();

const handle = dom.window.document.getElementById('dragHandle');
const card = handle.closest('.book-card-compact');
const tab = dom.window.document.querySelector('.mylist-tab');

const dragStart = new dom.window.Event('dragstart', { bubbles: true });
Object.defineProperty(dragStart, 'dataTransfer', { value: dataTransfer });
handle.dispatchEvent(dragStart);
assert.equal(values.get('text/plain'), '42');
assert.equal(dataTransfer.effectAllowed, 'move');
assert.ok(card.classList.contains('dragging'));

const drop = new dom.window.Event('drop', { bubbles: true, cancelable: true });
Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer });
tab.dispatchEvent(drop);

setImmediate(() => {
  assert.deepEqual(updates, [[42, 'reading']], 'повторная инициализация не дублирует drop');
  assert.equal(renders, 1);
  assert.deepEqual(toasts, ['Статус обновлён']);

  const dragEnd = new dom.window.Event('dragend', { bubbles: true });
  handle.dispatchEvent(dragEnd);
  assert.ok(!card.classList.contains('dragging'));

  assert.doesNotMatch(appSource, /let draggedBookId|function initDragAndDrop/);
  assert.ok(indexSource.indexOf('mylist-drag-drop.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /const CACHE_NAME = 'aegis-cache-v214'/);
  assert.match(workerSource, /['"]\/mylist-drag-drop\.js['"]/);
  console.log('MyList drag-and-drop tests passed');
});
