'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'reader-open.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM(`
  <button id="btnReaderSearch"></button><button id="btnPomodoro"></button>
  <button id="btnExportNotes"></button><button id="btnPdfHighlight"></button>
  <button id="btnPdfNote"></button><div id="readerBookName"></div>
  <div id="readerFormatBadge"></div>
`);
const calls = [];
const progressCalls = [];
const context = {
  document: dom.window.document,
  navigator: { onLine: true },
  state: {
    books: [
      { id: 1, title: 'PDF Book', file_format: 'pdf' },
      { id: 2, title: 'EPUB Book', file_format: 'epub' },
    ],
    readingProgress: {},
    mylist: {},
    currentBook: null,
    currentScreen: 'home',
  },
  currentBookId: null,
  ICONS: { search: 'SEARCH', timer: 'TIMER', export: 'EXPORT', marker: '<svg></svg>', note: '<svg></svg>' },
  unhideFromResume: id => calls.push(['unhide', id]),
  hideReaderEmptyStub: () => calls.push(['hide-empty']),
  saveState: () => calls.push(['save']),
  api: { library: { updateProgress: (...args) => { progressCalls.push(args); return Promise.resolve(); } } },
  refreshGamificationFromApi: () => calls.push(['gamification']),
  navigateTo: screen => calls.push(['navigate', screen]),
  applyReaderTheme: theme => calls.push(['theme', theme]),
  getReaderTheme: () => 'dark',
  initReaderGestures: () => calls.push(['gestures']),
  loadEpub: book => calls.push(['epub', book.id]),
  loadPdf: book => calls.push(['pdf', book.id]),
  setTimeout: fn => { fn(); return 1; },
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

context.openReader(999);
assert.equal(calls.length, 0);

context.openReader(1);
assert.equal(context.currentBookId, 1);
assert.equal(context.state.currentBook.id, 1);
assert.equal(context.state.readingProgress[1].currentPage, 1);
assert.equal(context.state.readingProgress[1].totalPages, 10);
assert.equal(context.state.readingProgress[1].started, true);
assert.equal(context.state.mylist[1], 'reading');
assert.deepEqual(progressCalls[0], [1, 1, 10]);
assert.equal(context.state._readerReturnTo, 'home');
assert.equal(dom.window.document.getElementById('readerBookName').textContent, 'PDF Book');
assert.equal(dom.window.document.getElementById('readerFormatBadge').textContent, 'PDF');
assert.deepEqual(calls.at(-1), ['pdf', 1]);

context.state.currentScreen = 'reader';
context.openReader(2);
assert.equal(context.state._readerReturnTo, 'home');
assert.deepEqual(calls.at(-1), ['epub', 2]);
assert.equal(dom.window.document.getElementById('readerFormatBadge').textContent, 'EPUB');
assert.equal(dom.window.document.getElementById('btnReaderTheme'), null);
assert.match(dom.window.document.getElementById('btnPdfHighlight').innerHTML, /Маркер/);

assert.doesNotMatch(appSource, /function openReader\s*\(/);
assert.ok(indexSource.indexOf('reader-theme.js') < indexSource.indexOf('reader-open.js'));
assert.ok(indexSource.indexOf('reader-open.js') < indexSource.indexOf('app.js'));
assert.match(workerSource, /['"]\/reader-open\.js['"]/);
console.log('Reader open tests passed');
