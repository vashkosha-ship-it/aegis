'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'catalog-filters.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM(`
  <div id="catalogPanel"></div>
  <div id="catalogChips"></div>
  <select id="filterSort">
    <option value="default">default</option><option value="rating">rating</option>
    <option value="title">title</option><option value="dateAdded">dateAdded</option>
  </select>
  <input id="searchInput">
`);
const renders = [];
const toasts = [];
const context = {
  document: dom.window.document,
  state: {
    catalogOpen: false,
    booksPage: 3,
    filters: { categories: [], sort: 'default' },
    books: [
      { id: 1, title: 'Zulu', author: 'Alice', categories: ['SOC', '<img src=x>'], rating: '4.2', popularity: 10, dateAdded: '2025-01-01' },
      { id: 2, title: 'Alpha', author: 'Bob', categories: ['GRC'], rating: '4.9', popularity: 20, dateAdded: '2026-01-01' },
      { id: 3, title: 'Beta', author: 'Alice', categories: ['SOC'], rating: '4.5', popularity: 5, dateAdded: '2024-01-01' },
    ],
  },
  eh: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  renderHome: () => renders.push('render'),
  showToast: message => toasts.push(message),
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context);

context.toggleCatalogPanel();
assert.equal(context.state.catalogOpen, true);
assert.ok(dom.window.document.getElementById('catalogPanel').classList.contains('show'));
assert.equal(dom.window.document.querySelectorAll('.catalog-chip').length, 3);
assert.equal(dom.window.document.querySelector('#catalogChips img'), null);
assert.match(dom.window.document.getElementById('catalogChips').innerHTML, /&lt;img src=x&gt;/);
assert.equal(dom.window.document.querySelector('.catalog-chip').getAttribute('data-onclick'), null);
assert.equal(context._catCache, undefined);

dom.window.document.querySelector('.catalog-chip').dispatchEvent(new dom.window.Event('click'));
assert.deepEqual(Array.from(context.state.filters.categories), ['SOC']);
context.state.filters.categories = [];

context.toggleCategoryFilter('SOC');
assert.deepEqual(Array.from(context.state.filters.categories), ['SOC']);
assert.equal(context.state.booksPage, 1);
assert.equal(toasts.at(-1), 'Применено');
assert.deepEqual(Array.from(context.getFilteredBooks(), b => b.id), [1, 3]);

dom.window.document.getElementById('searchInput').value = 'alice';
context.state.filters.categories = [];
context.state.filters.sort = 'rating';
assert.deepEqual(Array.from(context.getFilteredBooks(), b => b.id), [3, 1]);

context.resetFilters();
assert.deepEqual(Array.from(context.state.filters.categories), []);
assert.equal(context.state.filters.sort, 'default');
assert.equal(toasts.at(-1), 'Сброшено');
assert.ok(renders.length >= 2);

context.closeCatalogPanel();
assert.equal(context.state.catalogOpen, false);

assert.doesNotMatch(appSource, /function toggleCatalogPanel|function getFilteredBooks/);
assert.ok(indexSource.indexOf('catalog-filters.js') < indexSource.indexOf('app.js'));
assert.match(workerSource, /['"]\/catalog-filters\.js['"]/);
console.log('Catalog filters tests passed');
