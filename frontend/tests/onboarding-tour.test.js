'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'onboarding-tour.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM(`
  <body>
    <button class="nav-item" data-screen="home">Главная</button>
    <button class="nav-item" data-screen="training">Тестирование</button>
    <button id="btnOpenAssistant">Ассистент</button>
    <button class="nav-item" data-screen="profile">Профиль</button>
  </body>
`, { url: 'https://example.test/' });

const rects = [
  { top: 700, left: 10, width: 70, height: 50, bottom: 750 },
  { top: 700, left: 90, width: 70, height: 50, bottom: 750 },
  { top: 20, left: 170, width: 70, height: 50, bottom: 70 },
  { top: 700, left: 250, width: 70, height: 50, bottom: 750 },
];
dom.window.document.querySelectorAll('button').forEach((element, index) => {
  element.getBoundingClientRect = () => rects[index];
});
Object.defineProperty(dom.window, 'innerHeight', { value: 800 });

const navigated = [];
const context = {
  document: dom.window.document,
  window: dom.window,
  localStorage: dom.window.localStorage,
  state: { currentScreen: 'home' },
  navigateTo: screen => navigated.push(screen),
  setTimeout: callback => {
    callback();
    return 1;
  },
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

context.startOnboardingTour();
let overlay = dom.window.document.getElementById('tourOverlay');
assert.ok(overlay);
assert.equal(overlay.getAttribute('role'), 'dialog');
assert.equal(overlay.querySelector('.tour-title').textContent, 'Библиотека');
assert.equal(overlay.querySelectorAll('.tour-dot').length, 4);
assert.equal(overlay.querySelectorAll('script, img').length, 0);

const expectedTitles = ['Тестирование', 'AI-ассистент', 'Профиль и AR-схемы'];
for (const title of expectedTitles) {
  overlay.querySelector('.tour-button--next').click();
  overlay = dom.window.document.getElementById('tourOverlay');
  assert.equal(overlay.querySelector('.tour-title').textContent, title);
}
overlay.querySelector('.tour-button--next').click();
assert.equal(dom.window.document.getElementById('tourOverlay'), null);
assert.equal(dom.window.localStorage.getItem('aegis_tour_done'), '1');

context.replayOnboardingTour();
assert.deepEqual(navigated, ['home']);
assert.ok(dom.window.document.getElementById('tourOverlay'));

assert.doesNotMatch(source, /\.innerHTML\s*=|style\.cssText/);
assert.doesNotMatch(appSource, /const ONBOARDING_TOUR_STEPS|function startOnboardingTour/);
assert.ok(indexSource.indexOf('onboarding-tour.js') < indexSource.indexOf('app.js'));
assert.match(workerSource, /const CACHE_NAME = 'aegis-cache-v\d+'/);
assert.match(workerSource, /['"]\/onboarding-tour\.js['"]/);

console.log('onboarding tour tests passed');
