'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'flashcards.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM('');
const storage = new Map();
let vibrations = 0;
const context = {
  document: dom.window.document,
  navigator: { vibrate: () => { vibrations += 1; } },
  state: {
    mylist: { 7: 'reading' },
    books: [{ id: 7, title: '<Security Book>' }],
  },
  api: { library: { annotations: async () => [
    { page: 3, selected_text: '<Question>', note_text: '<Answer>' },
  ] } },
  lsGet: key => storage.get(key) ?? null,
  lsSet: (key, value) => storage.set(key, value),
  eh: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  const cards = await context.buildFlashcards();
  assert.equal(cards.length, 1);
  assert.equal(cards[0].front, '<Question>');
  assert.equal(cards[0].back, '<Answer>');
  assert.equal(context.dueCards(cards).length, 1);

  await context.openReviewMode();
  const body = dom.window.document.getElementById('reviewBody');
  assert.match(body.innerHTML, /&lt;Security Book&gt;/);
  assert.match(body.innerHTML, /&lt;Question&gt;/);
  assert.match(body.innerHTML, /&lt;Answer&gt;/);
  assert.doesNotMatch(body.innerHTML, /<Question>/);

  context.flipFlashcard();
  assert.equal(dom.window.document.getElementById('flashFront').style.display, 'none');
  assert.equal(dom.window.document.getElementById('flashBack').style.display, 'block');
  assert.equal(vibrations, 1);

  const before = Date.now();
  context.rateCard(true);
  const saved = JSON.parse(storage.get('aegis_srs'));
  const record = saved[cards[0].id];
  assert.equal(record.box, 1);
  assert.ok(record.due >= before + 2 * 24 * 60 * 60 * 1000);
  assert.match(body.textContent, /Сессия завершена/);
  assert.equal(context.dueCards(cards).length, 0);

  assert.doesNotMatch(appSource, /const SRS_KEY|function buildFlashcards|function openReviewMode|function rateCard/);
  assert.ok(indexSource.indexOf('flashcards.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /['"]\/flashcards\.js['"]/);
  assert.match(workerSource, /aegis-cache-v237/);
  console.log('Flashcards tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
