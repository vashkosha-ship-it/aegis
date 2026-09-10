'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'profile-screen.js'), 'utf8');
const coreSource = fs.readFileSync(path.join(FRONTEND, 'core-utils.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM(`
  <section id="profileHeader"><h1 id="profileDisplayName"></h1><span id="profileRoleTag"></span></section>
  <div id="profileTestSlot"></div>
  <span id="statBooks"></span><span id="statBookmarks"></span>
  <span id="statAchievements"></span><span id="statStreak"></span>
  <span id="profileAvatarText"></span><img id="profileAvatarImg">
  <button id="appThemeBtnDark"></button><button id="appThemeBtnLight"></button>
  <button id="btnOpenSettings"></button><span id="profileStarIcon"></span>
  <span id="statStreakFlame"></span>
  <div id="onboardingResult"></div><div id="onboardingQuiz"></div>
  <div id="onboardingWelcome" class="hidden"></div>
`);
const state = {
  currentUser: {
    id: 7,
    name: 'reader',
    full_name: 'Reader Name',
    role: 'user',
    department: 'Security',
    cyber_level: null,
    has_avatar: false,
  },
  books: [{ id: 1 }, { id: 2 }],
  mylist: { 1: 'reading' },
  gamification: { achievementsOwned: ['first'] },
};
const calls = [];
const context = {
  document: dom.window.document,
  DOMParser: dom.window.DOMParser,
  state,
  ICONS: {
    target: '<svg data-icon="target"></svg>', fire: '<svg data-icon="fire"></svg>',
    themeMoon: '<svg data-icon="moon"></svg>', themeSun: '<svg data-icon="sun"></svg>',
    settingsGear: '<svg data-icon="gear"></svg>', iconStar: '<svg data-icon="star"></svg>',
    iconFlame: '<svg data-icon="flame"></svg>',
  },
  api: { users: { avatarUrl: id => `/users/${id}/avatar` } },
  eh: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  getCyberLevelInfo: () => ({ icon: 'shield', name: '<Advanced>' }),
  openCyberLevelModal: () => calls.push('level-modal'),
  navigateTo: screen => calls.push(['navigate', screen]),
  getStreak: () => 12,
  updateProfileXpDisplay: () => calls.push('xp'),
  renderAchievementsInProfile: () => calls.push('achievements'),
  renderHeatmap: () => calls.push('heatmap'),
  renderSkillsRadar: () => calls.push('radar'),
  renderOfflineBooks: () => calls.push('offline'),
  applyAppTheme: theme => calls.push(['theme', theme]),
  getAppTheme: () => 'dark',
  Date: { now: () => 123 },
};
vm.createContext(context);
vm.runInContext(coreSource, context);
vm.runInContext(source, context);

context.renderProfile();
assert.equal(dom.window.document.getElementById('profileDisplayName').textContent, 'Reader Name');
assert.equal(dom.window.document.getElementById('profileUsernameLine').textContent, '@reader');
assert.equal(dom.window.document.getElementById('profileDepartmentLine').textContent, 'Security');
assert.equal(dom.window.document.getElementById('profileRoleTag').textContent, 'Читатель');
assert.match(dom.window.document.getElementById('profileTakeQuizBtn').textContent, /Пройти тест уровня/);
assert.equal(dom.window.document.getElementById('statBooks').textContent, '2');
assert.equal(dom.window.document.getElementById('statBookmarks').textContent, '1');
assert.equal(dom.window.document.getElementById('statAchievements').textContent, '1');
assert.match(dom.window.document.getElementById('statStreak').textContent, /12/);
assert.equal(dom.window.document.getElementById('profileAvatarText').textContent, 'R');
assert.ok(calls.includes('xp') && calls.includes('offline'));
assert.deepEqual(calls.at(-1), ['theme', 'dark']);
assert.equal(dom.window.document.querySelector('#btnOpenSettings svg').getAttribute('data-icon'), 'gear');

dom.window.document.getElementById('profileTakeQuizBtn').click();
assert.ok(calls.some(call => Array.isArray(call) && call[1] === 'onboarding'));
assert.ok(!dom.window.document.getElementById('onboardingWelcome').classList.contains('hidden'));

state.currentUser = {
  id: 8,
  name: 'admin',
  full_name: '',
  role: 'admin',
  department: null,
  cyber_level: 'advanced',
  has_avatar: true,
};
context.renderProfile();
assert.equal(dom.window.document.getElementById('profileDisplayName').textContent, 'admin');
assert.equal(dom.window.document.getElementById('profileRoleTag').textContent, 'Администратор');
assert.equal(dom.window.document.getElementById('profileDepartmentLine'), null);
const badge = dom.window.document.getElementById('cyberLevelBadge');
assert.ok(badge);
assert.match(badge.textContent, /<Advanced>/);
assert.doesNotMatch(badge.innerHTML, /<Advanced>/);
assert.equal(badge.querySelector('img, script'), null);
assert.equal(dom.window.document.getElementById('profileTakeQuizBtn').style.display, 'none');
assert.equal(dom.window.document.getElementById('profileAvatarImg').style.display, 'block');
assert.equal(dom.window.document.getElementById('profileAvatarImg').src.endsWith('/users/8/avatar?t=123'), true);

state.currentUser = null;
const before = dom.window.document.getElementById('profileDisplayName').textContent;
context.renderProfile();
assert.equal(dom.window.document.getElementById('profileDisplayName').textContent, before);

assert.doesNotMatch(appSource, /function renderProfile/);
assert.doesNotMatch(source, /\.innerHTML\s*=/);
assert.ok(indexSource.indexOf('profile-screen.js') < indexSource.indexOf('app.js'));
assert.match(workerSource, /['"]\/profile-screen\.js['"]/);
assert.match(workerSource, /aegis-cache-v[0-9]+/);
console.log('Profile screen tests passed');
