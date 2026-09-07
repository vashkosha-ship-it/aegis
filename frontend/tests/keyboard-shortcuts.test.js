'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontendDir = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(frontendDir, 'keyboard-shortcuts.js'), 'utf8');
const appSource = fs.readFileSync(path.join(frontendDir, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');
const swSource = fs.readFileSync(path.join(frontendDir, 'sw.js'), 'utf8');

const dom = new JSDOM(`
  <div id="selectionToolbar"></div>
  <div id="shortcutsModal"></div>
  <div id="shortcutsOverlay"></div>
  <input id="searchInput">
  <div class="note-tooltip"></div>
`);
const calls = [];
const record = name => (...args) => calls.push([name, ...args]);
const context = vm.createContext({
  document: dom.window.document,
  state: { currentScreen: 'home' },
  arActive: false,
  closeReader: record('closeReader'),
  navigateTo: record('navigateTo'),
  toggleAIPanel: record('toggleAIPanel'),
  goToPrevPage: record('goToPrevPage'),
  goToNextPage: record('goToNextPage'),
  togglePomodoro: record('togglePomodoro'),
  exportNotes: record('exportNotes'),
  closeAIPanel: record('closeAIPanel'),
  closeCatalogPanel: record('closeCatalogPanel'),
  closeAR: record('closeAR'),
  setTimeout: callback => {
    callback();
    return 1;
  },
});
vm.runInContext(source, context);

function press(key, options = {}) {
  const event = new dom.window.KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  dom.window.document.dispatchEvent(event);
  return event;
}

press('h', { altKey: true });
assert.deepEqual(calls.pop(), ['navigateTo', 'home']);

context.state.currentScreen = 'reader';
press('k', { ctrlKey: true });
assert.deepEqual(calls.splice(-2), [
  ['closeReader'],
  ['navigateTo', 'home'],
]);
assert.equal(dom.window.document.activeElement.id, 'searchInput');

press('ArrowRight');
assert.deepEqual(calls.pop(), ['goToNextPage']);
press('ArrowLeft');
assert.deepEqual(calls.pop(), ['goToPrevPage']);
press('p');
assert.deepEqual(calls.pop(), ['togglePomodoro']);

press('Escape');
assert.equal(dom.window.document.querySelector('.note-tooltip'), null);
assert.equal(dom.window.document.getElementById('selectionToolbar').style.display, 'none');
assert.ok(calls.some(call => call[0] === 'closeAIPanel'));
assert.ok(calls.some(call => call[0] === 'closeCatalogPanel'));

context.state.currentScreen = 'home';
press('?');
assert.ok(dom.window.document.getElementById('shortcutsModal').classList.contains('show'));
assert.ok(dom.window.document.getElementById('shortcutsOverlay').classList.contains('show'));
press('?');
assert.ok(!dom.window.document.getElementById('shortcutsModal').classList.contains('show'));
assert.ok(!dom.window.document.getElementById('shortcutsOverlay').classList.contains('show'));

assert.doesNotMatch(appSource, /function (open|close)ShortcutsModal|function openCommandPalette/);
assert.match(source, /function openCommandPalette/);
assert.ok(
  indexSource.indexOf('src="keyboard-shortcuts.js"') < indexSource.indexOf('src="app.js"'),
  'keyboard-shortcuts.js должен подключаться раньше app.js',
);
assert.match(swSource, /const CACHE_NAME = 'aegis-cache-v\d+'/);
assert.match(swSource, /'\/keyboard-shortcuts\.js'/);

console.log('Keyboard shortcuts tests passed');
