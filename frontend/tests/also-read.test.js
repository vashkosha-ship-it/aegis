'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'also-read.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM('<div id="alsoReadSection"></div>');
const calls = [];
let books = [
  { id: 2, title: '<Related>', author: '<Author>', has_cover: true },
  { id: 3, title: 'No cover', author: 'Writer', has_cover: false },
];
let apiError = null;
const api = {
  library: {
    alsoRead: async (...args) => {
      calls.push(args);
      if (apiError) throw apiError;
      return books;
    },
  },
  books: { coverUrl: id => `/api/books/${id}/cover` },
};
const context = {
  document: dom.window.document,
  api,
  eh: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  await context.loadAlsoRead(7);
  const container = dom.window.document.getElementById('alsoReadSection');
  assert.deepEqual(calls, [[7, 8]]);
  assert.match(container.textContent, /Также читают/);
  assert.match(container.textContent, /<Related>/);
  assert.doesNotMatch(container.innerHTML, /<Related>|<Author>/);
  assert.match(container.innerHTML, /\/api\/books\/2\/cover/);
  assert.match(container.innerHTML, /openBookDetail\(2\)/);
  assert.match(container.textContent, /📕/);

  books = [];
  await context.loadAlsoRead(7);
  assert.equal(container.innerHTML, '');

  container.innerHTML = 'old';
  apiError = new Error('offline');
  await context.loadAlsoRead(7);
  assert.equal(container.innerHTML, '');

  const callsBeforeMissingContainer = calls.length;
  context.document = new JSDOM('').window.document;
  await context.loadAlsoRead(7);
  assert.equal(calls.length, callsBeforeMissingContainer);

  assert.doesNotMatch(appSource, /function loadAlsoRead/);
  assert.ok(indexSource.indexOf('also-read.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /['"]\/also-read\.js['"]/);
  assert.match(workerSource, /aegis-cache-v[0-9]+/);
  console.log('Also-read tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
