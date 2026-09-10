'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(frontend, 'account-settings.js'), 'utf8');
const dom = new JSDOM('<div id="settingsContent"></div>');
const calls = [];
const context = {
  document: dom.window.document,
  DOMParser: dom.window.DOMParser,
  state: {
    currentUser: {
      name: '<img src=x onerror=alert(1)>',
      full_name: 'Иван <script>alert(1)</script>',
      email: 'safe@example.test',
      department: '<svg onload=alert(1)>',
      profile_visibility: 'public',
    },
  },
  dynamicStyleToken: css => 'test:' + css,
  updateAvatar: () => {},
  uploadAvatar: () => calls.push('upload'),
  saveSettingsInfo: () => calls.push('save-info'),
  saveSettingsPassword: () => calls.push('save-password'),
  requestEmailChangeUI: () => calls.push('request-email'),
  confirmEmailChangeUI: () => calls.push('confirm-email'),
  confirmDeleteAccount: () => calls.push('delete'),
  setPrivacyVisibility: value => calls.push('privacy:' + value),
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

const content = dom.window.document.getElementById('settingsContent');

context.renderSettingsPrivacyTab(content);
content.querySelectorAll('button')[1].click();
content.querySelector('.set-save-btn').click();
assert.deepEqual(calls.splice(0), ['privacy:colleagues', 'delete']);
assert.equal(content.querySelectorAll('[data-onclick], [data-nonce]').length, 0);

context.renderSettingsSecurityTab(content);
assert.equal(content.querySelector('#setEmailCode').maxLength, 6);
content.querySelectorAll('.set-save-btn')[0].click();
content.querySelectorAll('.set-save-btn')[1].click();
content.querySelectorAll('.set-save-btn')[2].click();
assert.deepEqual(calls.splice(0), ['save-password', 'request-email', 'confirm-email']);

context.renderSettingsInfoTab(content);
assert.equal(content.querySelector('#setUsername').value, '<img src=x onerror=alert(1)>');
assert.equal(content.querySelector('#setFullName').value, 'Иван <script>alert(1)</script>');
assert.equal(content.querySelector('#setDepartmentOther').value, '<svg onload=alert(1)>');
assert.equal(content.querySelector('script, svg[onload], img[onerror]'), null);
content.querySelector('.set-save-btn').click();
assert.deepEqual(calls.splice(0), ['save-info']);

context.openUserAgreement();
let modal = dom.window.document.getElementById('legalDocModal');
assert.match(modal.textContent, /Пользовательское соглашение/);
assert.equal(modal.querySelectorAll('[data-onclick]').length, 0);
modal.querySelector('button').click();
assert.equal(dom.window.document.getElementById('legalDocModal'), null);

for (const [start, end] of [
  ['function _openLegalModal', 'function openUserAgreement'],
  ['function renderSettingsPrivacyTab', 'function confirmDeleteAccount'],
  ['function renderSettingsSecurityTab', 'async function requestEmailChangeUI'],
  ['function renderSettingsInfoTab', 'async function saveSettingsInfo'],
]) {
  const fragment = source.slice(source.indexOf(start), source.indexOf(end));
  assert.doesNotMatch(fragment, /innerHTML/);
}
console.log('Account forms and legal documents DOM tests passed');
