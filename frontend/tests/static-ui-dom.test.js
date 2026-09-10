'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const authSource = fs.readFileSync(path.join(frontend, 'auth-ui.js'), 'utf8');
const readerSource = fs.readFileSync(path.join(frontend, 'reader-core.js'), 'utf8');
const userSource = fs.readFileSync(path.join(frontend, 'user-features.js'), 'utf8');

const authDom = new JSDOM('<form id="authForm"></form><select id="authDepartment"></select><input id="authDepartmentOther"><input id="authPass" type="password"><svg id="eyeIcon"></svg>');
const authContext = { document: authDom.window.document, console };
vm.createContext(authContext);
vm.runInContext(authSource, authContext);
authContext.togglePasswordVisibility();
assert.equal(authDom.window.document.getElementById('authPass').type, 'text');
assert.deepEqual(
  Array.from(authDom.window.document.getElementById('eyeIcon').children, node => node.localName),
  ['path', 'path', 'line'],
);
authContext.togglePasswordVisibility();
assert.equal(authDom.window.document.getElementById('authPass').type, 'password');
assert.deepEqual(
  Array.from(authDom.window.document.getElementById('eyeIcon').children, node => node.localName),
  ['path', 'circle'],
);
assert.doesNotMatch(authSource, /icon\.innerHTML\s*=/);

const readerDom = new JSDOM('<div id="pdfPlaceholder"></div>');
const readerContext = {
  document: readerDom.window.document,
  window: readerDom.window,
  state: { readingProgress: { 7: { currentPage: 2, totalPages: 9 } } },
  ICONS: { bookCover: '<svg viewBox="0 0 1 1"></svg>' },
  appendTrustedIcon: container => container.appendChild(readerDom.window.document.createElementNS('http://www.w3.org/2000/svg', 'svg')),
  updatePageIndicator: () => {},
  renderAnnotations: () => {},
  loadOfflineBookIds: () => {},
  console,
};
vm.createContext(readerContext);
vm.runInContext(readerSource, readerContext);
readerContext.generateDemoPdf({ id: 7, title: '<img src=x onerror=alert(1)>' });
const placeholder = readerDom.window.document.getElementById('pdfPlaceholder');
assert.match(placeholder.textContent, /<img src=x onerror=alert\(1\)>/);
assert.equal(placeholder.querySelector('img'), null);
assert.equal(placeholder.querySelectorAll('p').length, 2);
assert.doesNotMatch(readerSource, /\.innerHTML\s*=\s*loadingSpinnerHTML/);

(async () => {
  const userDom = new JSDOM('<div id="detailTabNotes"></div>');
  const exports = [];
  const userContext = {
    document: userDom.window.document,
    currentBookId: 7,
    getAnnotations: async () => [{ id: 1 }],
    ICONS: { bookmark: '<svg viewBox="0 0 1 1"></svg>' },
    appendTrustedIcon: container => container.appendChild(userDom.window.document.createElementNS('http://www.w3.org/2000/svg', 'svg')),
    showListSkeleton: () => {},
    console,
  };
  vm.createContext(userContext);
  vm.runInContext(userSource, userContext);
  userContext.doExportNotes = format => exports.push(format);
  await userContext.exportNotes();
  const modal = userDom.window.document.getElementById('exportFmtModal');
  assert.equal(modal.querySelectorAll('button[data-static-style="a231"]').length, 4);
  modal.querySelector('button[data-static-style="a231"]').click();
  assert.deepEqual(exports, ['pdf']);

  userContext.getAnnotations = async () => [];
  await userContext.renderDetailNotes();
  const empty = userDom.window.document.querySelector('#detailTabNotes .mylist-empty');
  assert.equal(empty.textContent, 'Нет заметок');
  assert.equal(empty.querySelector('svg').localName, 'svg');
  assert.doesNotMatch(userSource, /m\.innerHTML\s*=\s*`<div data-static-style="a234"/);
  console.log('Static UI DOM tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
