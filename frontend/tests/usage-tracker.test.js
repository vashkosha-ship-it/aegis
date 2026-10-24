'use strict';

// Счётчики использования: только имена из кода, пачкой, без текста пользователя.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontend = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(frontend, 'usage-tracker.js'), 'utf8');
const index = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(frontend, 'sw.js'), 'utf8');
const handlers = fs.readFileSync(path.join(frontend, 'inline-handlers.js'), 'utf8');

function setup({ loggedIn = true, dnt = null } = {}) {
  const sent = [];
  const listeners = {};
  const context = {
    navigator: { doNotTrack: dnt },
    window: {},
    document: {
      visibilityState: 'visible',
      addEventListener: (type, fn) => { listeners[type] = fn; },
    },
    state: { currentUser: loggedIn ? { id: 1 } : null },
    api: { library: { reportUsage: (payload, options) => { sent.push({ payload, options }); return Promise.resolve(); } } },
    getAppTheme: () => 'dark',
    getAppAccent: () => 'blue',
    setTimeout: () => 1,
    clearTimeout: () => {},
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, sent, listeners, w: context.window };
}

(async () => {
  const { sent, listeners, w, context } = setup();
  w.trackUsage('screen', 'home');
  w.trackUsage('screen', 'home');
  w.trackUsage('action', 'openTOC');
  w.trackUsage('action', 'navigateTo');           // учтён как экран
  w.trackUsage('action', 'Иван Иванов');          // не идентификатор — отбрасываем
  w.trackUsage('click', 'home');                  // неизвестный тип
  await w.flushUsage(false);
  assert.equal(sent.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0].payload)), {
    events: [
      { kind: 'screen', name: 'home', count: 2 },
      { kind: 'action', name: 'openTOC', count: 1 },
    ],
    prefs: { theme: 'dark', accent: 'blue' },
  });

  // Повторно без изменений ничего не уходит; тема и цвет — только после смены.
  await w.flushUsage(false);
  assert.equal(sent.length, 1);
  w.markUiPrefsChanged();
  await w.flushUsage(false);
  assert.ok(sent[1].payload.prefs);

  // При уходе со страницы пачка отправляется с keepalive.
  w.trackUsage('screen', 'profile');
  context.document.visibilityState = 'hidden';
  listeners.visibilitychange();
  await Promise.resolve();
  assert.equal(sent.at(-1).options.keepalive, true);

  // До входа и при «Не отслеживать» ничего не отправляется.
  for (const options of [{ loggedIn: false }, { dnt: '1' }]) {
    const other = setup(options);
    other.w.trackUsage('screen', 'home');
    await other.w.flushUsage(false);
    assert.equal(other.sent.length, 0);
  }

  assert.ok(index.indexOf('usage-tracker.js') < index.indexOf('navigation.js'));
  assert.match(worker, /'\/usage-tracker\.js'/);
  assert.match(handlers, /window\.trackUsage\('action', name\)/);
  console.log('Usage tracker tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
