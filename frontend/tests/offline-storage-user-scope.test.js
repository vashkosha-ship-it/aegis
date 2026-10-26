'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'offline-storage.js'), 'utf8');
const calls = { created: [], deletedStores: [], get: [], put: [], delete: [], index: [] };

function resultRequest(result) {
  const request = {};
  setTimeout(() => {
    request.result = result;
    if (request.onsuccess) request.onsuccess();
  }, 0);
  return request;
}

// Кэш открытых книг — настоящее хранилище в памяти: нужно проверить
// вытеснение и устаревание версий, а не только ключи.
const cacheRows = new Map();
const cacheKey = key => JSON.stringify(key);

function makeCacheStore() {
  return {
    put(value) {
      calls.put.push(['cache', value]);
      cacheRows.set(cacheKey([value.userId, value.bookId, value.type]), value);
    },
    get(key) { return resultRequest(cacheRows.get(cacheKey(key))); },
    delete(key) {
      calls.delete.push(['cache', key]);
      cacheRows.delete(cacheKey(key));
    },
    index() {
      const own = userId => [...cacheRows.values()].filter(row => row.userId === userId);
      return {
        getAll: userId => resultRequest(own(userId)),
        getAllKeys: userId => resultRequest(own(userId).map(row => [row.userId, row.bookId, row.type])),
      };
    },
  };
}

function makeStore(name) {
  if (name === 'cache') return makeCacheStore();
  return {
    put(value) { calls.put.push([name, value]); },
    get(key) {
      calls.get.push([name, key]);
      const result = name === 'files' ? { blob: 'file-blob' } : { id: key[1] };
      return resultRequest(result);
    },
    delete(key) { calls.delete.push([name, key]); },
    index(indexName) {
      assert.equal(indexName, 'by_user');
      return {
        getAllKeys(userId) {
          calls.index.push([name, 'keys', userId]);
          return resultRequest(name === 'books'
            ? [[userId, 3]]
            : [[userId, 3, 'pdf'], [userId, 3, 'cover']]);
        },
        getAll(userId) {
          calls.index.push([name, 'all', userId]);
          return resultRequest([{ userId, id: 3, title: 'Scoped book' }]);
        },
      };
    },
  };
}

const stores = new Set(['books', 'files', 'cache']);
const database = {
  objectStoreNames: { contains: name => stores.has(name) },
  deleteObjectStore(name) {
    calls.deletedStores.push(name);
    stores.delete(name);
  },
  createObjectStore(name, options) {
    stores.add(name);
    calls.created.push([name, options.keyPath]);
    return { createIndex: (indexName, keyPath) => calls.index.push([name, indexName, keyPath]) };
  },
  transaction(names, mode) {
    const transaction = {
      objectStore: name => makeStore(name),
      error: null,
      mode,
      names,
    };
    Object.defineProperty(transaction, 'oncomplete', {
      set(handler) { setTimeout(handler, 0); },
    });
    return transaction;
  },
  close() {},
};

const indexedDB = {
  open(name, version) {
    assert.equal(name, 'aegis_offline');
    assert.equal(version, 3);
    const request = {};
    queueMicrotask(() => {
      request.result = database;
      // Кэша ещё нет: база обновляется с первой версии.
      stores.delete('cache');
      request.onupgradeneeded({ target: { result: database }, oldVersion: 1 });
      request.onsuccess();
    });
    return request;
  },
};

const context = {
  window: {},
  indexedDB,
  navigator: {},
  URL: { createObjectURL: value => value },
  Date,
  Number,
  TypeError,
  Promise,
  setTimeout,
  queueMicrotask,
};
vm.createContext(context);
vm.runInContext(source, context);

const plain = value => JSON.parse(JSON.stringify(value));

