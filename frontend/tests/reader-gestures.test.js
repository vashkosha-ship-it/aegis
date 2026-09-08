'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'reader-gestures.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM(`
  <div id="readerGestureZone"></div><button id="tapZoneLeft"></button>
  <button id="tapZoneRight"></button><button id="readerArrowLeft"></button>
  <button id="readerArrowRight"></button><div id="pageIndicatorOverlay" class="hidden-indicator"></div>
  <span id="pageIndicatorTop"></span><span id="pageCurrent"></span><span id="pageTotal"></span>
`);
const pages = [];
const timers = [];
let selectedText = '';
let bookmarkUpdates = 0;
let finishPrompts = 0;
const context = {
  document: dom.window.document,
  window: { getSelection: () => ({ toString: () => selectedText }) },
  isEpubMode: false,
  epubCurrentPage: 1,
  epubTotalPages: 1,
  pdfCurrentPage: 2,
  pdfTotalPages: 5,
  goToPage: page => pages.push(page),
  updateBookmarkIcon: () => { bookmarkUpdates += 1; },
  maybeShowFinishReviewPrompt: () => { finishPrompts += 1; },
  setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
  clearTimeout: () => {},
};
vm.createContext(context);
vm.runInContext(source, context);

context.initReaderGestures();
dom.window.document.getElementById('tapZoneRight').click();
dom.window.document.getElementById('readerArrowLeft').click();
assert.deepEqual(pages, [3, 1]);

pages.length = 0;
context.handleTouchStart({ changedTouches: [{ screenX: 200, screenY: 100 }] });
context.handleTouchMove({ changedTouches: [{ screenX: 100, screenY: 110 }] });
context.handleTouchEnd();
assert.deepEqual(pages, [3]);

selectedText = 'выделено';
context.handleTouchStart({ changedTouches: [{ screenX: 100, screenY: 100 }] });
context.handleTouchMove({ changedTouches: [{ screenX: 200, screenY: 100 }] });
context.handleTouchEnd();
assert.deepEqual(pages, [3]);

context.updatePageIndicator();
assert.equal(dom.window.document.getElementById('pageIndicatorTop').textContent, '2 / 5');
assert.equal(dom.window.document.getElementById('pageCurrent').textContent, '2');
assert.equal(bookmarkUpdates, 1);
assert.equal(finishPrompts, 1);
assert.ok(!dom.window.document.getElementById('pageIndicatorOverlay').classList.contains('hidden-indicator'));
assert.equal(timers.at(-1).delay, 2000);
timers.at(-1).fn();
assert.ok(dom.window.document.getElementById('pageIndicatorOverlay').classList.contains('hidden-indicator'));

context.pdfCurrentPage = 5;
pages.length = 0;
context.goToNextPage();
assert.deepEqual(pages, []);
context.pdfCurrentPage = 1;
context.goToPrevPage();
assert.deepEqual(pages, []);

assert.doesNotMatch(appSource, /function initReaderGestures|function handleTouchEnd|function updatePageIndicator/);
assert.ok(indexSource.indexOf('reader-gestures.js') < indexSource.indexOf('reader-open.js'));
assert.ok(indexSource.indexOf('reader-gestures.js') < indexSource.indexOf('app.js'));
assert.match(workerSource, /['"]\/reader-gestures\.js['"]/);
console.log('Reader gestures tests passed');
