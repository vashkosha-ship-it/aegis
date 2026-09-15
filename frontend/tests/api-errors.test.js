'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const window = {
  location: { hostname: 'localhost', origin: 'http://localhost:5173' },
};
const context = {
  window,
  document: { cookie: 'aegis_csrf=test' },
  localStorage: { getItem: () => null, removeItem: () => {} },
  console,
  FormData,
  decodeURIComponent,
  fetch: async () => ({
    ok: false,
    status: 422,
    json: async () => ({
      detail: [{ loc: ['body', 'icon'], msg: 'String should have at most 64 characters' }],
    }),
  }),
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.resolve(__dirname, '..', 'api.js'), 'utf8'),
  context,
);

(async () => {
  window.api.tokens.set('opaque-test-token');
  await assert.rejects(
    window.api.books.create({ title: 'Book' }),
    error => error.status === 422
      && error.detail === 'icon: String should have at most 64 characters'
      && Array.isArray(error.rawDetail),
  );
  console.log('API error formatting tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
