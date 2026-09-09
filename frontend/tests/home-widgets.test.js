const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'home-widgets.js'), 'utf8');
const dom = new JSDOM(`
  <section id="sectionRecommendations"><h2 class="section-title"></h2><div id="recommendationsList"></div></section>
  <section id="sectionBooksGoal"><div id="booksGoalWidget"></div></section>`);
const context = {
  document: dom.window.document,
  state: { currentUser: { department: 'SOC' } },
  getRecommendations: () => [{ id: 7, title: '<Admin>', author: 'A&B', rating: 5, has_cover: false }],
  departmentTopicKeywords: () => ['security'],
  api: { books: { coverUrl: id => `/covers/${id}` } },
  ICONS: { bookCover: '<svg></svg>' },
  eh: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  getBooksGoal: () => ({ count: 4, period: 'month' }),
  booksCompletedInPeriod: () => 2,
};
vm.createContext(context);
vm.runInContext(source, context);

context.renderRecommendations();
assert.strictEqual(dom.window.document.querySelector('.section-title').textContent, 'Рекомендуем для вашего подразделения');
assert.ok(dom.window.document.getElementById('recommendationsList').innerHTML.includes('&lt;Admin&gt;'));
assert.ok(dom.window.document.getElementById('recommendationsList').innerHTML.includes('A&amp;B'));
context.renderBooksGoalWidget();
assert.ok(dom.window.document.getElementById('booksGoalWidget').textContent.includes('2/4'));
assert.ok(dom.window.document.getElementById('booksGoalWidget').textContent.includes('Осталось 2'));

const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert.ok(!app.includes('function renderRecommendations()'));
assert.ok(!app.includes('function renderBooksGoalWidget()'));
console.log('home-widgets: ok');
