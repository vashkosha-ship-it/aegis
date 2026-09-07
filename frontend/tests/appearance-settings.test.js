'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontendDir = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(frontendDir, 'appearance-settings.js'), 'utf8');
const appSource = fs.readFileSync(path.join(frontendDir, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');
const swSource = fs.readFileSync(path.join(frontendDir, 'sw.js'), 'utf8');

const stored = new Map([
  ['aegis_app_theme', 'light'],
  ['aegis_grid_size', '4'],
]);
const cssProperties = new Map();
const attributes = new Map();
const toasts = [];

function classList() {
  const values = new Set();
  return {
    contains: (name) => values.has(name),
    toggle(name, force) {
      if (force) values.add(name);
      else values.delete(name);
    },
  };
}

const darkButton = { classList: classList() };
const lightButton = { classList: classList() };
const context = vm.createContext({
  showToast(message) { toasts.push(message); },
  localStorage: {
    getItem(key) { return stored.get(key) ?? null; },
    setItem(key, value) { stored.set(key, value); },
  },
  document: {
    documentElement: {
      style: { setProperty(name, value) { cssProperties.set(name, value); } },
      setAttribute(name, value) { attributes.set(name, value); },
    },
    getElementById(id) {
      if (id === 'appThemeBtnDark') return darkButton;
      if (id === 'appThemeBtnLight') return lightButton;
      return null;
    },
  },
});

vm.runInContext(source, context);

assert.equal(cssProperties.get('--books-grid-columns'), '4');
assert.equal(attributes.get('data-theme'), 'light');
assert.equal(lightButton.classList.contains('active'), true);
assert.equal(darkButton.classList.contains('active'), false);

vm.runInContext('applyGridSize(99); setAppTheme("invalid")', context);
assert.equal(stored.get('aegis_grid_size'), '2', 'Некорректный размер сетки должен нормализоваться');
assert.equal(stored.get('aegis_app_theme'), 'dark', 'Некорректная тема должна нормализоваться');
assert.deepEqual(toasts, ['Тёмная тема']);

assert.doesNotMatch(appSource, /const APP_THEME_KEY|function applyAppTheme|function applyGridSize/);
assert.ok(
  indexSource.indexOf('src="appearance-settings.js"') < indexSource.indexOf('src="app.js"'),
  'appearance-settings.js должен подключаться раньше app.js',
);
assert.match(swSource, /const CACHE_NAME = 'aegis-cache-v207'/);
assert.match(swSource, /'\/appearance-settings\.js'/);

console.log('Appearance settings tests passed');
