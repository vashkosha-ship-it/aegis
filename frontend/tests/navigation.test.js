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
const browserWindow = {
  scrollY: 0,
  scrollTo(options) {
    this.scrollY = options.top;
    calls.push('scroll:' + options.top);
  },
};
const mark = name => () => calls.push(name);
const context = {
  replaceWithAppMarkup(target, markup) { target.innerHTML = markup; },
  document: dom.window.document,
  window: browserWindow,
  requestAnimationFrame(callback) { callback(); return 1; },
  setTimeout(callback) { callback(); return 1; },
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
  renderLevelChoices: mark('levels'),
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
assert.deepEqual(calls.slice(-5), ['close-ai', 'home', 'recommendations', 'tour', 'scroll:0']);
assert.equal(browserWindow.scrollY, 0);

browserWindow.scrollY = 640;
context.navigateTo('detail');
assert.equal(browserWindow.scrollY, 0, 'new detail screen starts at its header');
context.navigateTo('home');
assert.equal(browserWindow.scrollY, 640, 'catalog position is restored on return');

context.navigateTo('auth');
assert.ok(dom.window.document.getElementById('bottomNav').classList.contains('hidden'));
assert.ok(dom.window.document.body.classList.contains('reader-active') === false);

context.state.currentUser.is_approved = false;
context.navigateTo('profile');
assert.equal(calls.at(-1), 'pending');
assert.equal(context.state.currentScreen, 'auth');

context.state.currentUser = { role: 'admin', is_approved: true };
// Экран уровня всегда показывает карточки выбора и тест — раньше вход из
// профиля и после регистрации давал пустой экран.
const callsBeforeOnboarding = calls.length;
context.navigateTo('onboarding');
assert.ok(calls.slice(callsBeforeOnboarding).includes('levels'));
context.navigateTo('home');
assert.ok(dom.window.document.getElementById('fabSuperContainer').classList.contains('visible'));

context.navigateTo('reader');
const stub = dom.window.document.getElementById('readerEmptyStub');
assert.ok(stub);
assert.match(stub.innerHTML, /navigateTo\('home'\)/);
assert.ok(dom.window.document.getElementById('readerScreen').classList.contains('reader-empty'));
context.hideReaderEmptyStub();
assert.equal(stub.style.display, 'none');
assert.ok(!dom.window.document.getElementById('readerScreen').classList.contains('reader-empty'));

// После перезагрузки открытой книги нет, но начатые есть: «Читаю» открывает
// последнюю недочитанную, а не говорит «Вы ещё не начали читать».
const opened = [];
context.openReader = id => opened.push(id);
context.getResumeHidden = () => [3];
context.state.books = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
context.state.readingProgress = {
  1: { started: true, currentPage: 5, totalPages: 100, lastReadAt: '2026-10-01T10:00:00Z' },
  2: { started: true, currentPage: 9, totalPages: 50, lastReadAt: '2026-10-20T10:00:00Z' },
  3: { started: true, currentPage: 2, totalPages: 50, lastReadAt: '2026-10-22T10:00:00Z' },
  4: { started: true, currentPage: 80, totalPages: 80, lastReadAt: '2026-10-23T10:00:00Z' },
};
context.navigateTo('reader');
assert.deepEqual(opened, [2], 'hidden (3) and finished (4) books are skipped');

assert.doesNotMatch(appSource, /function navigateTo|function ensureReaderHasBook|const SCREEN_IDS/);
assert.ok(indexSource.indexOf('navigation.js') < indexSource.indexOf('app.js'));
assert.match(workerSource, /['"]\/navigation\.js['"]/);
assert.match(source, /SCREENS_WITH_RESTORED_SCROLL/);
console.log('Navigation tests passed');
