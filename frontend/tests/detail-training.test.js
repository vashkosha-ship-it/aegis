'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'detail-training.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM('<div id="detailTabTraining"></div>');
const state = {
  currentUser: { name: 'admin', role: 'admin' },
  completedQuizzes: { admin: [7] },
};
const quizStarts = [];
const toasts = [];
let confirmValue = true;
let regenerateError = null;
let questions = [{ id: 1 }, { id: 2 }];
const api = {
  library: {
    regenerateQuiz: async id => {
      if (regenerateError) throw regenerateError;
      assert.equal(id, 7);
      return questions;
    },
  },
};
const context = {
  document: dom.window.document,
  state,
  api,
  currentBookId: 7,
  ICONS: { sparkles: 'sparkles', check: 'check', refresh: 'refresh' },
  sensitiveNonce: () => 'nonce',
  startQuiz: id => quizStarts.push(id),
  showToast: message => toasts.push(message),
  confirm: () => confirmValue,
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  context.renderDetailTraining();
  const container = dom.window.document.getElementById('detailTabTraining');
  assert.match(container.textContent, /Пройдено/);
  assert.match(container.textContent, /Пересоздать тест/);
  assert.match(container.innerHTML, /data-nonce="nonce"/);
  assert.deepEqual(quizStarts, []);

  confirmValue = false;
  await context.regenerateBookQuiz(7);
  assert.deepEqual(quizStarts, []);

  confirmValue = true;
  await context.regenerateBookQuiz(7);
  assert.equal(toasts.at(-1), 'Тест пересоздан: 2 вопросов');
  assert.deepEqual(quizStarts, [7]);

  context.renderDetailTraining();
  regenerateError = { status: 503 };
  await context.regenerateBookQuiz(7);
  const button = dom.window.document.getElementById('regenQuizBtn');
  assert.equal(toasts.at(-1), 'Ошибка (503)');
  assert.equal(button.disabled, false);
  assert.equal(button.querySelector('span').textContent, 'Пересоздать тест (ИИ)');

  state.currentUser = { name: 'reader', role: 'user' };
  state.completedQuizzes.reader = [];
  context.renderDetailTraining();
  assert.deepEqual(quizStarts, [7, 7]);

  context.currentBookId = null;
  context.renderDetailTraining();
  assert.deepEqual(quizStarts, [7, 7]);

  assert.doesNotMatch(appSource, /function renderDetailTraining|function regenerateBookQuiz/);
  assert.ok(indexSource.indexOf('detail-training.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /['"]\/detail-training\.js['"]/);
  assert.match(workerSource, /aegis-cache-v[0-9]+/);
  console.log('Detail training tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
