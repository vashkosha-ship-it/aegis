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
  state: {
    currentUser: {},
    heatmapData: [{ pages: 12 }],
    mylist: { 7: 'reading' },
    books: [{ id: 7, categories: ['<img src=x onerror=alert(1)>'] }],
  },
  ICONS: { iconDatabase: '<svg></svg>' },
  appendTrustedIcon: container => container.appendChild(dom.window.document.createElement('svg')),
  dynamicStyleToken: css => 'test:' + css,
  getStorageStats: async () => ({ used: 25, quota: 100, cacheSize: 10, cacheCount: 2 }),
  formatBytes: value => value + ' B',
  isWifiOnlyEnabled: () => true,
  isAutoPreloadEnabled: () => false,
  onWifiOnlyToggle: input => calls.push(['wifi', input.checked]),
  onAutoPreloadToggle: input => calls.push(['preload', input.checked]),
  exportAllUserData: () => calls.push(['export']),
  confirmClearCache: () => calls.push(['clear']),
  loadHeatmapFromApi: async () => {},
  getReadingGoal: () => 20,
  api: { library: { myQuizAttempts: async () => [{ percentage: 80 }] } },
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  const content = dom.window.document.getElementById('settingsContent');
  await context.renderSettingsStorageTab(content);
  assert.equal(content.querySelector('[data-static-style="a356"]').textContent, '25 B');
  assert.equal(content.querySelector('#wifiOnlyToggle').checked, true);
  assert.equal(content.querySelector('#autoPreloadToggle').checked, false);
  assert.equal(content.querySelectorAll('[data-onclick], [data-onchange], [data-nonce]').length, 0);
  content.querySelector('#wifiOnlyToggle').click();
  content.querySelector('#autoPreloadToggle').click();
  [...content.querySelectorAll('button')].forEach(button => button.click());
  assert.deepEqual(calls, [
    ['wifi', false],
    ['preload', true],
    ['export'],
    ['clear'],
  ]);

  await context.showMyStatsModal();
  const stats = dom.window.document.getElementById('myStatsBody');
  assert.match(stats.textContent, /12/);
  assert.match(stats.textContent, /80%/);
  assert.match(stats.textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(stats.querySelector('img'), null);
  assert.ok(stats.querySelectorAll('[data-dynamic-style]').length >= 3);

  const storageSource = source.slice(
    source.indexOf('async function renderSettingsStorageTab'),
    source.indexOf('function confirmClearCache'),
  );
  const statsSource = source.slice(
    source.indexOf('async function showMyStatsModal'),
    source.indexOf('function updateAvatar'),
  );
  assert.doesNotMatch(storageSource, /innerHTML/);
  assert.doesNotMatch(statsSource, /innerHTML/);
  console.log('Account statistics and storage DOM tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
