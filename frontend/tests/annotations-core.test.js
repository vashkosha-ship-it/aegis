'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'annotations-core.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

let loads = 0;
const created = [];
const deleted = [];
const toasts = [];
let renderCount = 0;
let notesRenderCount = 0;
let gamificationRefreshes = 0;
let rejectDelete = false;

class ApiError extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

const api = {
  ApiError,
  library: {
    annotations: async bookId => {
      loads += 1;
      return [{
        id: 7,
        type: 'note',
        selected_text: 'enc:fragment-' + bookId,
        note_text: 'enc:note',
        page: 3,
        position: { x: 10 },
        created_at: '2026-09-01T00:00:00Z',
      }];
    },
    addAnnotation: async (bookId, payload) => {
      created.push([bookId, payload]);
      return { id: 8, ...payload };
    },
    deleteAnnotation: async annId => {
      if (rejectDelete) throw new ApiError(403, 'forbidden');
      deleted.push(annId);
    },
  },
};

const context = {
  api,
  currentBookId: 42,
  state: { currentScreen: 'detail', detailTab: 'notes' },
  decryptNote: async value => String(value).replace(/^enc:/, ''),
  encryptNote: async value => 'enc:' + value,
  renderAnnotations: async () => { renderCount += 1; },
  renderDetailNotes: () => { notesRenderCount += 1; },
  refreshGamificationFromApi: () => { gamificationRefreshes += 1; },
  showToast: message => toasts.push(message),
  console,
};
vm.createContext(context);
vm.runInContext('let _noteKey = { active: true };', context);
vm.runInContext(source, context);

(async () => {
  const first = await context.getAnnotations(42);
  const second = await context.getAnnotations(42);
  assert.equal(loads, 1, 'повторное чтение должно использовать кэш');
  assert.deepEqual(first, second);
  assert.equal(first[0].text, 'fragment-42');
  assert.equal(first[0].note, 'note');

  await context.addHighlight(42, 'фрагмент', 5, { x: 15 });
  assert.equal(created[0][1].type, 'highlight');
  assert.equal(created[0][1].selected_text, 'enc:фрагмент');
  assert.equal(renderCount, 1);
  assert.equal(gamificationRefreshes, 1);

  await context.getAnnotations(42);
  assert.equal(loads, 2, 'мутация должна сбросить кэш');

  await context.addNote(42, 'текст', 'заметка', 6, { y: 20 });
  assert.equal(created[1][1].type, 'note');
  assert.equal(created[1][1].selected_text, 'enc:текст');
  assert.equal(created[1][1].note_text, 'enc:заметка');

  assert.equal(await context.addHighlight(42, '', 1, {}), null);
  assert.ok(toasts.includes('Слишком длинный фрагмент (максимум 10000 символов)'));

  assert.equal(await context.deleteAnnotation(42, 7), true);
  assert.deepEqual(deleted, [7]);
  assert.equal(notesRenderCount, 1);

  rejectDelete = true;
  assert.equal(await context.deleteAnnotation(42, 9), false);
  assert.ok(toasts.includes('Нельзя удалить чужую аннотацию'));

  assert.doesNotMatch(appSource, /const annotationsCache|async function adaptAnnotation|async function addHighlight|async function addNote|async function deleteAnnotation/);
  assert.ok(indexSource.indexOf('annotations-core.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /const CACHE_NAME = 'aegis-cache-v\d+'/);
  assert.match(workerSource, /['"]\/annotations-core\.js['"]/);
  console.log('Annotations core tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
