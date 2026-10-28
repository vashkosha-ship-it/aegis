'use strict';

// Книга в читалке и книга на экране «О книге» — разные вещи. Открыли книгу A,
// вышли на главную, открыли страницу книги B, нажали «Читаю»: читалка
// должна вернуться к A, а «←» — закрыть её без ошибки.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontend = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');
const navigation = read('navigation.js');

const bookA = { id: 1, title: 'A' };
const bookB = { id: 2, title: 'B' };
const context = {
  state: { books: [bookA, bookB], currentBook: bookB, readingProgress: { 1: { currentPage: 5 } } },
  currentBookId: 2, // открыта страница книги B
  readerBookId: 1, // а в читалке осталась книга A
  console,
};
vm.createContext(context);
// Нужны только функции восстановления книги читалки.
const start = navigation.indexOf('function restoreReaderBook()');
const end = navigation.indexOf('function ensureReaderHasBook()');
vm.runInContext(navigation.slice(start, end), context);

assert.equal(context.restoreReaderBook(), true);
assert.equal(context.currentBookId, 1);
assert.equal(context.state.currentBook, bookA);

// Книги больше нет (удалили, вошёл другой пользователь) — открытой книги нет.
context.readerBookId = 99;
assert.equal(context.restoreReaderBook(), false);
assert.equal(context.readerBookId, null);

// Подключение: openReader запоминает книгу, «Читаю» и «←» её возвращают,
// закрытие не падает без прогресса и забывает книгу.
assert.match(read('reader-open.js'), /readerBookId = id;/);
assert.match(navigation, /function ensureReaderHasBook\(\) \{\n  if \(restoreReaderBook\(\)\) return;/);
const lifecycle = read('reader-lifecycle.js');
assert.match(lifecycle, /function closeReader\(\) \{\n  if \(typeof restoreReaderBook === 'function'\) restoreReaderBook\(\);/);
assert.match(lifecycle, /if \(state\.currentBook && openProgress\)/);
assert.match(lifecycle, /readerBookId = null;/);
assert.match(lifecycle, /returnTo === 'detail'[^\n]*\n    openBookDetail\(currentBookId\);/);
assert.match(read('app-state.js'), /let readerBookId = null;/);

console.log('reader book switch tests passed');
