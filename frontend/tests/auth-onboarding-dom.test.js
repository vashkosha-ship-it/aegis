'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const authSource = fs.readFileSync(path.join(frontend, 'auth-ui.js'), 'utf8');
const onboardingSource = fs.readFileSync(path.join(frontend, 'onboarding.js'), 'utf8');

const authDom = new JSDOM(`
  <form id="authForm"></form>
  <select id="authDepartment"></select><input id="authDepartmentOther">
  <input id="authPass" type="password"><svg id="eyeIcon"></svg>
`);
const authCalls = [];
const authContext = {
  window: authDom.window,
  document: authDom.window.document,
  state: { currentUser: { cyber_level: null } },
  api: { me: async () => ({ is_approved: false }), logout: async () => {} },
  renderLevelChoices: () => authCalls.push('levels'),
  navigateTo: screen => authCalls.push(screen),
  showToast: () => {},
  clearNoteKey: () => {}, stopSyncPolling: () => {},
  console,
};
vm.createContext(authContext);
vm.runInContext(authSource, authContext);

authContext.openForgotPassword();
const forgot = authDom.window.document.getElementById('forgotPasswordModal');
assert.match(forgot.textContent, /Восстановление пароля/);
assert.equal(forgot.querySelectorAll('[data-onclick]').length, 0);

authContext.showPendingApprovalScreen();
let pending = authDom.window.document.getElementById('pendingApprovalOverlay');
assert.ok(pending.querySelector('#pendingStartTestBtn'));
assert.equal(pending.querySelectorAll('[data-onclick]').length, 0);
pending.querySelector('#pendingStartTestBtn').click();
assert.deepEqual(authCalls, ['levels', 'onboarding']);

authContext.state.currentUser.cyber_level = 'scout';
authContext.showPendingApprovalScreen();
pending = authDom.window.document.getElementById('pendingApprovalOverlay');
assert.equal(pending.querySelector('#pendingStartTestBtn'), null);
assert.match(pending.textContent, /уже прошли тест уровня/);

authContext.showVerifyEmailScreen('<img src=x onerror=alert(1)>');
const verify = authDom.window.document.getElementById('verifyEmailOverlay');
assert.match(verify.textContent, /<img src=x onerror=alert\(1\)>/);
assert.equal(verify.querySelector('img'), null);
assert.equal(verify.querySelectorAll('[data-onclick]').length, 0);
assert.doesNotMatch(authSource, /\.innerHTML\s*=/);

const onboardingDom = new JSDOM(`
  <div id="levelChoiceList"></div>
  <span id="onboardingCurrent"></span><span id="onboardingTotal"></span>
  <div id="onboardingProgressFill"></div><div id="onboardingTopicBadge"></div>
  <div id="onboardingQuestion"></div><div id="onboardingOptions"></div>
  <button id="btnOnboardingPrev"></button><button id="btnOnboardingNext"></button>
  <button id="btnOnboardingFinish"></button>
  <div id="onboardingWelcome"></div><div id="onboardingQuiz"></div>
`);
const onboardingContext = {
  document: onboardingDom.window.document,
  state: { currentUser: null },
  ICONS: { target: '<svg data-icon="target"></svg>' },
  getCyberLevelInfo: () => ({ icon: '<svg data-icon="level"></svg>' }),
  appendTrustedIcon: (container, markup) => {
    const parsed = new onboardingDom.window.DOMParser().parseFromString(markup, 'image/svg+xml');
    container.appendChild(onboardingDom.window.document.importNode(parsed.documentElement, true));
  },
  console,
};
vm.createContext(onboardingContext);
vm.runInContext(onboardingSource, onboardingContext);
onboardingContext.renderLevelChoices();
const choices = onboardingDom.window.document.getElementById('levelChoiceList');
assert.equal(choices.querySelectorAll('button').length, 6);
assert.equal(choices.querySelectorAll('[data-onclick]').length, 0);

vm.runInContext(`onboardingState = {
  questions: [{ id: 1, topic: 'basics', question: 'Безопасный вопрос', options: ['<img src=x>', 'Ответ 2'] }],
  topicNames: { basics: 'Основы' }, answers: {}, currentIndex: 0
}`, onboardingContext);
onboardingContext.renderOnboardingQuestion();
const options = onboardingDom.window.document.getElementById('onboardingOptions');
assert.match(options.textContent, /<img src=x>/);
assert.equal(options.querySelector('img'), null);
assert.equal(options.querySelectorAll('[data-onclick]').length, 0);
assert.doesNotMatch(onboardingSource, /container\.innerHTML\s*=\s*cards/);
assert.doesNotMatch(onboardingSource, /onboardingOptions['"]\)\.innerHTML/);

console.log('Auth and onboarding DOM tests passed');
