'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontendDir = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(frontendDir, 'pwa-install.js'), 'utf8');
const appSource = fs.readFileSync(path.join(frontendDir, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');
const swSource = fs.readFileSync(path.join(frontendDir, 'sw.js'), 'utf8');

const dom = new JSDOM('<body></body>', { url: 'https://aegis.example/' });
dom.window.matchMedia = () => ({ matches: false });

const toasts = [];
const context = vm.createContext({
  window: dom.window,
  document: dom.window.document,
  navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile' },
  localStorage: dom.window.localStorage,
  showToast: message => toasts.push(message),
  closeModal: id => dom.window.document.getElementById(id)?.remove(),
  console,
});
vm.runInContext(source, context);

vm.runInContext('showInstallBanner()', context);
let banner = dom.window.document.getElementById('installBanner');
assert.ok(banner, 'На мобильном устройстве должен появиться баннер установки');
assert.equal(banner.className, 'install-banner');
assert.equal(banner.querySelector('#installBannerBtn').textContent, 'Установить');

banner.querySelector('#installBannerClose').onclick();
assert.equal(dom.window.localStorage.getItem('aegis_install_dismissed'), '1');
assert.equal(dom.window.document.getElementById('installBanner'), null);

dom.window.localStorage.removeItem('aegis_install_dismissed');
let prompted = 0;
const installEvent = new dom.window.Event('beforeinstallprompt', { cancelable: true });
installEvent.prompt = () => { prompted += 1; };
installEvent.userChoice = Promise.resolve({ outcome: 'accepted' });
dom.window.dispatchEvent(installEvent);

(async () => {
  assert.ok(dom.window.document.getElementById('installBanner'));
  await vm.runInContext('triggerInstall()', context);
  assert.equal(prompted, 1);
  assert.equal(dom.window.document.getElementById('installBanner'), null);
  assert.deepEqual(toasts, ['Устанавливаем приложение…']);

  assert.doesNotMatch(appSource, /beforeinstallprompt|function triggerInstall\(/);
  assert.doesNotMatch(source, /style\.cssText/);
  assert.ok(
    indexSource.indexOf('src="pwa-install.js"') < indexSource.indexOf('src="app.js"'),
    'pwa-install.js должен подключаться раньше app.js',
  );
  assert.match(swSource, /const CACHE_NAME = 'aegis-cache-v208'/);
  assert.match(swSource, /'\/pwa-install\.js'/);

  console.log('PWA install tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
