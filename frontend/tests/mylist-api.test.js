'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'mylist-api.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

class ApiError extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

const state = { currentScreen: 'mylist', mylist: { 99: 'stale' } };
let entries = [{ book_id: 1, status: 'reading' }, { book_id: 2, status: 'planned' }];
let loadError = null;
let mutationError = null;
const mutations = [];
const toasts = [];
let listRenders = 0;
let detailRenders = 0;
const api = {
  ApiError,
  library: {
    mylist: async () => {
      if (loadError) throw loadError;
      return entries;
    },
    setMylistStatus: async (...args) => {
      mutations.push(['set', ...args]);
      if (mutationError) throw mutationError;
    },
    removeFromMylist: async (...args) => {
      mutations.push(['remove', ...args]);
      if (mutationError) throw mutationError;
    },
  },
};
const context = {
  state,
  api,
  showToast: message => toasts.push(message),
  renderMyList: () => { listRenders += 1; },
  renderBookInfo: () => { detailRenders += 1; },
  console: { error: () => {} },
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  assert.equal(await context.loadMyListFromApi(), true);
  assert.deepEqual({ ...state.mylist }, { 1: 'reading', 2: 'planned' });

  loadError = new Error('offline');
  assert.equal(await context.loadMyListFromApi(), false);
  assert.deepEqual({ ...state.mylist }, { 1: 'reading', 2: 'planned' });
  assert.equal(toasts.at(-1), 'Не удалось загрузить ваши закладки');

  await context.updateBookStatus(1, 'completed');
  assert.equal(state.mylist[1], 'completed');
  assert.deepEqual(mutations.at(-1), ['set', 1, 'completed']);
  assert.equal(toasts.at(-1), 'Статус обновлён');
  assert.equal(listRenders, 1);

  await context.updateBookStatus(2, null);
  assert.equal(state.mylist[2], undefined);
  assert.deepEqual(mutations.at(-1), ['remove', 2]);

  state.mylist[1] = 'reading';
  mutationError = new ApiError(409, 'Конфликт');
  await context.updateBookStatus(1, 'dropped');
  assert.equal(state.mylist[1], 'reading');
  assert.equal(toasts.at(-1), 'Ошибка: Конфликт');

  state.currentScreen = 'detail';
  mutationError = new Error('network');
  await context.updateBookStatus(3, 'liked');
  assert.equal(state.mylist[3], undefined);
  assert.equal(detailRenders, 1);
  assert.equal(toasts.at(-1), 'Сервер недоступен');

  assert.doesNotMatch(appSource, /function loadMyListFromApi|function updateBookStatus/);
  assert.ok(indexSource.indexOf('mylist-api.js') < indexSource.indexOf('mylist-drag-drop.js'));
  assert.ok(indexSource.indexOf('mylist-api.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /['"]\/mylist-api\.js['"]/);
  assert.match(workerSource, /aegis-cache-v[0-9]+/);
  console.log('My List API tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
