'use strict';

// Книги, убранные из «Продолжить», хранятся в аккаунте, а на устройстве —
// только копия. Проверяем перенос старого локального списка и синхронизацию.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'home-continue.js'), 'utf8');
const authSource = fs.readFileSync(path.join(__dirname, '..', 'auth-ui.js'), 'utf8');

function setup({ local = null, synced = false, server = null, failPatch = false } = {}) {
  const storage = new Map();
  if (local) storage.set('aegis_resume_hidden', JSON.stringify(local));
  if (synced) storage.set('aegis_resume_hidden_synced', '1');
  const patches = [];
  const context = {
    state: { currentUser: { id: 3, resume_hidden: server } },
    navigator: {},
    renderHome() {},
    lsGet: key => storage.get(key) ?? null,
    lsSet: (key, value) => storage.set(key, value),
    api: {
      updateMe: payload => {
        patches.push(payload);
        return failPatch ? Promise.reject(new Error('offline')) : Promise.resolve({});
      },
    },
    console: { info() {} },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, storage, patches };
}

const flush = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));

(async () => {
  // Старое устройство: список был только локально — переносим в аккаунт один раз.
  let env = setup({ local: [4, 9], server: null });
  env.context.syncResumeHiddenFromAccount();
  await flush();
  assert.deepEqual(plain(env.patches), [{ resume_hidden: [4, 9] }]);
  assert.equal(env.storage.get('aegis_resume_hidden_synced'), '1');

  // Новое устройство (пустое хранилище): берём список из аккаунта.
  env = setup({ local: null, server: [7] });
  env.context.syncResumeHiddenFromAccount();
  await flush();
  assert.deepEqual(plain(env.context.getResumeHidden()), [7]);
  assert.deepEqual(env.patches, []);

  // После переноса аккаунт — источник истины: книгу открыли на другом
  // устройстве, и здесь она тоже возвращается в «Продолжить».
  env = setup({ local: [7, 8], synced: true, server: [8] });
  env.context.syncResumeHiddenFromAccount();
  assert.deepEqual(plain(env.context.getResumeHidden()), [8]);
  assert.deepEqual(env.patches, []);

  // Крестик и повторное открытие сохраняются в аккаунт.
  env = setup({ synced: true, server: [] });
  env.context.syncResumeHiddenFromAccount();
  env.context.hideFromResume(5);
  assert.deepEqual(plain(env.patches.at(-1)), { resume_hidden: [5] });
  const before = env.patches.length;
  env.context.unhideFromResume(11);   // не был скрыт — запроса нет
  assert.equal(env.patches.length, before);
  env.context.unhideFromResume(5);
  assert.deepEqual(plain(env.patches.at(-1)), { resume_hidden: [] });

  // Без сети список остаётся на устройстве и уйдёт в аккаунт при следующем входе.
  env = setup({ synced: true, server: [], failPatch: true });
  env.context.hideFromResume(2);
  await flush();
  assert.deepEqual(plain(env.context.getResumeHidden()), [2]);
  assert.equal(env.storage.get('aegis_resume_hidden_synced'), '');

  // Синхронизация вызывается на всех путях входа с сетью.
  assert.equal((authSource.match(/syncResumeHiddenFromAccount\(\)/g) || []).length, 3);
  assert.equal((authSource.match(/resume_hidden: Array\.isArray\(user\.resume_hidden\)/g) || []).length, 3);

  console.log('Resume hidden sync tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