(async () => {
  const storage = context.window.offlineStorage;

  assert.equal(await storage.has(7, 3), true);
  assert.deepEqual(plain(calls.get[0]), ['books', [7, 3]]);

  assert.equal(await storage.getFile(7, 3, 'pdf'), 'file-blob');
  assert.deepEqual(plain(calls.get[1]), ['files', [7, 3, 'pdf']]);

  assert.deepEqual(plain(await storage.listIds(7)), [3]);
  assert.equal((await storage.listAll(7))[0].userId, 7);

  await storage.save(
    7,
    { id: 4, title: 'Book', author: 'Author', total_pages: 10 },
    'pdf-blob',
    'pdf',
    'cover-blob',
  );
  assert.ok(calls.put.every(([, value]) => value.userId === 7));

  await storage.remove(7, 4);
  assert.ok(calls.delete.some(([, key]) => JSON.stringify(key) === '[7,4]'));
  assert.ok(calls.delete.some(([, key]) => JSON.stringify(key) === '[7,4,"pdf"]'));

  // ---- Кэш открытых книг ----
  const blob = size => ({ size });
  assert.equal(await storage.cacheGet(7, 10, 'pdf', 'v1'), null);
  assert.equal(await storage.cachePut(7, 10, 'pdf', blob(100), 'v1'), true);
  assert.equal((await storage.cacheGet(7, 10, 'pdf', 'v1')).size, 100);
  // Чужой аккаунт на том же устройстве кэш не видит.
  assert.equal(await storage.cacheGet(8, 10, 'pdf', 'v1'), null);
  // Сервер не прислал версию — доверяем кэшу.
  assert.equal((await storage.cacheGet(7, 10, 'pdf')).size, 100);
  // Файл заменили — запись устарела и удалена.
  assert.equal(await storage.cacheGet(7, 10, 'pdf', 'v2'), null);
  assert.equal(cacheRows.has(cacheKey([7, 10, 'pdf'])), false);

  // Файл больше всего лимита не кэшируется.
  const limit = storage.CACHE_LIMIT_BYTES;
  assert.equal(await storage.cachePut(7, 11, 'pdf', blob(limit + 1), 'x'), false);

  // Вытеснение: давно открытая книга уходит первой.
  await storage.cachePut(7, 1, 'pdf', blob(limit * 0.4), 'a');
  await new Promise(resolve => setTimeout(resolve, 5));
  await storage.cachePut(7, 2, 'epub', blob(limit * 0.4), 'b');
  await new Promise(resolve => setTimeout(resolve, 5));
  await storage.cacheGet(7, 1, 'pdf', 'a');   // книгу 1 открыли снова
  await new Promise(resolve => setTimeout(resolve, 5));
  await storage.cachePut(7, 3, 'pdf', blob(limit * 0.4), 'c');
  assert.equal(cacheRows.has(cacheKey([7, 2, 'epub'])), false);
  assert.equal(cacheRows.has(cacheKey([7, 1, 'pdf'])), true);
  assert.equal(cacheRows.has(cacheKey([7, 3, 'pdf'])), true);
  assert.deepEqual(plain(await storage.cacheStats(7)), { count: 2, size: limit * 0.8 });

  await storage.cacheRemove(7, 1);
  assert.equal(cacheRows.has(cacheKey([7, 1, 'pdf'])), false);
  await storage.cachePut(8, 1, 'pdf', blob(10), 'z');
  await storage.cacheClear(7);
  assert.equal((await storage.cacheStats(7)).count, 0);
  assert.equal((await storage.cacheStats(8)).count, 1);

  calls.delete.length = 0;
  await storage.cachePut(7, 4, 'pdf', blob(10), 'q');
  await storage.clearUser(7);
  assert.ok(calls.delete.length >= 3);
  assert.ok(calls.delete.every(([, key]) => key[0] === 7));
  // Удаление аккаунта и выход чистят и кэш открытых книг.
  assert.equal((await storage.cacheStats(7)).count, 0);
  assert.equal((await storage.cacheStats(8)).count, 1);

  await assert.rejects(storage.listAll(null), /userId/);
  assert.deepEqual(calls.deletedStores.sort(), ['books', 'files']);
  assert.deepEqual(plain(calls.created), [
    ['books', ['userId', 'id']],
    ['files', ['userId', 'bookId', 'type']],
    ['cache', ['userId', 'bookId', 'type']],
  ]);

  console.log('Offline storage user isolation tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
