'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(frontend, 'account-settings.js'), 'utf8');
const dom = new JSDOM(`
  <button class="settings-tab" data-stab="info"></button>
  <button class="settings-tab" data-stab="help"></button>
  <span id="logoutIcon"></span>
  <div id="settingsContent"></div>
`);
const calls = [];
const icon = '<svg viewBox="0 0 10 10"><path d="M0 0h1"/></svg>';
const context = {
  document: dom.window.document,
  state: { currentUser: {}, heatmapData: [], mylist: {}, books: [] },
  ICONS: {
    iconUser: icon, iconHelp: icon, iconLogout: icon,
    iconLock: icon, iconEye: icon, iconDatabase: icon, iconPalette: icon,
  },
  appendTrustedIcon: container => container.appendChild(dom.window.document.createElementNS('http://www.w3.org/2000/svg', 'svg')),
  dynamicStyleToken: () => 'test-style',
  api: { library: { myQuizAttempts: async () => [] } },
  loadHeatmapFromApi: async () => {},
  getReadingGoal: () => 20,
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  context.renderSettingsTabContent = () => calls.push('render-tab');
  context.renderSettingsScreen();
  assert.equal(dom.window.document.querySelectorAll('.settings-tab svg').length, 2);
  assert.equal(dom.window.document.querySelector('[data-stab="info"] span').textContent, 'Информация');
  assert.equal(dom.window.document.querySelector('#logoutIcon svg') !== null, true);

  const content = dom.window.document.getElementById('settingsContent');
  context.replayOnboardingTour = () => calls.push('tour');
  context.triggerInstall = () => calls.push('install');
  context.openUserAgreement = () => calls.push('agreement');
  context.openPrivacyPolicy = () => calls.push('privacy');
  context.renderSettingsHelpTab(content);
  assert.equal(content.querySelector('[data-onclick]'), null);
  content.querySelectorAll('button').forEach(button => button.click());
  assert.deepEqual(calls.slice(-4), ['tour', 'install', 'agreement', 'privacy']);
  assert.equal(content.querySelector('a').href, 'mailto:support@aegis-sec-library.ru');

  context.doDeleteAccount = () => calls.push('delete');
  context.confirmDeleteAccount();
  const deleteModal = dom.window.document.getElementById('deleteAccModal');
  assert.equal(deleteModal.querySelector('[data-onclick], [data-nonce]'), null);
  assert.equal(deleteModal.querySelectorAll('input').length, 2);
  deleteModal.querySelector('[data-static-style="a406"]').click();
  assert.equal(calls.at(-1), 'delete');
  deleteModal.querySelector('[data-static-style="a405"]').click();
  assert.equal(dom.window.document.getElementById('deleteAccModal'), null);

  await context.showMyStatsModal();
  const statsModal = dom.window.document.getElementById('myStatsModal');
  assert.ok(statsModal.querySelector('#myStatsBody'));
  statsModal.querySelector('#myStatsClose').click();
  assert.equal(dom.window.document.getElementById('myStatsModal'), null);

  assert.doesNotMatch(source, /btn\.innerHTML\s*=/);
  assert.doesNotMatch(source, /logoutIc\.innerHTML\s*=/);
  const helpSource = source.slice(
    source.indexOf('function renderSettingsHelpTab'),
    source.indexOf('function _openLegalModal'),
  );
  assert.doesNotMatch(helpSource, /innerHTML/);
  const deleteSource = source.slice(
    source.indexOf('function confirmDeleteAccount'),
    source.indexOf('async function doDeleteAccount'),
  );
  const statsSource = source.slice(
    source.indexOf('async function showMyStatsModal'),
    source.indexOf('function updateAvatar'),
  );
  assert.doesNotMatch(deleteSource, /m\.innerHTML\s*=/);
  assert.doesNotMatch(statsSource, /modal\.innerHTML\s*=/);
  console.log('Account static DOM tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
