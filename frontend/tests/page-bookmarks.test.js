'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'page-bookmarks.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM('<svg><path id="bookmarkIcon"></path></svg>');
const storage = new Map();
const toasts = [];
const pages = [];
const vibrations = [];
const context = {
  document: dom.window.document,
  navigator: { vibrate: ms => vibrations.push(ms) },
  currentBookId: 42,
  isEpubMode: false,
  epubCurrentPage: 1,
  pdfCurrentPage: 3,
  ICONS: { bookmark: 'BOOKMARK' },
  lsGet: key => storage.get(key) ?? null,
  lsSet: (key, value) => storage.set(key, value),
  showToast: message => toasts.push(message),
  goToPage: page => pages.push(page),
};
vm.createContext(context);
vm.runInContext(source, context);

context.togglePageBookmark();
assert.deepEqual(Array.from(context.getBookBookmarks(42)), [3]);
assert.equal(toasts.at(-1), 'Страница в закладках');
assert.deepEqual(vibrations, [12]);
assert.equal(dom.window.document.getElementById('bookmarkIcon').getAttribute('fill'), 'var(--accent)');

context.togglePageBookmark();
assert.deepEqual(Array.from(context.getBookBookmarks(42)), []);
assert.equal(toasts.at(-1), 'Закладка убрана');

storage.set('aegis_page_bookmarks', JSON.stringify({ 42: [5, 2, '1);alert(1)//', -4, 2.5] }));
assert.deepEqual(Array.from(context.getBookBookmarks(42)), [5, 2]);
context.openBookmarksList();
const modal = dom.window.document.getElementById('bookmarksListModal');
assert.equal(modal.querySelectorAll('#bookmarksListRows > button').length, 2);
assert.doesNotMatch(modal.innerHTML, /alert/);

context.jumpToBookmark(5);
assert.deepEqual(pages, [5]);
assert.equal(dom.window.document.getElementById('bookmarksListModal'), null);

context.removeBookmark(5);
assert.deepEqual(Array.from(context.getBookBookmarks(42)), [2]);
assert.ok(dom.window.document.getElementById('bookmarksListModal'));

assert.doesNotMatch(appSource, /function togglePageBookmark|function openBookmarksList/);
assert.ok(indexSource.indexOf('page-bookmarks.js') < indexSource.indexOf('app.js'));
assert.match(workerSource, /['"]\/page-bookmarks\.js['"]/);
console.log('Page bookmarks tests passed');
