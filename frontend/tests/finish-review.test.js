'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'finish-review.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM('<body></body>');
const storage = new Map();
const timers = [];
const reviews = [];
const toasts = [];
const context = {
  document: dom.window.document,
  state: {
    currentUser: { name: 'alice' },
    books: [{ id: 42, title: '<img src=x onerror=alert(1)>' }],
  },
  currentBookId: 42,
  isEpubMode: false,
  epubTotalPages: 0,
  epubCurrentPage: 0,
  pdfTotalPages: 5,
  pdfCurrentPage: 5,
  reviewsCache: {},
  ICONS: { check: 'OK' },
  lsGet: key => storage.get(key) ?? null,
  lsSet: (key, value) => storage.set(key, value),
  setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
  renderStarSVG: filled => filled ? 'FILLED' : 'EMPTY',
  addReview: (...args) => reviews.push(args),
  showToast: message => toasts.push(message),
  eh: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;'),
};
vm.createContext(context);
vm.runInContext(source, context);

context.maybeShowFinishReviewPrompt();
assert.equal(timers.length, 1);
assert.equal(timers[0].delay, 600);
assert.equal(JSON.parse(storage.get('aegis_review_prompted'))['42'], 1);
timers[0].fn();

const modal = dom.window.document.getElementById('finishReviewModal');
assert.ok(modal);
assert.equal(modal.querySelectorAll('.star').length, 5);
assert.equal(modal.querySelector('img'), null);
assert.match(modal.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);

context.setFinishReviewStar(4);
assert.equal(modal.querySelectorAll('.star.filled').length, 4);
modal.querySelector('#finishReviewText').value = ' Отличная книга ';
context.submitFinishReview(42);
assert.deepEqual(reviews, [[42, 4, 'Отличная книга']]);
assert.equal(dom.window.document.getElementById('finishReviewModal'), null);

context.currentBookId = 77;
context.reviewsCache[77] = [{ is_mine: true }];
context.maybeShowFinishReviewPrompt();
assert.equal(timers.length, 1);
assert.equal(JSON.parse(storage.get('aegis_review_prompted'))['77'], 1);

context.currentBookId = 88;
context.pdfCurrentPage = 4;
context.maybeShowFinishReviewPrompt();
assert.equal(timers.length, 1);

context.showFinishReviewModal(42);
context.submitFinishReview(42);
assert.equal(toasts.at(-1), 'Поставьте оценку от 1 до 5 звёзд');

assert.doesNotMatch(appSource, /function maybeShowFinishReviewPrompt|function showFinishReviewModal/);
assert.ok(indexSource.indexOf('reviews-core.js') < indexSource.indexOf('finish-review.js'));
assert.ok(indexSource.indexOf('finish-review.js') < indexSource.indexOf('app.js'));
assert.match(workerSource, /['"]\/finish-review\.js['"]/);
console.log('Finish review tests passed');
