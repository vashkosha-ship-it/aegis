'use strict';

// Сортировка таблицы книг в админке по столбцам.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'admin-screens.js'), 'utf8');
const pick = (start, end) => src.slice(src.indexOf(start), src.indexOf(end));
const sandbox = { Intl, hasRating: b => b.rating != null && b.rating > 0, bookCategoriesText: b => (b.categories || []).join(', ') };
vm.createContext(sandbox);
vm.runInContext(pick('let adminBooksSort =', 'function initAdminBooksSort()')
  + '\nthis.sortBy = (key, dir) => { adminBooksSort = { key, dir }; };\nthis.sortAdminBooks = sortAdminBooks;', sandbox);

const books = [
  { id: 1, title: 'Яблоко', categories: ['Сети'], file_format: 'pdf', indexing_status: 'succeeded', rating: 4.5 },
  { id: 2, title: 'арбуз', categories: [], file_format: 'epub', indexing_status: 'failed', rating: null },
  { id: 3, title: 'Банан', categories: ['Анализ'], file_format: 'pdf', indexing_status: 'queued', rating: 3 },
  { id: 4, title: 'Вишня', categories: ['Сети'], file_format: 'epub', indexing_status: 'running', rating: 5 },
];
const ids = (key, dir) => { sandbox.sortBy(key, dir); return sandbox.sortAdminBooks(books).map(b => b.id).join(','); };

assert.equal(ids('title', 1), '2,3,4,1');           // без учёта регистра, по-русски
assert.equal(ids('title', -1), '1,4,3,2');
assert.equal(ids('format', 1), '2,4,1,3');          // устойчиво внутри одного формата
assert.equal(ids('index', 1), '2,4,3,1');           // ошибка → индексируется → очередь → готово
assert.equal(ids('rating', -1), '4,1,3,2');         // без рейтинга — в конце
assert.equal(ids('rating', 1), '3,1,4,2');          // и при обратном порядке тоже
assert.equal(ids('category', 1), '3,1,4,2');        // без категории — в конце
assert.equal(ids(null, 1), '1,2,3,4');              // без сортировки — как пришло

console.log('admin-books-sort: ok');
