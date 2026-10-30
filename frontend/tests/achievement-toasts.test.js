'use strict';

// Достижение объявляется один раз: ни повторный вход, ни пустой список «до»
// (вход без сети, сбой загрузки), ни два обновления подряд не показывают
// уведомление о давно полученном достижении снова.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8').replace(/^'use strict';/m, '');
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://aegis.test/', runScripts: 'outside-only' });
const { window } = dom;
const toasts = [];
let owned = [{ code: 'first_book', name: 'Первая книга' }];
window.showToast = text => toasts.push(text);
window.eval(`var state = { currentUser: { id: 7 }, currentScreen: 'home', gamification: { achievementsOwned: [] } };`);
window.api = {
  isAuthBootstrapPending: () => false,
  me: async () => ({ xp: 10, streak_count: 1 }),
  library: { myAchievements: async () => owned.slice(), allAchievements: async () => [] },
};
window.eval(read('offline-library.js'));
window.eval(read('user-features.js'));

(async () => {
  // Вход: уже полученное запоминается без уведомления.
  await window.loadGamificationFromApi();
  assert.deepEqual(toasts, []);

  // Список «до» пуст (как после входа без сети) — старое не объявляется.
  window.state.gamification.achievementsOwned = [];
  await window.refreshGamificationFromApi();
  assert.deepEqual(toasts, []);

  // Новое достижение — одно уведомление, даже при двух обновлениях подряд.
  owned = [...owned, { code: 'quiz_perfect', name: 'Отличник' }];
  await Promise.all([window.refreshGamificationFromApi(), window.refreshGamificationFromApi()]);
  assert.deepEqual(toasts, ['Достижение получено: Отличник!']);

  // Выход и повторный вход на том же устройстве — тишина.
  window.state.gamification.achievementsOwned = [];
  await window.loadGamificationFromApi();
  await window.refreshGamificationFromApi();
  assert.equal(toasts.length, 1);

  // Другой аккаунт на том же устройстве — свой список, его старое тоже не объявляется.
  window.state.currentUser = { id: 8 };
  owned = [{ code: 'first_book', name: 'Первая книга' }];
  await window.loadGamificationFromApi();
  await window.refreshGamificationFromApi();
  assert.equal(toasts.length, 1);
  console.log('achievement toasts: ok');
})().catch(error => { console.error(error); process.exit(1); });
