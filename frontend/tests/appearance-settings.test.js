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
  ['aegis_app_accent', 'violet'],
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
    removeItem(key) { stored.delete(key); },
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
// Сохранённый цвет акцента применяется при запуске, неизвестный — сбрасывается на синий.
assert.equal(attributes.get('data-accent'), 'violet');
context.applyAppAccent('pink');
assert.equal(attributes.get('data-accent'), 'blue');
assert.equal(stored.get('aegis_app_accent'), 'blue');
context.setAppAccent('green');
assert.equal(attributes.get('data-accent'), 'green');
assert.match(toasts.pop(), /зелёный/);
assert.equal(context.accentRgba(0.5), 'rgba(47, 123, 255, 0.5)');
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
assert.match(swSource, /const CACHE_NAME = 'aegis-cache-v\d+'/);
assert.match(swSource, /'\/appearance-settings\.js'/);

// Оранжевый, сохранённый прежним умолчанием, один раз сбрасывается на синий;
// выбранный после этого оранжевый остаётся.
function runWith(entries) {
  const store = new Map(entries);
  const attrs = new Map();
  vm.runInContext(source, vm.createContext({
    showToast() {},
    localStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, value),
      removeItem: key => store.delete(key),
    },
    document: {
      documentElement: { style: { setProperty() {} }, setAttribute: (n, v) => attrs.set(n, v) },
      getElementById: () => null,
    },
  }));
  return { accent: attrs.get('data-accent'), store };
}
let run = runWith([['aegis_app_accent', 'orange']]);
assert.equal(run.accent, 'blue');
assert.equal(run.store.get('aegis_accent_default_blue'), '1');
run = runWith([['aegis_app_accent', 'orange'], ['aegis_accent_default_blue', '1']]);
assert.equal(run.accent, 'orange');
run = runWith([['aegis_app_accent', 'green']]);
assert.equal(run.accent, 'green');
assert.equal(runWith([]).accent, 'blue');
assert.match(indexSource, /<html lang="ru" data-accent="blue">/);

console.log('Appearance settings tests passed');
