'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(frontend, 'admin-screens.js'), 'utf8');
const dom = new JSDOM(`
  <table><tbody id="books"></tbody></table><div id="reviews"></div>
  <button id="adminSaveFieldsBtn"></button><button id="adminUploadFileBtn"></button>
  <button id="adminDeleteFileBtn"></button><button id="adminUploadCoverBtn"></button>
  <button id="adminDeleteCoverBtn"></button><button id="adminDeleteBookBtn"></button>
  <button id="saveBookBtn"></button>
`);
const calls = [];
const context = {
  document: dom.window.document,
  console,
  ICONS: {
    star: '<svg data-icon="star"></svg>',
    settings: '<svg data-icon="settings"></svg>',
    trash: '<svg data-icon="trash"></svg>',
  },
  appendTrustedIcon: (container, markup) => {
    const parsed = new dom.window.DOMParser().parseFromString(markup, 'image/svg+xml');
    container.appendChild(dom.window.document.importNode(parsed.documentElement, true));
  },
  bookCategoriesText: book => book.categories,
  openBookAnalyticsModal: id => calls.push(['analytics', id]),
  openAdminBookModal: id => calls.push(['edit', id]),
  deleteBook: id => calls.push(['book-delete', id]),
  deleteReviewAndRefresh: (bookId, reviewId) => calls.push(['review-delete', bookId, reviewId]),
};
vm.createContext(context);
vm.runInContext(source, context);

const payload = '<img src=x onerror=alert(1)>';
const tbody = dom.window.document.getElementById('books');
context.renderAdminBookRows(tbody, [{
  id: payload,
  title: payload,
  author: '<script>alert(1)</script>',
  categories: '<svg onload=alert(1)>',
  file_format: 'epub',
  rating: payload,
}]);
assert.equal(tbody.querySelectorAll('tr').length, 1);
assert.match(tbody.textContent, /<img src=x/);
assert.equal(tbody.querySelector('img, script'), null);
assert.equal(tbody.querySelectorAll('button').length, 3);
tbody.querySelectorAll('button')[2].click();
assert.deepEqual(calls.pop(), ['book-delete', payload]);

const reviews = dom.window.document.getElementById('reviews');
context.renderAdminReviewsTable(reviews, [{
  id: payload,
  bookId: payload,
  bookTitle: payload,
  user: '<script>alert(1)</script>',
  rating: 7,
  text: '<svg onload=alert(1)>' + 'x'.repeat(60),
}]);
assert.equal(reviews.querySelectorAll('tbody tr').length, 1);
assert.equal(reviews.querySelectorAll('[data-icon="star"]').length, 5);
assert.equal(reviews.querySelector('img, script'), null);
assert.match(reviews.textContent, /<svg onload=alert\(1\)>/);
reviews.querySelector('button').click();
assert.deepEqual(calls.pop(), ['review-delete', payload, payload]);

assert.doesNotMatch(source, /state\.books\.map\(b => `/);
assert.doesNotMatch(source, /allReviews\.map\(r => `/);
console.log('admin list DOM tests passed');
