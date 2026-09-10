'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const adminSource = fs.readFileSync(path.join(frontend, 'admin-screens.js'), 'utf8');
const userSource = fs.readFileSync(path.join(frontend, 'user-features.js'), 'utf8');

function replaceSelectOptions(document, select, items) {
  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    const normalized = typeof item === 'object' ? item : { value: item, label: item };
    const option = document.createElement('option');
    option.value = String(normalized.value ?? '');
    option.textContent = String(normalized.label ?? normalized.value ?? '');
    option.selected = Boolean(normalized.selected);
    fragment.appendChild(option);
  });
  select.replaceChildren(fragment);
}

(async () => {
  const categoryDom = new JSDOM(`
    <select id="newCategorySelect" multiple></select>
    <select id="adminEditCategorySelect" multiple></select>
    <button id="adminSaveFieldsBtn"></button>
    <button id="adminUploadFileBtn"></button>
    <button id="adminDeleteFileBtn"></button>
    <button id="adminUploadCoverBtn"></button>
    <button id="adminDeleteCoverBtn"></button>
    <button id="adminDeleteBookBtn"></button>
    <button id="saveBookBtn"></button>
  `);
  const categories = ['SOC', '"><img src=x onerror=alert(1)>'];
  const adminContext = {
    document: categoryDom.window.document,
    api: { books: { categories: async () => categories } },
    replaceSelectOptions: (select, items) => replaceSelectOptions(categoryDom.window.document, select, items),
    console,
  };
  vm.createContext(adminContext);
  vm.runInContext(adminSource, adminContext);
  await adminContext.populateNewCategoriesSelect();
  await adminContext.populateAdminCategoriesSelect([categories[1]]);

  const newSelect = categoryDom.window.document.getElementById('newCategorySelect');
  const editSelect = categoryDom.window.document.getElementById('adminEditCategorySelect');
  assert.equal(newSelect.options.length, 2);
  assert.equal(newSelect.options[1].value, categories[1]);
  assert.equal(newSelect.querySelector('img'), null);
  assert.equal(editSelect.options[1].selected, true);

  const certDom = new JSDOM('<div id="certMineList"></div>');
  const certContext = {
    document: certDom.window.document,
    api: { library: { certMine: async () => [{ category: '<img src=x>', score: 95 }] } },
    console,
  };
  vm.createContext(certContext);
  vm.runInContext(userSource, certContext);
  await certContext.renderMyCertificates();

  const certList = certDom.window.document.getElementById('certMineList');
  assert.match(certList.textContent, /<img src=x>/);
  assert.equal(certList.querySelector('img'), null);
  assert.equal(certList.querySelector('button').getAttribute('data-onclick'), null);

  assert.doesNotMatch(adminSource, /sel\.innerHTML = categories\.map/);
  assert.doesNotMatch(userSource, /el\.innerHTML = certs\.map/);
  console.log('DOM fragment tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
