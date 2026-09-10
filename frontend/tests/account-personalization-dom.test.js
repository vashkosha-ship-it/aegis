'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(frontend, 'account-settings.js'), 'utf8');
const dom = new JSDOM('<div id="settingsContent"></div>');
const icon = '<svg viewBox="0 0 10 10"></svg>';
const context = {
  document: dom.window.document,
  Node: dom.window.Node,
  state: { currentUser: {}, currentScreen: 'settings' },
  ICONS: { themeMoon: icon, themeSun: icon },
  appendTrustedIcon: container => container.appendChild(dom.window.document.createElement('svg')),
  dynamicStyleToken: css => 'test:' + css,
  getAppTheme: () => 'dark',
  getGridSize: () => 3,
  getReadingGoal: () => 20,
  getBooksGoal: () => ({ count: 10, period: 'quarter' }),
  saveBooksGoalFromUI: () => {},
  localStorage: { getItem: () => '115', setItem: () => {} },
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

const content = dom.window.document.getElementById('settingsContent');
context.renderSettingsPersonalizationTab(content);

assert.equal(content.querySelectorAll('.app-theme-btn').length, 2);
assert.equal(content.querySelectorAll('.app-theme-btn.active').length, 1);
assert.equal(content.querySelectorAll('#gridPreview > div').length, 6);
assert.equal(content.querySelector('#booksGoalCount').value, '10');
assert.equal(content.querySelectorAll('.bg-count-btn').length, 5);
assert.equal(content.querySelectorAll('.bg-period-btn').length, 3);
assert.equal(content.querySelectorAll('[data-onclick], [data-args]').length, 0);
assert.ok(content.querySelectorAll('[data-dynamic-style]').length >= 20);
assert.equal(content.querySelectorAll('button').length, 20);

const fragment = source.slice(
  source.indexOf('function renderSettingsPersonalizationTab'),
  source.indexOf('function setGridSize'),
);
assert.doesNotMatch(fragment, /innerHTML/);
assert.match(fragment, /replaceChildren/);
assert.equal((source.match(/\.innerHTML\s*=/g) || []).length, 0);

console.log('Account personalization DOM tests passed');
