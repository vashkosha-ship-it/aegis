'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontendDir = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(frontendDir, 'dialogs.js'), 'utf8');
const appSource = fs.readFileSync(path.join(frontendDir, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');
const swSource = fs.readFileSync(path.join(frontendDir, 'sw.js'), 'utf8');

const dom = new JSDOM('<body></body>');
const context = vm.createContext({
  document: dom.window.document,
  setTimeout: callback => {
    callback();
    return 1;
  },
});
vm.runInContext(source, context);

let confirmed = 0;
context.confirmOptions = {
  title: '<img src=x onerror=alert(1)>',
  message: '<script>alert(1)</script>',
  confirmText: '<b>Удалить</b>',
  cancelText: '<i>Отмена</i>',
  danger: true,
  onConfirm: () => { confirmed += 1; },
};
vm.runInContext('showConfirmModal(confirmOptions)', context);

let modal = dom.window.document.getElementById('confirmModal');
assert.ok(modal);
assert.equal(modal.getAttribute('role'), 'dialog');
assert.equal(modal.querySelector('.app-dialog-title').textContent, '<img src=x onerror=alert(1)>');
assert.equal(modal.querySelector('.app-dialog-message').textContent, '<script>alert(1)</script>');
assert.equal(modal.querySelector('img, script, b, i'), null);
assert.ok(modal.querySelector('#confirmOkBtn').classList.contains('is-danger'));
modal.querySelector('#confirmOkBtn').click();
assert.equal(confirmed, 1);
assert.equal(dom.window.document.getElementById('confirmModal'), null);

let prompted = null;
context.promptOptions = {
  title: 'Название',
  placeholder: '"><img src=x>',
  value: '<script>',
  multiline: false,
  onConfirm: value => { prompted = value; },
};
vm.runInContext('showPromptModal(promptOptions)', context);

modal = dom.window.document.getElementById('promptModal');
const input = modal.querySelector('#promptInput');
assert.equal(input.tagName, 'INPUT');
assert.equal(input.placeholder, '"><img src=x>');
assert.equal(input.value, '<script>');
input.value = '  безопасный текст  ';
input.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
  key: 'Enter',
  bubbles: true,
  cancelable: true,
}));
assert.equal(prompted, 'безопасный текст');
assert.equal(dom.window.document.getElementById('promptModal'), null);

assert.doesNotMatch(appSource, /function showConfirmModal\(|function showPromptModal\(/);
assert.doesNotMatch(source, /innerHTML|style\.cssText|\.style\./);
assert.ok(
  indexSource.indexOf('src="dialogs.js"') < indexSource.indexOf('src="app.js"'),
  'dialogs.js должен подключаться раньше app.js',
);
assert.match(swSource, /const CACHE_NAME = 'aegis-cache-v\d+'/);
assert.match(swSource, /'\/dialogs\.js'/);

// appConfirm: «Да» → true, «Отмена», Escape и клик по фону → false.
(async () => {
  const doc = dom.window.document;
  let answer = vm.runInContext("appConfirm('Удалить?', { title: 'Удалить книгу?', confirmText: 'Удалить', danger: true })", context);
  assert.equal(doc.querySelector('#confirmModal .app-dialog-title').textContent, 'Удалить книгу?');
  assert.ok(doc.getElementById('confirmOkBtn').classList.contains('is-danger'));
  doc.getElementById('confirmOkBtn').click();
  assert.equal(await answer, true);
  assert.equal(doc.getElementById('confirmModal'), null);

  answer = vm.runInContext("appConfirm('Удалить?')", context);
  doc.getElementById('confirmCancelBtn').click();
  assert.equal(await answer, false);

  answer = vm.runInContext("appConfirm('Удалить?')", context);
  doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(await answer, false);

  answer = vm.runInContext("appConfirm('Удалить?')", context);
  const overlay = doc.getElementById('confirmModal');
  overlay.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal(await answer, false);
  console.log('Dialogs tests passed');
})().catch(err => { console.error(err); process.exit(1); });
