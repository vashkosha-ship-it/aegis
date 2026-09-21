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
  assert.equal(api.tokens.access, null, 'access-токен должен удаляться даже при 503');
  assert.equal(requestOptions.headers['X-CSRF-Token'], 'test-csrf');

  let mfaResponse = { mfa_required: true, mfa_token: 'challenge-token' };
  const mfaApi = loadApi(async () => ({
    ok: true,
    status: 200,
    json: async () => mfaResponse,
  }));
  const challenge = await mfaApi.login('admin', 'password');
  assert.equal(challenge.mfa_required, true);
  assert.equal(mfaApi.tokens.access, null, 'challenge ещё не является сессией');

  mfaResponse = { access_token: 'admin-access', recovery_codes: ['AAAA-BBBB'] };
  const verified = await mfaApi.verifyAdminMfa('challenge-token', '123456');
  assert.equal(verified.recovery_codes[0], 'AAAA-BBBB');
  assert.equal(mfaApi.tokens.access, 'admin-access');

  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const progressSource = fs.readFileSync(
    path.join(__dirname, '..', 'reading-progress-sync.js'),
    'utf8',
  );
  const unloadStart = progressSource.indexOf("window.addEventListener('beforeunload'");
  const unloadHandler = progressSource.slice(unloadStart);
  assert.ok(unloadStart >= 0);
  assert.ok(unloadHandler.includes('queueProgress(bookId, p.currentPage, p.totalPages)'));
  assert.ok(unloadHandler.includes('const accessToken = api.tokens.access'));
  assert.ok(!unloadHandler.includes("localStorage.getItem('neon_access_token')"));
  assert.ok(!appSource.includes("window.addEventListener('beforeunload'"));

  process.stdout.write('api logout/progress regressions: ok\n');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
