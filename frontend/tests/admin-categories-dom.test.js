'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'admin-screens.js'), 'utf8');
const dom = new JSDOM(`
  <div id="categories"></div><div id="adminRecommendDepts"></div>
  <div id="bulkUploadList"></div><div id="bulkUploadActions"></div>
  <div id="bulkUploadCategoryPanel"></div><div id="bulkUploadProgress"></div>
  <button id="adminSaveFieldsBtn"></button><button id="adminUploadFileBtn"></button>
  <button id="adminDeleteFileBtn"></button><button id="adminUploadCoverBtn"></button>
  <button id="adminDeleteCoverBtn"></button><button id="adminDeleteBookBtn"></button>
  <button id="saveBookBtn"></button>
`);
const requiredCalls = [];
const context = {
  document: dom.window.document,
  console,
  DEPARTMENT_TOPICS: { SOC: ['security'] },
  replaceWithStaticText: () => {},
  dynamicStyleToken: (parts, ...values) => parts.reduce((out, part, index) => out + part + (values[index] ?? ''), ''),
  api: { books: { categories: async () => ['Safe', '<img src=x onerror=alert(1)>'] } },
  showToast: () => {},
};
vm.createContext(context);
vm.runInContext(source, context);
context.markRequiredForDept = (...args) => requiredCalls.push(args);

context.initCategoryTags('categories', ['<script>alert(1)</script>']);
const categoryContainer = dom.window.document.getElementById('categories');
assert.equal(categoryContainer.querySelector('script'), null);
assert.match(categoryContainer.textContent, /<script>alert\(1\)<\/script>/);
categoryContainer.querySelector('.cat-tag-chip-x').click();
assert.equal(categoryContainer.querySelector('.cat-tag-chip'), null);

(async () => {
  await context.showCategorySuggestions('categories', '<img');
  const suggestion = categoryContainer.querySelector('.cat-tag-suggestion-item');
  assert.equal(suggestion.dataset.name, '<img src=x onerror=alert(1)>');
  assert.equal(categoryContainer.querySelector('img'), null);

  context.renderRecommendDepts({ id: '<img>', title: 'Security', description: '', categories: [] });
  const dept = dom.window.document.getElementById('adminRecommendDepts');
  assert.equal(dept.querySelector('img, script'), null);
  dept.querySelector('button').click();
  assert.deepEqual(requiredCalls[0].slice(0, 2), ['<img>', 'SOC']);

  vm.runInContext(`bulkUploadQueue = [{
    file: { name: '<img src=x onerror=alert(1)>.pdf' },
    status: 'error',
    message: '<script>alert(1)</script>'
  }]`, context);
  context.renderBulkUploadList();
  const list = dom.window.document.getElementById('bulkUploadList');
  assert.equal(list.querySelector('img, script'), null);
  assert.match(list.textContent, /<img src=x/);
  assert.match(list.textContent, /<script>alert\(1\)<\/script>/);
  assert.equal(dom.window.document.getElementById('bulkUploadProgress').textContent, '0 / 1 (ошибок: 1)');

  assert.doesNotMatch(source, /safeTag/);
  assert.doesNotMatch(source, /suggestionsBox\.innerHTML/);
  assert.doesNotMatch(source, /listEl\.innerHTML/);
  console.log('admin category and bulk DOM tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
