'use strict';

// Список книг: первая страница даёт total, остальные грузятся параллельно,
// а порядок книг сохраняется.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'library-home.js'), 'utf8');
const TOTAL = 1880;
let inFlight = 0;
let maxInFlight = 0;
const requested = [];
const context = {
  state: { books: [], readingProgress: {} },
  api: {
    isAuthBootstrapPending: () => false,
    books: {
      list: async ({ per_page: perPage, page }) => {
        requested.push(page);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        // Поздние страницы отвечают быстрее ранних — порядок всё равно сохраняется.
        await new Promise(resolve => setTimeout(resolve, 30 - page));
        inFlight -= 1;
        const start = (page - 1) * perPage;
        const items = [];
        for (let id = start + 1; id <= Math.min(TOTAL, start + perPage); id++) items.push({ id });
        return { items, total: TOTAL };
      },
    },
  },
  showSkeleton() {},
  ICONS: { bookCover: '' },
  navigator: { onLine: true },
  adaptBookFromApi: book => book,
  ensureProgress() {},
  saveState() {},
  document: { getElementById: () => null, querySelector: () => null, addEventListener() {} },
  window: {},
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  const ok = await context.loadBooksFromApi();
  assert.equal(ok, true);
  assert.equal(context.state.books.length, TOTAL);
  assert.equal(context.state.books.slice(0, 3).map(book => book.id).join(','), '1,2,3');
  assert.equal(context.state.books.at(-1).id, TOTAL);
  assert.ok(context.state.books.every((book, index) => book.id === index + 1), 'порядок книг сохранён');
  assert.equal(requested.length, 19);
  assert.ok(maxInFlight > 1 && maxInFlight <= 4, `параллельно ${maxInFlight}`);
  console.log('Parallel book loading tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
