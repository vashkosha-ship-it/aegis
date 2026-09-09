'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'reader-search.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM(`
  <div id="readerSearchPanel" style="display:none"></div>
  <input id="readerSearchInput">
  <span id="readerSearchStatus"></span>
  <button id="readerSearchPrev"></button>
  <button id="readerSearchNext"></button>
  <button id="readerSearchClose"></button>
  <div id="pdfTextLayer"><span>Найденный термин</span><span>Другое</span></div>
`);
for (const span of dom.window.document.querySelectorAll('span')) {
  span.scrollIntoView = () => {};
}

const pageTexts = [
  'Первый термин и ещё один ТЕРМИН на странице.',
  'На второй странице совпадений нет.',
];
const context = {
  window: dom.window,
  document: dom.window.document,
  NodeFilter: dom.window.NodeFilter,
  ICONS: { chevronUp: 'up', chevronDown: 'down', closeX: 'close' },
  isEpubMode: false,
  epubRendition: null,
  epubBook: null,
  pdfDoc: {
    getPage: async pageNumber => ({
      getTextContent: async () => ({ items: [{ str: pageTexts[pageNumber - 1] }] }),
    }),
  },
  pdfTotalPages: 2,
  pdfCurrentPage: 1,
  currentBookId: 7,
  renderPdfPage: async () => {},
  updateReaderUI: () => {},
  setTimeout,
  clearTimeout,
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  context.toggleReaderSearch();
  assert.equal(dom.window.document.getElementById('readerSearchPanel').style.display, 'flex');
  assert.equal(dom.window.document.getElementById('readerSearchPrev').innerHTML, 'up');

  const results = await context.searchInPdf('термин');
  assert.equal(results.length, 2);
  assert.equal(results.map(result => result.page).join(','), '1,1');
  assert.ok(results.every(result => result.query === 'термин'));

  context.highlightPdfMatchOnPage({ query: 'найденный' });
  assert.equal(
    dom.window.document.querySelector('#pdfTextLayer span').classList.contains('search-match-highlight'),
    true,
  );

  context.closeReaderSearch();
  assert.equal(dom.window.document.getElementById('readerSearchPanel').style.display, 'none');
  assert.equal(vm.runInContext('readerSearchResults.length', context), 0);

  assert.doesNotMatch(appSource, /function toggleReaderSearch|function searchInPdf|function searchInEpub/);
  assert.ok(indexSource.indexOf('reader-search.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /['"]\/reader-search\.js['"]/);
  assert.match(workerSource, /aegis-cache-v247/);
  console.log('Reader search tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
