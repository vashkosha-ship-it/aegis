'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontendDir = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(frontendDir, 'core-utils.js'), 'utf8');
const appSource = fs.readFileSync(path.join(frontendDir, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');
const swSource = fs.readFileSync(path.join(frontendDir, 'sw.js'), 'utf8');

const dom = new JSDOM('<div id="particlesContainer"></div><div id="messageTarget"><b>old</b></div><select id="selectTarget"></select>');
const context = vm.createContext({
  document: dom.window.document,
  Date,
  Math,
  ICONS: { book: '<svg>book</svg>' },
});

vm.runInContext(source, context);

assert.equal(dom.window.document.querySelectorAll('#particlesContainer .particle').length, 15);
assert.equal(vm.runInContext('icon("book")', context), '<svg>book</svg>');
assert.equal(vm.runInContext('icon("missing")', context), '');
assert.equal(vm.runInContext('eh("<img src=x onerror=alert(1)>")', context), '&lt;img src=x onerror=alert(1)&gt;');
assert.equal(
  vm.runInContext('bookCategoriesText({ categories: ["Security", "<script>"] })', context),
  'Security, &lt;script&gt;',
);
assert.equal(vm.runInContext('bookCategoriesText({ categories: [] })', context), 'Без категории');

vm.runInContext(
  `replaceWithStaticText(document.getElementById('messageTarget'), '<img src=x onerror=alert(1)>', 'a130', 'span')`,
  context,
);
const message = dom.window.document.querySelector('#messageTarget > span');
assert.equal(message.textContent, '<img src=x onerror=alert(1)>');
assert.equal(message.getAttribute('data-static-style'), 'a130');
assert.equal(message.querySelector('img'), null);

vm.runInContext(
  `replaceSelectOptions(document.getElementById('selectTarget'), [{ value: '1"><img src=x>', label: '<Book>' }])`,
  context,
);
const option = dom.window.document.querySelector('#selectTarget option');
assert.equal(option.value, '1"><img src=x>');
assert.equal(option.textContent, '<Book>');
assert.equal(option.querySelector('img'), null);

const today = vm.runInContext('getTodayISO()', context);
const yesterday = vm.runInContext('getYesterdayISO()', context);
assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(Date.parse(today) - Date.parse(yesterday), 86400000);

assert.doesNotMatch(appSource, /function eh\(|function bookCategoriesText|function createParticles/);
assert.ok(
  indexSource.indexOf('src="core-utils.js"') < indexSource.indexOf('src="app.js"'),
  'core-utils.js должен подключаться раньше app.js',
);
assert.match(swSource, /const CACHE_NAME = 'aegis-cache-v\d+'/);
assert.match(swSource, /'\/core-utils\.js'/);

console.log('Core utilities tests passed');
