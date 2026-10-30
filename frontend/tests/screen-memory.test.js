'use strict';

// Экран, открытая книга и поиск запоминаются; системная «назад» делает шаг
// внутри приложения, а не закрывает его.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');
const ids = ['auth', 'home', 'detail', 'reader', 'mylist', 'profile', 'assistant', 'settings', 'admin', 'training', 'onboarding'];
const dom = new JSDOM(
  ids.map(id => `<section id="${id}Screen"></section>`).join('')
    + '<nav id="bottomNav"></nav><aside id="sidebarNav"></aside><input id="searchInput">',
  { url: 'https://aegis.test/', runScripts: 'outside-only' },
);
const { window } = dom;
const calls = [];
window.state = {
  currentUser: { id: 7, role: 'user', is_approved: true },
  currentScreen: 'auth',
  books: [{ id: 5, title: 'Сети' }],
};
const noop = () => {};
window.scrollTo = noop;
for (const name of ['closeAIPanel', 'renderRecommendations', 'maybeStartOnboardingTour', 'renderMyList', 'initDragAndDrop',
  'renderTrainingScreen', 'renderProfile', 'updateProfileXpDisplay', 'renderAchievementsInProfile', 'renderHeatmap',
  'renderSkillsRadar', 'renderMyCertificates', 'renderSettingsScreen', 'renderAdminPanel', 'refreshPendingBadge',
  'updateFabVisibility', 'refreshAssistantAvailability']) window[name] = noop;
window.renderHome = () => calls.push('home');
window.clearFullTextSearch = () => { window.document.getElementById('searchInput').value = ''; calls.push('clear-search'); };
window.closeReader = () => { calls.push('close-reader'); window.navigateTo('home'); };
window.eval('var readerBookId = 5; var currentBookId = 5;');
window.eval(read('navigation.js').replace(/^'use strict';/m, ''));
window.openBookDetail = id => {
  window.state.currentBook = window.state.books.find(b => b.id === id);
  if (window.state.currentScreen !== 'detail') window.state._detailReturnTo = window.state.currentScreen;
  window.navigateTo('detail');
};
window.openReader = id => { window.state.currentBook = window.state.books.find(b => b.id === id); window.navigateTo('reader'); };

// Запоминаем экран, книгу, откуда пришли и строку поиска.
window.navigateTo('mylist');
window.document.getElementById('searchInput').value = 'сети';
window.openBookDetail(5);
const saved = JSON.parse(window.localStorage.getItem('aegis_ui_state_v1:7'));
assert.equal(saved.screen, 'detail');
assert.equal(saved.bookId, 5);
assert.equal(saved.returnTo, 'mylist');
assert.equal(saved.search, 'сети');

// «Перезагрузка»: восстанавливаемся туда же, поиск на месте.
window.state.currentScreen = 'auth';
window.document.getElementById('searchInput').value = '';
assert.equal(window.restoreUiState(), true);
assert.equal(window.state.currentScreen, 'detail');
assert.equal(window.state._detailReturnTo, 'mylist');
assert.equal(window.document.getElementById('searchInput').value, 'сети');

// Чужой аккаунт на том же устройстве не получает чужой экран.
window.state.currentUser = { id: 8, role: 'user', is_approved: true };
assert.equal(window.restoreUiState(), false);
window.state.currentUser = { id: 7, role: 'user', is_approved: true };

// Админку читатель не восстанавливает, даже если ключ подменили.
window.localStorage.setItem('aegis_ui_state_v1:7', JSON.stringify({ screen: 'admin', at: Date.now() }));
window.restoreUiState();
assert.equal(window.state.currentScreen, 'home');

// «Назад»: из книги — туда, откуда пришли; с главной с поиском — сброс поиска;
// с пустой главной — выход (false).
window.navigateTo('training');
window.openBookDetail(5);
assert.equal(window.handleAppBack(), true);
assert.equal(window.state.currentScreen, 'training');
assert.equal(window.handleAppBack(), true);
assert.equal(window.state.currentScreen, 'home');
window.document.getElementById('searchInput').value = 'xss';
assert.equal(window.handleAppBack(), true);
assert.ok(calls.includes('clear-search'));
assert.equal(window.handleAppBack(), false);
window.openReader(5);
assert.equal(window.handleAppBack(), true);
assert.ok(calls.includes('close-reader'));

// Открытое окно закрывается первым.
const overlay = window.document.createElement('div');
overlay.className = 'app-dialog-overlay';
window.document.body.appendChild(overlay);
window.navigateTo('profile');
assert.equal(window.handleAppBack(), true);
assert.equal(window.state.currentScreen, 'profile', 'сначала закрывается окно, экран остаётся');
assert.equal(window.document.querySelector('.app-dialog-overlay'), null);

// Окна, созданные на лету (оценка книги), тоже закрываются «назад»,
// а статичные окна из разметки прячутся, а не удаляются.
const finish = window.document.createElement('div');
finish.id = 'finishReviewModal';
window.document.body.appendChild(finish);
window.navigateTo('reader');
assert.equal(window.handleAppBack(), true);
assert.equal(window.document.getElementById('finishReviewModal'), null);
assert.equal(window.state.currentScreen, 'reader', 'сначала закрывается окно, читалка остаётся');
const staticModal = window.document.createElement('div');
staticModal.id = 'addModal';
staticModal.className = 'modal-overlay';
window.document.body.appendChild(staticModal);
assert.equal(window.handleAppBack(), true);
assert.ok(window.document.getElementById('addModal').classList.contains('hidden'));

// Подключение.
assert.match(read('index.html'), /data-onclick="goBackFromDetail\(\)"/);
assert.match(read('app.js'), /restoreUiState\(\)/);
assert.match(read('auth-ui.js'), /restoreUiState\(\)/);
console.log('screen memory: ok');
