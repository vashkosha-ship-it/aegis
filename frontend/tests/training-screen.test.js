'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'training-screen.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM(`
  <div id="trainingTabs">
    <button class="training-tab" data-ttab="all">Все</button>
    <button class="training-tab" data-ttab="completed">Пройдено</button>
    <button class="training-tab" data-ttab="pending">Не пройдено</button>
  </div>
  <div id="trainingList"></div>
  <div id="onboardingResult"></div><div id="onboardingQuiz"></div>
  <div id="onboardingWelcome" class="hidden"></div>
  <button class="detail-tab" data-dtab="training"></button>
`);
const calls = [];
let confirmResult = true;
const context = {
  replaceWithAppMarkup(target, markup) { target.innerHTML = markup; },
  document: dom.window.document,
  state: {
    trainingTab: 'all',
    currentUser: { name: 'alice', cyber_level: 'scout' },
    completedQuizzes: { alice: [1] },
    books: [
      { id: 1, title: 'Пройденная', categories: ['SOC'] },
      { id: 2, title: '<img src=x>', categories: ['GRC'] },
    ],
  },
  ICONS: { target: '<svg width="22" height="22"></svg>', check: 'OK', clock: 'TIME', education: 'EDU' },
  updateAvatar: id => calls.push(['avatar', id]),
  getCyberLevelInfo: () => ({ icon: '<svg width="20" height="20"></svg>', name: 'Разведчик' }),
  bookCategoriesText: book => book.categories.join(', '),
  eh: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  renderLevelChoices: () => calls.push(['levels']),
  navigateTo: screen => calls.push(['navigate', screen]),
  openBookDetail: id => calls.push(['book', id]),
  setTimeout: fn => { fn(); return 1; },
  confirm: () => confirmResult,
};
vm.createContext(context);
vm.runInContext(source, context);

context.renderTrainingScreen();
let list = dom.window.document.getElementById('trainingList');
assert.equal(list.querySelectorAll('.training-card').length, 2);
assert.equal(list.querySelector('img'), null);
assert.match(list.innerHTML, /&lt;img src=x&gt;/);

dom.window.document.querySelector('[data-ttab="completed"]').click();
assert.equal(context.state.trainingTab, 'completed');
assert.equal(list.querySelectorAll('.training-card').length, 1);
assert.match(list.textContent, /Пройденная/);
assert.match(list.textContent, /Разведчик/);

context.state.currentUser.cyber_level = null;
context.renderTrainingScreen();
assert.match(list.textContent, /Определи свой уровень/);

context.startQuizFromTraining(2);
assert.deepEqual(calls.at(-1), ['book', 2]);
 
confirmResult = false;
context.state.currentUser.cyber_level = 'scout';
context.restartOnboardingFromTraining();
assert.notDeepEqual(calls.at(-1), ['navigate', 'onboarding']);
confirmResult = true;
context.restartOnboardingFromTraining();
assert.deepEqual(calls.slice(-2), [['levels'], ['navigate', 'onboarding']]);
assert.ok(dom.window.document.getElementById('onboardingResult').classList.contains('hidden'));
assert.ok(!dom.window.document.getElementById('onboardingWelcome').classList.contains('hidden'));

assert.doesNotMatch(appSource, /function renderTrainingScreen|function startQuizFromTraining/);
assert.ok(indexSource.indexOf('training-screen.js') < indexSource.indexOf('app.js'));
assert.match(workerSource, /['"]\/training-screen\.js['"]/);
console.log('Training screen tests passed');
