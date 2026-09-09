'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'epub-annotations.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM('<body></body>');
const highlights = [];
const createdHighlights = [];
const createdNotes = [];
const toasts = [];
const displays = [];
const openedBooks = [];
const timers = [];
const state = { currentBook: { id: 5 } };
const context = {
  window: dom.window,
  document: dom.window.document,
  state,
  epubCurrentPage: 3,
  epubRendition: {
    annotations: {
      highlight: (...args) => highlights.push(args),
    },
    display: cfi => displays.push(cfi),
  },
  ICONS: { marker: '<i>marker</i>', note: '<i>note</i>' },
  addHighlight: async (...args) => { createdHighlights.push(args); return { id: 1 }; },
  addNote: async (...args) => { createdNotes.push(args); return { id: 2 }; },
  getAnnotations: async () => [
    { type: 'highlight', position: { cfi: 'epubcfi(/6/2)' } },
    { type: 'note', position: { cfi: 'epubcfi(/6/4)' } },
  ],
  showToast: message => toasts.push(message),
  showPromptModal: () => {},
  openReader: id => openedBooks.push(id),
  setTimeout: callback => { timers.push(callback); return timers.length; },
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  await context.saveEpubAnnotation('highlight', 'выделение', 'epubcfi(/6/2)');
  assert.equal(createdHighlights.length, 1);
  assert.equal(createdHighlights[0][0], 5);
  assert.equal(createdHighlights[0][2], 3);
  assert.match(highlights[0][4].fill, /251, 191, 36/);
  assert.ok(toasts.includes('Маркер сохранён'));

  await context.saveEpubAnnotation('note', 'цитата', 'epubcfi(/6/4)', 'заметка');
  assert.equal(createdNotes.length, 1);
  assert.equal(createdNotes[0][2], 'заметка');
  assert.match(highlights[1][4].fill, /0, 212, 255/);

  await context.loadAndApplyEpubHighlights();
  assert.equal(highlights.length, 4);

  context.showEpubSelectionPopup('текст', 'epubcfi(/6/6)', 100, 80, null);
  assert.ok(dom.window.document.getElementById('epubBtnHighlight'));
  assert.ok(dom.window.document.getElementById('epubBtnNote'));

  await context.goToEpubAnnotation(5, 'epubcfi(/6/8)');
  assert.equal(openedBooks[0], 5);
  timers.at(-1)();
  assert.ok(displays.includes('epubcfi(/6/8)'));

  assert.doesNotMatch(appSource, /function handleEpubSelection|function saveEpubAnnotation|function loadAndApplyEpubHighlights/);
  assert.ok(indexSource.indexOf('epub-annotations.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /['"]\/epub-annotations\.js['"]/);
  assert.match(workerSource, /aegis-cache-v[0-9]+/);
  console.log('EPUB annotations tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
