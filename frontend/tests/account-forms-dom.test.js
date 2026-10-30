'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { readGroup } = require('./helpers/module-source');

const frontend = path.resolve(__dirname, '..');
const source = readGroup('account');
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
      profile_visibility: 'public',
    },
  },
  dynamicStyleToken: css => 'test:' + css,
  updateAvatar: () => {},
  openAvatarPicker: () => calls.push('avatar-picker'),
  applyUserAvatarImage: () => false,
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
assert.equal(content.querySelectorAll('button').length, 3);
assert.doesNotMatch(content.textContent, /коллег|подразделен/);
assert.equal(content.querySelectorAll('[data-onclick], [data-nonce]').length, 0);

context.renderSettingsSecurityTab(content);
assert.equal(content.querySelector('#setEmailCode').maxLength, 6);
assert.equal(content.querySelectorAll('.set-save-btn').length, 4);
assert.equal(content.querySelectorAll('[data-onclick]').length, 0);

context.renderSettingsInfoTab(content);
assert.equal(content.querySelector('#setUsername').value, '<img src=x onerror=alert(1)>');
assert.equal(content.querySelector('#setFullName').value, 'Иван <script>alert(1)</script>');
// Поля «Подразделение» больше нет.
assert.equal(content.querySelector('#setDepartment'), null);
assert.equal(content.querySelector('script, svg[onload], img[onerror]'), null);
assert.equal(content.querySelectorAll('[data-onclick], [data-onchange]').length, 0);

context.openUserAgreement();
let modal = dom.window.document.getElementById('legalDocModal');
assert.match(modal.textContent, /Пользовательское соглашение/);
assert.equal(modal.querySelectorAll('[data-onclick]').length, 0);
modal.querySelector('button').click();
assert.equal(dom.window.document.getElementById('legalDocModal'), null);

(async () => {
// Текст документа загружается с постоянной страницы, без навигации и скриптов.
context.fetch = async url => ({
  ok: true,
  text: async () => `<main id="legalDocument"><nav>меню</nav><h1>Политика</h1><p>Текст ${url}</p><script>bad()</script></main>`,
});
context.openPrivacyPolicy();
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));
modal = dom.window.document.getElementById('legalDocModal');
assert.match(modal.textContent, /Текст \/legal\/privacy\.html/);
assert.doesNotMatch(modal.textContent, /меню/);
assert.equal(modal.querySelector('script'), null);
assert.equal(modal.querySelector('a.legal-page-link').getAttribute('href'), '/legal/privacy.html');
modal.querySelector('button').click();

// Повторное согласие: окно блокирует, пока не отмечены обе галочки.
const accepted = [];
context.api = { acceptLegalDocuments: async () => { accepted.push(1); return { legal_consent_required: false }; } };
context.showToast = () => {};
context.onAppScreenShown = () => calls.push('screen-shown');
context.state.currentScreen = 'home';
context.state.currentUser.id = 5;
context.state.currentUser.legal_consent_required = true;
assert.equal(context.maybeShowLegalConsent(), true);
const prompt = dom.window.document.getElementById('legalConsentPrompt');
const accept = [...prompt.querySelectorAll('button')].find(b => b.textContent === 'Принять и продолжить');
assert.equal(accept.disabled, true);
const terms = prompt.querySelector('#legalConsentTerms');
terms.checked = true;
terms.dispatchEvent(new dom.window.Event('change'));
assert.equal(accept.disabled, true);
const pd = prompt.querySelector('#legalConsentPd');
pd.checked = true;
pd.dispatchEvent(new dom.window.Event('change'));
assert.equal(accept.disabled, false);
accept.click();
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(accepted, [1]);
assert.equal(dom.window.document.getElementById('legalConsentPrompt'), null);
assert.equal(context.state.currentUser.legal_consent_required, false);
assert.equal(context.maybeShowLegalConsent(), false);

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
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
