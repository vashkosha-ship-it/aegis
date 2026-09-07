'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontendDir = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(frontendDir, 'loading-ui.js'), 'utf8');
const appSource = fs.readFileSync(path.join(frontendDir, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');
const swSource = fs.readFileSync(path.join(frontendDir, 'sw.js'), 'utf8');

const containers = {
  cards: { innerHTML: '' },
  list: { innerHTML: '' },
};
const context = vm.createContext({
  document: {
    getElementById(id) { return containers[id] || null; },
  },
});

vm.runInContext(source, context);

const defaultSpinner = vm.runInContext('loadingSpinnerHTML()', context);
assert.match(defaultSpinner, /Загрузка…/);
assert.match(vm.runInContext('loadingSpinnerHTML("Готовим тест…")', context), /Готовим тест…/);

vm.runInContext('showSkeleton("cards", 2)', context);
assert.equal((containers.cards.innerHTML.match(/skeleton-card/g) || []).length, 2);

vm.runInContext('showListSkeleton("list", 3)', context);
assert.equal((containers.list.innerHTML.match(/skeleton-list-item/g) || []).length, 3);

assert.doesNotThrow(() => vm.runInContext('showSkeleton("missing")', context));
assert.doesNotMatch(appSource, /function loadingSpinnerHTML|function showSkeleton|function showListSkeleton/);
assert.ok(
  indexSource.indexOf('src="loading-ui.js"') < indexSource.indexOf('src="app.js"'),
  'loading-ui.js должен подключаться раньше app.js',
);
assert.match(swSource, /const CACHE_NAME = 'aegis-cache-v206'/);
assert.match(swSource, /'\/loading-ui\.js'/);

console.log('Loading UI tests passed');
