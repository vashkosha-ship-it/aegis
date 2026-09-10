'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(frontend, 'library-home.js'), 'utf8');
const dom = new JSDOM(`
  <div id="detailTabs"></div>
  <div id="detailTabInfo"></div>
  <div id="badgeHome"></div>
  <div id="btnAdminGo"></div>
  <input id="searchInput" value="&lt;img src=x onerror=alert(1)&gt;">
  <div id="sectionResume"></div><div id="sectionContinue"></div>
  <div id="sectionFavCategories"></div><div id="sectionRecommendations"></div>
  <div id="sectionBooksGoal"></div><div id="sectionBooks"><div class="books-tabs"></div></div>
  <div id="scrollPopular"></div><div id="scrollAll"></div><div id="booksPager"></div>
`);
const icon = '<svg viewBox="0 0 10 10"></svg>';
const book = {
  id: 7,
  title: '<img src=x onerror=alert(1)>',
  author: '<script>alert(1)</script>',
  desc: '<svg onload=alert(1)>',
  categories: ['<b>security</b>'],
  rating: 4.8,
  views: 12,
  downloads: 3,
  file_format: 'pdf',
  has_cover: true,
  has_file: true,
};
const context = {
  document: dom.window.document,
  navigator: { onLine: true },
  state: { currentUser: { role: 'admin' }, books: [book], mylist: { 7: 'reading' } },
  currentBookId: 7,
  reviewRating: 0,
  offlineBookIds: new Set(),
  api: { books: { coverUrl: id => '/cover/' + id } },
  ICONS: {
    star: icon, eye: icon, download: icon, fileText: icon, book: icon,
    bookCover: icon, cloudCheck: icon, cloudDownload: icon, target: icon,
    settings: icon, bookmark: icon,
  },
  appendTrustedIcon: container => container.appendChild(dom.window.document.createElement('svg')),
  bookCategoriesText: item => item.categories.join(', '),
  findKillChainStageForBook: () => ({ id: 2, nameRu: '<img onerror=alert(1)>' }),
  loadAlsoRead: () => {},
  updateAvatar: () => {},
  updateFabVisibility: () => {},
  getFilteredBooks: () => [],
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

context.renderBookInfo();
const detail = dom.window.document.getElementById('detailTabInfo');
assert.equal(detail.querySelector('.detail-title').textContent, book.title);
assert.equal(detail.querySelector('.detail-author').textContent, book.author);
assert.equal(detail.querySelector('.detail-desc').textContent, book.desc);
assert.equal(detail.querySelector('.mylist-status-select').value, 'reading');
assert.equal(detail.querySelectorAll('.detail-actions button').length, 5);
assert.equal(detail.querySelector('img').src.endsWith('/cover/7'), true);
assert.equal(detail.querySelector('script, svg[onload], img[onerror]'), null);
assert.equal(detail.querySelectorAll('[data-onclick], [data-onchange], [data-onerror]').length, 0);

context.renderHome();
const empty = dom.window.document.getElementById('scrollAll');
assert.match(empty.textContent, /<img src=x onerror=alert\(1\)>/);
assert.equal(empty.querySelector('img'), null);

assert.equal((source.match(/\.innerHTML\s*=/g) || []).length, 0);
console.log('Library home DOM tests passed');
