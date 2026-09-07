'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontendDir = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(frontendDir, 'pomodoro.js'), 'utf8');
const appSource = fs.readFileSync(path.join(frontendDir, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');
const swSource = fs.readFileSync(path.join(frontendDir, 'sw.js'), 'utf8');

const dom = new JSDOM(`
  <div id="pomodoroContainer"></div>
  <div id="pomodoroTimer">25:00</div>
  <button id="pomodoroStart"></button>
  <button id="pomodoroPause" class="is-hidden"></button>
  <span id="pomodoroStatus">Готов к работе</span>
`);
let intervalCallback = null;
let cleared = 0;
const toasts = [];
const context = vm.createContext({
  document: dom.window.document,
  setInterval: callback => {
    intervalCallback = callback;
    return 42;
  },
  clearInterval: () => { cleared += 1; },
  showToast: message => toasts.push(message),
});
vm.runInContext(source, context);

vm.runInContext('pomodoroSeconds = 1; startPomodoro()', context);
assert.ok(dom.window.document.getElementById('pomodoroStart').classList.contains('is-hidden'));
assert.equal(dom.window.document.getElementById('pomodoroPause').classList.contains('is-hidden'), false);
assert.equal(dom.window.document.getElementById('pomodoroStatus').textContent, 'Фокус');
assert.equal(typeof intervalCallback, 'function');

intervalCallback();
assert.deepEqual(toasts, ['Перерыв!']);
assert.equal(dom.window.document.getElementById('pomodoroTimer').textContent, '05:00');
assert.equal(dom.window.document.getElementById('pomodoroStart').classList.contains('is-hidden'), false);
assert.ok(dom.window.document.getElementById('pomodoroPause').classList.contains('is-hidden'));

vm.runInContext('startPomodoro(); pausePomodoro(); resetPomodoro()', context);
assert.ok(cleared >= 3);
assert.equal(dom.window.document.getElementById('pomodoroTimer').textContent, '25:00');
assert.equal(dom.window.document.getElementById('pomodoroStatus').textContent, 'Готов к работе');

vm.runInContext('togglePomodoro()', context);
assert.ok(dom.window.document.getElementById('pomodoroContainer').classList.contains('show'));

assert.doesNotMatch(appSource, /pomodoroInterval|function startPomodoro\(/);
assert.doesNotMatch(source, /innerHTML|style\.cssText|\.style\./);
assert.ok(
  indexSource.indexOf('src="notifications.js"') < indexSource.indexOf('src="pomodoro.js"'),
  'notifications.js должен загружаться до использующего showToast Pomodoro',
);
assert.ok(
  indexSource.indexOf('src="pomodoro.js"') < indexSource.indexOf('src="app.js"'),
  'pomodoro.js должен загружаться раньше app.js',
);
assert.match(swSource, /const CACHE_NAME = 'aegis-cache-v\\d+'/);
assert.match(swSource, /'\/pomodoro\.js'/);

console.log('Pomodoro tests passed');
