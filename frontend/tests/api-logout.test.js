'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadApi(fetchImpl) {
  const storage = new Map();
  const window = {
    location: { hostname: 'localhost', origin: 'http://localhost:5173' },
  };
  const context = {
    window,
    document: { cookie: 'aegis_csrf=test-csrf' },
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      removeItem: key => storage.delete(key),
    },
    console,
    fetch: fetchImpl,
    FormData,
    decodeURIComponent,
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', 'api.js'), 'utf8');
  vm.runInContext(source, context);
  return window.api;
}

async function main() {
  let requestOptions;
  const api = loadApi(async (_url, options) => {
    requestOptions = options;
    return {
      ok: false,
      status: 503,
      json: async () => ({ detail: 'Не удалось завершить сеанс' }),
    };
  });
  api.tokens.set('access-token');

  await assert.rejects(
    api.logout(),
    error => error.status === 503 && error.detail === 'Не удалось завершить сеанс',
  );
  assert.equal(api.tokens.access, 'access-token', 'локальная сессия должна сохраниться');
  assert.equal(requestOptions.headers['X-CSRF-Token'], 'test-csrf');

  process.stdout.write('api logout regression: ok\n');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
