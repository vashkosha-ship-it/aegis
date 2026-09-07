'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontendDir = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(frontendDir, 'notifications.js'), 'utf8');
const appSource = fs.readFileSync(path.join(frontendDir, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');
const swSource = fs.readFileSync(path.join(frontendDir, 'sw.js'), 'utf8');

const dom = new JSDOM('<body></body>');
const network = { onLine: false };
const timers = [];
const context = vm.createContext({
  window: dom.window,
  document: dom.window.document,
  navigator: network,
  setTimeout: (callback, delay) => {
    timers.push({ callback, delay });
    return timers.length;
  },
});
vm.runInContext(source, context);

const banner = dom.window.document.getElementById('offlineBanner');
assert.ok(banner);
assert.ok(banner.classList.contains('is-visible'));
assert.equal(banner.getAttribute('role'), 'status');

network.onLine = true;
dom.window.dispatchEvent(new dom.window.Event('online'));
assert.equal(banner.classList.contains('is-visible'), false);

vm.runInContext('showToast("<img src=x onerror=alert(1)>")', context);
const toast = dom.window.document.querySelector('.toast');
assert.ok(toast);
assert.equal(toast.textContent, '<img src=x onerror=alert(1)>');
assert.equal(toast.querySelector('img'), null);
assert.equal(timers[0].delay, 2500);

timers.shift().callback();
assert.ok(toast.classList.contains('is-hiding'));
assert.equal(timers[0].delay, 300);
timers.shift().callback();
assert.equal(dom.window.document.querySelector('.toast'), null);

assert.doesNotMatch(appSource, /function showToast\(|function updateOnlineStatus\(/);
assert.doesNotMatch(source, /innerHTML|style\.cssText|\.style\./);
assert.ok(
  indexSource.indexOf('src="notifications.js"') < indexSource.indexOf('src="pwa-install.js"'),
  'notifications.js должен загружаться до использующего showToast PWA-модуля',
);
assert.ok(
  indexSource.indexOf('src="notifications.js"') < indexSource.indexOf('src="app.js"'),
  'notifications.js должен загружаться раньше app.js',
);
assert.match(swSource, /const CACHE_NAME = 'aegis-cache-v\d+'/);
assert.match(swSource, /'\/notifications\.js'/);

console.log('Notifications tests passed');
