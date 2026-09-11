'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'navigation.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const ids = ['auth', 'home', 'detail', 'reader', 'mylist', 'profile', 'assistant', 'settings', 'admin', 'training', 'onboarding'];
const html = ids.map(id => `<section id="${id}Screen"></section>`).join('') +
  '<nav id="bottomNav" class="hidden"></nav><aside id="sidebarNav" class="hidden-on-auth"></aside>' +
  '<button class="nav-item" data-screen="home"></button><button class="sidebar-item" data-screen="profile"></button>' +
  '<div id="fabSuperContainer"></div>';
const dom = new JSDOM(html);
const calls = [];
const mark = name => () => calls.push(name);
const context = {
  replaceWithAppMarkup(target, markup) { target.innerHTML = markup; },
  document: dom.window.document,
  state: { currentUser: { role: 'user', is_approved: true }, currentScreen: 'auth' },
  currentBookId: null,
  showPendingApprovalScreen: mark('pending'),
  closeAIPanel: mark('close-ai'),
  renderHome: mark('home'),
  renderRecommendations: mark('recommendations'),
  maybeStartOnboardingTour: mark('tour'),
  renderMyList: mark('mylist'),
  initDragAndDrop: mark('drag'),
  renderTrainingScreen: mark('training'),
  renderProfile: mark('profile'),
  updateProfileXpDisplay: mark('xp'),
  renderAchievementsInProfile: mark('achievements'),
  renderHeatmap: mark('heatmap'),
  renderSkillsRadar: mark('radar'),
  renderMyCertificates: mark('certificates'),
  renderSettingsScreen: mark('settings'),
  renderAssistantScreen: mark('assistant'),
  renderAdminPanel: mark('admin'),
  refreshPendingBadge: mark('badge'),
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

context.navigateTo('home');
assert.equal(context.state.currentScreen, 'home');
assert.ok(dom.window.document.getElementById('homeScreen').classList.contains('active'));
assert.ok(!dom.window.document.getElementById('bottomNav').classList.contains('hidden'));
assert.deepEqual(calls.slice(-4), ['close-ai', 'home', 'recommendations', 'tour']);

context.navigateTo('auth');
assert.ok(dom.window.document.getElementById('bottomNav').classList.contains('hidden'));
assert.ok(dom.window.document.body.classList.contains('reader-active') === false);

context.state.currentUser.is_approved = false;
context.navigateTo('profile');
assert.equal(calls.at(-1), 'pending');
assert.equal(context.state.currentScreen, 'auth');

context.state.currentUser = { role: 'admin', is_approved: true };
context.navigateTo('home');
assert.ok(dom.window.document.getElementById('fabSuperContainer').classList.contains('visible'));

context.navigateTo('reader');
const stub = dom.window.document.getElementById('readerEmptyStub');
assert.ok(stub);
assert.match(stub.innerHTML, /navigateTo\('home'\)/);
context.hideReaderEmptyStub();
assert.equal(stub.style.display, 'none');

assert.doesNotMatch(appSource, /function navigateTo|function ensureReaderHasBook|const SCREEN_IDS/);
assert.ok(indexSource.indexOf('navigation.js') < indexSource.indexOf('app.js'));
assert.match(workerSource, /['"]\/navigation\.js['"]/);
console.log('Navigation tests passed');
