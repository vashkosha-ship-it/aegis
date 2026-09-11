'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'home-continue.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM(`
  <section id="sectionContinue"><div id="scrollContinue"></div></section>
  <div id="otherBooks"></div>
`);
const storage = new Map();
const books = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, title: `Book ${i + 1}` }));
const readingProgress = {};
for (let id = 1; id <= 6; id++) {
  readingProgress[id] = {
    started: true,
    currentPage: id,
    totalPages: 100,
    lastReadAt: `2026-01-0${id}T00:00:00Z`,
  };
}
readingProgress[7] = { started: true, currentPage: 100, totalPages: 100, lastReadAt: '2026-02-01T00:00:00Z' };
readingProgress[8] = { started: false, currentPage: 1, totalPages: 100 };
const state = { readingProgress };
let vibrations = 0;
let homeRenders = 0;
const cards = [];
const context = {
  replaceWithAppMarkup(target, markup) { target.innerHTML = markup; },
  document: dom.window.document,
  state,
  navigator: { vibrate: value => { vibrations += value; } },
  lsGet: key => storage.get(key) ?? null,
  lsSet: (key, value) => storage.set(key, value),
  renderHome: () => { homeRenders += 1; },
  cardHTML: (book, query, options) => {
    cards.push([book.id, query, options]);
    return `<article data-book-id="${book.id}">${book.title}</article>`;
  },
  Date,
  JSON,
};
vm.createContext(context);
vm.runInContext(source, context);

context.renderContinueScroll(books, 'sec');
let renderedIds = Array.from(dom.window.document.querySelectorAll('#scrollContinue article'))
  .map(node => Number(node.dataset.bookId));
assert.deepEqual(renderedIds, [6, 5, 4, 3, 2]);
assert.equal(cards.length, 5);
assert.ok(cards.every(call => call[2].removable === true));
assert.equal(dom.window.document.getElementById('sectionContinue').style.display, '');

context.hideFromResume(6);
assert.deepEqual(JSON.parse(storage.get('aegis_resume_hidden')), [6]);
assert.equal(vibrations, 10);
assert.equal(homeRenders, 1);
context.renderContinueScroll(books, '');
renderedIds = Array.from(dom.window.document.querySelectorAll('#scrollContinue article'))
  .map(node => Number(node.dataset.bookId));
assert.deepEqual(renderedIds, [5, 4, 3, 2, 1]);

context.hideFromResume(6);
assert.deepEqual(JSON.parse(storage.get('aegis_resume_hidden')), [6]);
context.unhideFromResume(6);
assert.deepEqual(JSON.parse(storage.get('aegis_resume_hidden')), []);

storage.set('aegis_resume_hidden', '{broken');
assert.deepEqual(Array.from(context.getResumeHidden()), []);

context.renderBookScroll('otherBooks', books.slice(0, 2), 'q');
assert.equal(dom.window.document.querySelectorAll('#otherBooks article').length, 2);

Object.values(readingProgress).forEach(progress => { progress.started = false; });
context.renderContinueScroll(books, '');
assert.equal(dom.window.document.getElementById('sectionContinue').style.display, 'none');
assert.equal(dom.window.document.getElementById('scrollContinue').innerHTML, '');

assert.doesNotMatch(appSource, /const RESUME_HIDDEN_KEY|function getResumeHidden|function hideFromResume|function unhideFromResume|const CONTINUE_LIMIT|function renderContinueScroll/);
assert.ok(indexSource.indexOf('home-continue.js') < indexSource.indexOf('app.js'));
assert.match(workerSource, /['"]\/home-continue\.js['"]/);
assert.match(workerSource, /aegis-cache-v[0-9]+/);
console.log('Home continue-reading tests passed');
