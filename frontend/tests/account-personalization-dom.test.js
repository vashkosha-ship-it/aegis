'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { readGroup } = require('./helpers/module-source');

const frontend = path.resolve(__dirname, '..');
const dynamicStylesSource = fs.readFileSync(path.join(frontend, 'dynamic-styles.js'), 'utf8');
const source = readGroup('account');
const dom = new JSDOM(`
  <div class="settings-tabs">
    <button class="settings-tab" data-stab="personalization"></button>
  </div>
  <div id="settingsContent"></div>
`);
const icon = '<svg viewBox="0 0 10 10"></svg>';
const rules = [];
const sheet = {
  cssRules: rules,
  ownerNode: { hasAttribute: name => name === 'data-dynamic-stylesheet' },
  insertRule: (cssText, index) => rules.splice(index, 0, { cssText }),
};
Object.defineProperty(dom.window.document, 'styleSheets', { value: [sheet] });
const context = {
  accentRgba: (alpha = 1) => `rgba(255, 92, 31, ${alpha})`,
  getAppAccent: () => 'orange',
  setAppAccent: accent => { context.__accent = accent; },
  APP_ACCENTS: [{ id: 'orange', label: 'Оранжевый', swatch: '#ff5c1f' }, { id: 'blue', label: 'Синий', swatch: '#2f7bff' }],
  document: dom.window.document,
  Node: dom.window.Node,
  URL,
  location: { href: 'https://example.test/' },
  CSS: { supports: () => true },
  state: { currentUser: {}, currentScreen: 'settings' },
  ICONS: { themeMoon: icon, themeSun: icon },
  appendTrustedIcon: container => container.appendChild(dom.window.document.createElement('svg')),
  getAppTheme: () => 'dark',
  getGridSize: () => 3,
  getReadingGoal: () => 20,
  getBooksGoal: () => ({ count: 10, period: 'quarter' }),
  saveBooksGoalFromUI: () => {},
  localStorage: { getItem: () => '115', setItem: () => {} },
  console,
};
vm.createContext(context);
vm.runInContext(dynamicStylesSource, context);
vm.runInContext(source, context);

const content = dom.window.document.getElementById('settingsContent');
context.openSettingsTab('personalization');

assert.ok(dom.window.document.querySelector('[data-stab="personalization"]').classList.contains('active'));
assert.equal(content.querySelectorAll('.app-theme-btn').length, 2);
assert.equal(content.querySelectorAll('.app-theme-btn.active').length, 1);
assert.equal(content.querySelectorAll('#gridPreview > div').length, 6);
assert.equal(content.querySelector('#booksGoalCount').value, '10');
assert.equal(content.querySelectorAll('.bg-count-btn').length, 5);
assert.equal(content.querySelectorAll('.bg-period-btn').length, 3);
assert.equal(content.querySelectorAll('[data-onclick], [data-args]').length, 0);
assert.ok(content.querySelectorAll('[data-dynamic-style]').length >= 20);
// 23 прежних кнопки + по одной на каждый цвет акцента (в тесте их два).
assert.equal(content.querySelectorAll('button').length, 25);
const accentButtons = content.querySelectorAll('.accent-choice');
assert.equal(accentButtons.length, 2);
assert.equal(accentButtons[0].getAttribute('aria-checked'), 'true');
accentButtons[1].click();
assert.equal(context.__accent, 'blue');
assert.ok(rules.length >= 10);

const fragment = source.slice(
  source.indexOf('function renderSettingsPersonalizationTab'),
  source.indexOf('function setGridSize'),
);
assert.doesNotMatch(fragment, /innerHTML/);
assert.match(fragment, /replaceChildren/);
assert.equal((source.match(/\.innerHTML\s*=/g) || []).length, 0);

console.log('Account personalization DOM tests passed');
