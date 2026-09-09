'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'pull-to-refresh.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM('<body></body>');
const calls = [];
const timers = [];
const vibrations = [];
const context = {
  document: dom.window.document,
  navigator: { vibrate: ms => vibrations.push(ms) },
  state: { currentScreen: 'home' },
  loadBooksFromApi: async () => calls.push('books'),
  loadMyListFromApi: async () => calls.push('mylist'),
  loadProgressFromApi: async () => calls.push('progress'),
  renderHome: () => calls.push('render'),
  showToast: message => calls.push(message),
  setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
  Promise,
};
vm.createContext(context);
vm.runInContext(source, context);

function touch(type, y) {
  const event = new dom.window.Event(type, { bubbles: true });
  Object.defineProperty(event, type === 'touchend' ? 'changedTouches' : 'touches', {
    value: [{ clientY: y }],
  });
  dom.window.document.dispatchEvent(event);
}

(async () => {
  Object.defineProperty(dom.window.document.documentElement, 'scrollTop', { value: 0, writable: true });
  context.initPullToRefresh();

  touch('touchstart', 10);
  touch('touchmove', 50);
  let indicator = dom.window.document.body.lastElementChild;
  assert.match(indicator.textContent, /Потяните вниз/);

  touch('touchend', 50);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, []);
  assert.equal(timers.at(-1).delay, 250);

  touch('touchstart', 10);
  touch('touchmove', 100);
  indicator = dom.window.document.body.lastElementChild;
  assert.match(indicator.textContent, /Отпустите для обновления/);
  touch('touchend', 100);
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(calls, ['books', 'mylist', 'progress', 'render', 'Обновлено']);
  assert.deepEqual(vibrations, [15]);
  assert.equal(timers.at(-1).delay, 250);

  context.state.currentScreen = 'profile';
  const childCount = dom.window.document.body.children.length;
  touch('touchstart', 10);
  touch('touchmove', 100);
  touch('touchend', 100);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dom.window.document.body.children.length, childCount);

  assert.doesNotMatch(appSource, /function initPullToRefresh/);
  assert.ok(indexSource.indexOf('pull-to-refresh.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /['"]\/pull-to-refresh\.js['"]/);
  console.log('Pull to refresh tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
