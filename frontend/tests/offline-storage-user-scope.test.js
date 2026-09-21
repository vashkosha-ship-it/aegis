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

function makeStore(name) {
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

const stores = new Set(['books', 'files']);
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
    assert.equal(version, 2);
    const request = {};
    queueMicrotask(() => {
      request.result = database;
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

  calls.delete.length = 0;
  await storage.clearUser(7);
  assert.ok(calls.delete.length >= 3);
  assert.ok(calls.delete.every(([, key]) => key[0] === 7));

  await assert.rejects(storage.listAll(null), /userId/);
  assert.deepEqual(calls.deletedStores.sort(), ['books', 'files']);
  assert.deepEqual(plain(calls.created), [
    ['books', ['userId', 'id']],
    ['files', ['userId', 'bookId', 'type']],
  ]);

  console.log('Offline storage user isolation tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
