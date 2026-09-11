'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'reader-selection-ai.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM(`
  <div id="pdfViewport" style="width:500px;height:800px"></div>
  <div id="selectionToolbar"></div>
`);
const viewport = dom.window.document.getElementById('pdfViewport');
Object.defineProperties(viewport, {
  scrollWidth: { value: 500 },
  scrollHeight: { value: 800 },
});
viewport.getBoundingClientRect = () => ({ left: 10, top: 20, width: 500, height: 800 });

const range = {
  getBoundingClientRect: () => ({ left: 110, top: 220, width: 100, height: 40 }),
};
const selection = {
  rangeCount: 1,
  toString: () => 'Zero Trust',
  getRangeAt: () => range,
  removeAllRanges: () => {},
};
dom.window.getSelection = () => selection;

const highlights = [];
const notes = [];
const toasts = [];
let promptOptions = null;
const context = {
  replaceWithAppMarkup(target, markup) { target.innerHTML = markup; },
  window: dom.window,
  document: dom.window.document,
  navigator: {},
  state: { currentScreen: 'reader' },
  isEpubMode: false,
  currentBookId: 7,
  pdfCurrentPage: 4,
  lastSelection: null,
  readerCurrentPageText: '',
  ICONS: { sparkles: '*' },
  addHighlight: (...args) => highlights.push(args),
  addNote: (...args) => notes.push(args),
  showPromptModal: options => { promptOptions = options; },
  showToast: message => toasts.push(message),
  buildAssistantContext: prompt => ({ prompt }),
  api: { assistantChat: async () => ({ reply: 'Готовый ответ' }) },
  eh: value => String(value).replaceAll('<', '&lt;'),
  closeModal: () => {},
  setTimeout: callback => { callback(); return 1; },
  clearTimeout: () => {},
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  assert.equal(context.showSelectionToolbar(), true);
  assert.equal(context.lastSelection.text, 'Zero Trust');
  assert.equal(dom.window.document.getElementById('selectionToolbar').style.display, 'flex');

  context.highlightSelection('#10b981');
  assert.equal(highlights.length, 1);
  assert.equal(highlights[0][0], 7);
  assert.equal(highlights[0][2], 4);
  assert.equal(highlights[0][3].color, '#10b981');

  context.lastSelection = { text: 'цитата', range };
  context.addNoteToSelection();
  assert.ok(promptOptions);
  promptOptions.onConfirm('моя заметка');
  assert.equal(notes.length, 1);
  assert.equal(notes[0][2], 'моя заметка');

  await context.runReaderAi('объясни', 'Заголовок', 'Загрузка');
  assert.equal(dom.window.document.getElementById('readerAiContent').textContent, 'Готовый ответ');

  context.summarizeCurrentChapter();
  assert.ok(toasts.includes('Нет текста страницы для конспекта'));

  assert.doesNotMatch(appSource, /function showSelectionToolbar|function runReaderAi|function highlightSelection/);
  assert.ok(indexSource.indexOf('reader-selection-ai.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /['"]\/reader-selection-ai\.js['"]/);
  assert.match(workerSource, /aegis-cache-v[0-9]+/);
  console.log('Reader selection and AI tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
