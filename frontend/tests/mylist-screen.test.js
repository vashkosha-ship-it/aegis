'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'mylist-screen.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM(`
  <div id="avatarMylist"></div>
  <div id="mylistTabs">
    <button class="mylist-tab active" data-mylist="reading"><span class="count"></span></button>
    <button class="mylist-tab" data-mylist="planned"><span class="count"></span></button>
    <button class="mylist-tab" data-mylist="completed"><span class="count"></span></button>
  </div>
  <div id="mylistGrid"></div>
`);
const state = {
  mylistTab: 'reading',
  books: [
    { id: 1, title: 'Reading' },
    { id: 2, title: 'Planned' },
    { id: 3, title: 'Unknown' },
  ],
  mylist: { 1: 'reading', 2: 'planned', 3: 'invalid' },
};
const avatars = [];
let dragInitializations = 0;
const context = {
  replaceWithAppMarkup(target, markup) { target.innerHTML = markup; },
  document: dom.window.document,
  state,
  ICONS: { bookmark: '<svg></svg>' },
  updateAvatar: id => avatars.push(id),
  cardHTML: book => `<article data-book-id="${book.id}">${book.title}</article>`,
  initDragAndDrop: () => { dragInitializations += 1; },
};
vm.createContext(context);
vm.runInContext(source, context);

context.renderMyList();
assert.deepEqual(avatars, ['avatarMylist']);
assert.match(dom.window.document.getElementById('mylistGrid').innerHTML, /Reading/);
assert.doesNotMatch(dom.window.document.getElementById('mylistGrid').innerHTML, /Planned/);
assert.equal(dom.window.document.querySelector('[data-mylist="reading"] .count').textContent, '1');
assert.equal(dom.window.document.querySelector('[data-mylist="planned"] .count').textContent, '1');
assert.equal(dragInitializations, 1);

dom.window.document.querySelector('[data-mylist="planned"]').click();
assert.equal(state.mylistTab, 'planned');
assert.match(dom.window.document.getElementById('mylistGrid').innerHTML, /Planned/);
assert.ok(dom.window.document.querySelector('[data-mylist="planned"]').classList.contains('active'));
assert.equal(dragInitializations, 2);

state.mylistTab = 'completed';
context.renderMyList();
assert.match(dom.window.document.getElementById('mylistGrid').textContent, /Пусто/);
assert.doesNotMatch(appSource, /function renderMyList|document\.getElementById\('mylistTabs'\)\.addEventListener/);
assert.ok(indexSource.indexOf('mylist-drag-drop.js') < indexSource.indexOf('mylist-screen.js'));
assert.ok(indexSource.indexOf('mylist-screen.js') < indexSource.indexOf('app.js'));
assert.match(workerSource, /['"]\/mylist-screen\.js['"]/);
assert.match(workerSource, /aegis-cache-v[0-9]+/);
console.log('My List screen tests passed');
