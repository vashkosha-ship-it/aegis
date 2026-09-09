'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'reader-lifecycle.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM(`
  <div id="pdfViewport"></div>
  <div id="epubViewport"></div>
  <div id="tapZoneLeft"></div>
  <div id="readerGestureZone"></div>
  <div id="selectionToolbar"></div>
  <input id="readerSearchInput">
  <div class="note-tooltip"></div>
`);
const storage = new Map([['aegis_reader_brightness', '1']]);
const removedHighlights = [];
const navigation = [];
let flushes = 0;
let searchToggles = 0;
const state = {
  currentScreen: 'reader',
  currentBook: { id: 7 },
  readingProgress: { 7: { currentPage: 1 } },
  _readerReturnTo: 'detail',
};
dom.window._lastEpubSearchCfi = 'epubcfi(/6/2)';

const context = {
  window: dom.window,
  document: dom.window.document,
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  },
  state,
  isEpubMode: true,
  epubCurrentPage: 9,
  pdfCurrentPage: 3,
  currentBookId: 7,
  epubRendition: {
    annotations: { remove: (...args) => removedHighlights.push(args) },
  },
  epubBook: {},
  readerSearchActive: false,
  initPullToRefresh: () => {},
  toggleReaderSearch: () => { searchToggles += 1; },
  hideEpubSelectionPopup: () => {},
  closeReaderSearch: () => {},
  flushPendingProgress: () => { flushes += 1; },
  navigateTo: screen => navigation.push(screen),
  handleTouchStart: () => {},
  handleTouchEnd: () => {},
  handleTouchMove: () => {},
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

context.closeReader();
assert.equal(removedHighlights.length, 1, 'EPUB-подсветка должна сниматься до сброса rendition');
assert.equal(removedHighlights[0][0], 'epubcfi(/6/2)');
assert.equal(state.readingProgress[7].currentPage, 9);
assert.equal(flushes, 1);
assert.equal(navigation[0], 'detail');
assert.equal(context.isEpubMode, false);
assert.equal(context.epubRendition, null);
assert.equal(dom.window._lastEpubSearchCfi, null);
assert.equal(dom.window.document.querySelector('.note-tooltip'), null);

context.initReaderBrightnessGesture();
const zone = dom.window.document.getElementById('tapZoneLeft');
const start = new dom.window.Event('touchstart');
Object.defineProperty(start, 'touches', { value: [{ clientY: 300 }] });
zone.dispatchEvent(start);
const move = new dom.window.Event('touchmove');
Object.defineProperty(move, 'touches', { value: [{ clientY: 150 }] });
zone.dispatchEvent(move);
zone.dispatchEvent(new dom.window.Event('touchend'));
assert.equal(dom.window.document.getElementById('pdfViewport').style.filter, 'brightness(1.5)');
assert.equal(storage.get('aegis_reader_brightness'), '1.5');

const shortcut = new dom.window.KeyboardEvent('keydown', { key: 'f', ctrlKey: true, cancelable: true });
dom.window.document.dispatchEvent(shortcut);
assert.equal(searchToggles, 1);
assert.equal(shortcut.defaultPrevented, true);

assert.doesNotMatch(appSource, /function initReaderBrightnessGesture|function closeReader/);
assert.ok(indexSource.indexOf('reader-lifecycle.js') < indexSource.indexOf('app.js'));
assert.match(workerSource, /['"]\/reader-lifecycle\.js['"]/);
assert.match(workerSource, /aegis-cache-v250/);
console.log('Reader lifecycle tests passed');
