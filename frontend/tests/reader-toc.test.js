'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'reader-toc.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM('');
const storage = new Map();
const pages = [];
let vibrations = 0;
const pdfDoc = {
  getOutline: async () => [
    { title: '<Introduction>', dest: 'intro' },
    { title: 'Without page', dest: null },
  ],
  getDestination: async () => ['page-ref'],
  getPageIndex: async () => 2,
};
const context = {
  document: dom.window.document,
  navigator: { vibrate: () => { vibrations += 1; } },
  currentBookId: 7,
  isEpubMode: false,
  epubBook: null,
  pdfDoc,
  lsGet: key => storage.get(key) ?? null,
  lsSet: (key, value) => storage.set(key, value),
  goToPage: page => pages.push(page),
  eh: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  const toc = await context.buildTOC();
  assert.equal(toc.length, 2);
  assert.equal(toc[0].page, 3);
  assert.equal(toc[1].page, null);

  await context.openTOC();
  const body = dom.window.document.getElementById('tocPanelBody');
  assert.match(body.innerHTML, /&lt;Introduction&gt;/);
  assert.doesNotMatch(body.innerHTML, /<Introduction>/);
  assert.match(body.textContent, /0\/2/);

  context.toggleTocRead(7, 0);
  assert.deepEqual(Array.from(context.getTocRead(7)), [0]);
  assert.equal(vibrations, 1);
  assert.match(body.textContent, /1\/2/);

  context.tocGoTo(3);
  assert.deepEqual(pages, [3]);
  assert.equal(dom.window.document.getElementById('tocModal'), null);

  assert.doesNotMatch(appSource, /const TOC_READ_KEY|function buildTOC|function openTOC|function renderTocPanel/);
  assert.ok(indexSource.indexOf('reader-toc.js') < indexSource.indexOf('reader-open.js'));
  assert.ok(indexSource.indexOf('reader-toc.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /['"]\/reader-toc\.js['"]/);
  assert.match(workerSource, /aegis-cache-v[0-9]+/);
  console.log('Reader TOC tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
