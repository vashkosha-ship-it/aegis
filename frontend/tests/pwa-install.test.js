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

  vm.runInContext('showAndroidInstallInstructions()', context);
  const androidModal = dom.window.document.getElementById('androidInstallModal');
  assert.equal(androidModal.querySelectorAll('ol li').length, 4);
  assert.match(androidModal.textContent, /Chrome/);
  androidModal.querySelector('button').click();
  assert.equal(dom.window.document.getElementById('androidInstallModal'), null);

  // iPhone в Safari: четыре шага, без предупреждения о браузере.
  context.navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  vm.runInContext('showIOSInstallInstructions()', context);
  let iosModal = dom.window.document.getElementById('iosInstallModal');
  assert.equal(iosModal.querySelectorAll('li').length, 4);
  assert.match(iosModal.textContent, /На экран «Домой»/);
  assert.doesNotMatch(iosModal.textContent, /Сейчас сайт открыт в/);
  iosModal.querySelector('button').click();
  assert.equal(dom.window.document.getElementById('iosInstallModal'), null);

  // iPhone в Chrome: подсказываем открыть в Safari.
  context.navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
  vm.runInContext('showIOSInstallInstructions()', context);
  iosModal = dom.window.document.getElementById('iosInstallModal');
  assert.match(iosModal.textContent, /Сейчас сайт открыт в: Chrome/);
  iosModal.querySelector('button').click();
  context.navigator.userAgent = 'Mozilla/5.0 (Linux; Android 14) Mobile';

  assert.doesNotMatch(appSource, /beforeinstallprompt|function triggerInstall\(/);
  assert.doesNotMatch(source, /style\.cssText/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.ok(
    indexSource.indexOf('src="pwa-install.js"') < indexSource.indexOf('src="app.js"'),
    'pwa-install.js должен подключаться раньше app.js',
  );
  assert.match(swSource, /const CACHE_NAME = 'aegis-cache-v\d+'/);
  assert.match(swSource, /'\/pwa-install\.js'/);

  console.log('PWA install tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
