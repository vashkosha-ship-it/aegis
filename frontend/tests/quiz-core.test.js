'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'quiz-core.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM('<div id="detailTabTraining"></div>');
const apiCalls = [];
const toasts = [];
let gamificationRefreshes = 0;

const context = {
  document: dom.window.document,
  api: {
    ApiError: class ApiError extends Error {},
    library: {
      myQuizAttempts: async () => [
        { book_id: 7, percentage: 59 },
        { book_id: 8, percentage: 60 },
      ],
      quiz: async bookId => {
        apiCalls.push(['quiz', bookId]);
        return {
          sessionToken: 'session-1',
          questions: [
            { id: 11, question: '<Первый?>', options: ['Да', '<Нет>'] },
            { id: 12, question: 'Второй?', options: ['A', 'B'] },
          ],
        };
      },
      submitQuiz: async (...args) => {
        apiCalls.push(['submit', ...args]);
        return { score: 1, total: 2, percentage: 60, correct_indices: [0, 1] };
      },
    },
  },
  state: { currentUser: { name: 'alice' }, completedQuizzes: {} },
  ICONS: { chevronLeft: '<', chevronRight: '>', check: 'OK', x: 'X', shield: 'S', education: 'E', refresh: 'R' },
  eh: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  loadingSpinnerHTML: message => `loading:${message}`,
  showToast: message => toasts.push(message),
  refreshGamificationFromApi: () => { gamificationRefreshes += 1; },
  console,
};
vm.createContext(context);
vm.runInContext('let currentQuiz = null;', context);
vm.runInContext(source, context);

(async () => {
  assert.equal(await context.loadCompletedQuizzesFromApi(), true);
  assert.deepEqual(Array.from(context.state.completedQuizzes.alice), [8]);

  await context.startQuiz(42);
  assert.deepEqual(apiCalls[0], ['quiz', 42]);
  assert.match(dom.window.document.getElementById('detailTabTraining').innerHTML, /&lt;Первый\?&gt;/);
  assert.doesNotMatch(dom.window.document.getElementById('detailTabTraining').innerHTML, /<Первый\?>/);

  context.answerQuiz(0);
  context.nextQuestion();
  context.answerQuiz(0);
  await context.finishQuiz();

  assert.deepEqual(apiCalls[1], ['submit', 42, [0, 0], 'session-1']);
  assert.deepEqual(Array.from(context.state.completedQuizzes.alice), [8, 42]);
  assert.equal(gamificationRefreshes, 1);
  assert.match(dom.window.document.getElementById('detailTabTraining').innerHTML, /60%/);
  assert.match(dom.window.document.getElementById('detailTabTraining').innerHTML, /&lt;Нет&gt;/);

  assert.doesNotMatch(appSource, /function renderQuizQuestion|async function startQuiz|async function finishQuiz/);
  assert.ok(indexSource.indexOf('quiz-core.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /['"]\/quiz-core\.js['"]/);
  console.log('Quiz core tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
