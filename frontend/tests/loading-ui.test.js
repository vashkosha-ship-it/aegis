'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontendDir = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(frontendDir, 'loading-ui.js'), 'utf8');
const appSource = fs.readFileSync(path.join(frontendDir, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');
const swSource = fs.readFileSync(path.join(frontendDir, 'sw.js'), 'utf8');

const dom = new JSDOM('<div id="spinner"></div><div id="cards"></div><div id="list"></div>');
const context = vm.createContext({
  document: dom.window.document,
});

vm.runInContext(source, context);

const defaultSpinner = vm.runInContext('loadingSpinnerHTML()', context);
assert.match(defaultSpinner, /Загрузка…/);
assert.match(vm.runInContext('loadingSpinnerHTML("Готовим тест…")', context), /Готовим тест…/);
vm.runInContext('renderLoadingSpinner(document.getElementById("spinner"), "Готовим тест…")', context);
assert.equal(dom.window.document.querySelector('#spinner .aegis-spinner').className, 'aegis-spinner');
assert.equal(dom.window.document.querySelector('#spinner [data-static-style="a003"]').textContent, 'Готовим тест…');

vm.runInContext('showSkeleton("cards", 2)', context);
assert.equal(dom.window.document.querySelectorAll('#cards .skeleton-card').length, 2);

vm.runInContext('showListSkeleton("list", 3)', context);
assert.equal(dom.window.document.querySelectorAll('#list .skeleton-list-item').length, 3);
assert.doesNotMatch(source, /\.innerHTML\s*=/);

assert.doesNotThrow(() => vm.runInContext('showSkeleton("missing")', context));
assert.doesNotMatch(appSource, /function loadingSpinnerHTML|function renderLoadingSpinner|function showSkeleton|function showListSkeleton/);
assert.ok(
  indexSource.indexOf('src="loading-ui.js"') < indexSource.indexOf('src="app.js"'),
  'loading-ui.js должен подключаться раньше app.js',
);
assert.match(swSource, /const CACHE_NAME = 'aegis-cache-v\d+'/);
assert.match(swSource, /'\/loading-ui\.js'/);

console.log('Loading UI tests passed');
