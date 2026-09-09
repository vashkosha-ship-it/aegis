'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const moduleNames = ['home-recommendations.js', 'home-books-goal.js', 'home-catalog.js'];
const sources = moduleNames.map(name => fs.readFileSync(path.join(FRONTEND, name), 'utf8'));
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM(`
  <section id="sectionRecommendations"><h2 class="section-title"></h2><div id="recommendationsList"></div></section>
  <section id="sectionBooksGoal"><div id="booksGoalWidget"></div></section>
  <input id="searchInput" value=" Query ">
  <div id="scrollAll"></div>
  <div id="booksPager"></div>
`);

let recommendations = [];
let goal = null;
let completed = 0;
let filteredBooks = [];
let detailId = null;
let scrolled = 0;
const dynamicStyles = [];
const captureDynamicStyle = (strings, ...values) => {
  const value = strings.reduce((result, part, index) => result + part + (index < values.length ? values[index] : ''), '');
  dynamicStyles.push(value);
  return `test-style-${dynamicStyles.length}`;
};
const state = {
  currentUser: null,
  booksPage: 1,
  readingProgress: {},
};
const context = {
  document: dom.window.document,
  dynamicStyleToken: captureDynamicStyle,
  state,
  api: { books: { coverUrl: id => `/covers/${id}` } },
  ICONS: { bookCover: '<span>cover</span>', star: '<span>star</span>', cloudCheck: '<span>cloud</span>' },
  offlineBookIds: new Set(),
  getRecommendations: limit => recommendations.slice(0, limit),
  departmentTopicKeywords: () => ['security'],
  getBooksGoal: () => goal,
  booksCompletedInPeriod: () => completed,
  getFilteredBooks: () => filteredBooks,
  eh: value => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;'),
};
vm.createContext(context);
sources.forEach(source => vm.runInContext(source, context));

context.renderRecommendations();
assert.equal(dom.window.document.getElementById('sectionRecommendations').style.display, 'none');

recommendations = [{ id: 7, title: '<Unsafe>', author: 'A & B', rating: 4.8, has_cover: true }];
state.currentUser = { department: 'security' };
context.renderRecommendations();
assert.equal(dom.window.document.querySelector('.section-title').textContent, 'Рекомендуем для вашего подразделения');
assert.match(dom.window.document.getElementById('recommendationsList').innerHTML, /&lt;Unsafe&gt;/);
assert.match(dom.window.document.getElementById('recommendationsList').innerHTML, /A &amp; B/);
assert.match(dom.window.document.getElementById('recommendationsList').innerHTML, /\/covers\/7/);

context.renderBooksGoalWidget();
assert.equal(dom.window.document.getElementById('sectionBooksGoal').style.display, 'none');

goal = { count: 8, period: 'quarter' };
completed = 3;
context.renderBooksGoalWidget();
assert.equal(dom.window.document.getElementById('sectionBooksGoal').style.display, 'block');
assert.match(dom.window.document.getElementById('booksGoalWidget').textContent, /3\/8/);
assert.match(dom.window.document.getElementById('booksGoalWidget').textContent, /квартал/);
assert(dynamicStyles.some(value => /width:38%/.test(value)));

completed = 9;
context.renderBooksGoalWidget();
assert.match(dom.window.document.getElementById('booksGoalWidget').textContent, /Цель достигнута/);
assert(dynamicStyles.some(value => /width:100%/.test(value)));

assert.equal(context.extractBookYear('Published 2024-04-01'), '2024');
assert.equal(context.extractBookYear(null), null);
state.readingProgress[1] = { started: true, currentPage: 25, totalPages: 100 };
context.offlineBookIds.add(1);
const card = context.cardHTML({
  id: 1,
  title: '<Book "one">',
  rating: 5,
  has_cover: false,
  datePublished: '2023-01-01',
}, '', { removable: true });
assert.match(card, /&lt;Book &quot;one&quot;&gt;/);
assert.match(card, /offline-badge/);
assert.match(card, /25%/);
assert.match(card, /book-card-year">2023/);
assert.match(card, /hideFromResume\(1\)/);

filteredBooks = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1,
  title: `Book ${i + 1}`,
  rating: 4,
  has_cover: false,
}));
context.renderPaginatedBooks('scrollAll', filteredBooks, '');
assert.equal(dom.window.document.querySelectorAll('#scrollAll .book-card-compact').length, 24);
assert.match(dom.window.document.getElementById('booksPager').textContent, /Страница 1 из 3/);

state.booksPage = 99;
context.renderPaginatedBooks('scrollAll', filteredBooks, '');
assert.equal(state.booksPage, 3);
assert.equal(dom.window.document.querySelectorAll('#scrollAll .book-card-compact').length, 2);

const all = dom.window.document.getElementById('scrollAll');
all.scrollIntoView = () => { scrolled += 1; };
context.goToBooksPage(2);
assert.equal(state.booksPage, 2);
assert.equal(scrolled, 1);
assert.equal(dom.window.document.querySelectorAll('#scrollAll .book-card-compact').length, 24);

for (const name of moduleNames) {
  assert.ok(indexSource.indexOf(name) < indexSource.indexOf('app.js'), `${name} must load before app.js`);
  assert.ok(workerSource.includes(`'/${name}'`), `${name} must be precached`);
}
assert.doesNotMatch(appSource, /function renderRecommendations|function renderBooksGoalWidget|const BOOKS_PER_PAGE|function renderPaginatedBooks|function goToBooksPage|function extractBookYear|function cardHTML/);
assert.match(workerSource, /aegis-cache-v[0-9]+/);
console.log('Home widgets tests passed');
