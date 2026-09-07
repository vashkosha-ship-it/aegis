'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { TextEncoder, TextDecoder } = require('node:util');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'notes-crypto.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');
const warnings = [];

const context = {
  crypto: webcrypto,
  TextEncoder,
  TextDecoder,
  btoa: value => Buffer.from(value, 'binary').toString('base64'),
  atob: value => Buffer.from(value, 'base64').toString('binary'),
  console: { ...console, warn: (...args) => warnings.push(args) },
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  assert.equal(await context.encryptNote('без ключа'), 'без ключа');
  assert.equal(await context.decryptNote('обычный текст'), 'обычный текст');
  assert.equal(await context.decryptNote(null), null);

  await context.deriveNoteKey('correct horse battery staple', 'alice');
  const encrypted = await context.encryptNote('секретная заметка');
  assert.match(encrypted, /^enc:v1:[A-Za-z0-9+/]+=*$/);
  assert.doesNotMatch(encrypted, /секретная заметка/);
  assert.equal(await context.decryptNote(encrypted), 'секретная заметка');

  const second = await context.encryptNote('секретная заметка');
  assert.notEqual(second, encrypted, 'случайный IV должен менять шифротекст');

  await context.deriveNoteKey('correct horse battery staple', 'bob');
  assert.equal(await context.decryptNote(encrypted), '🔒 (не удалось расшифровать)');
  assert.ok(warnings.some(args => String(args[0]).includes('Ошибка расшифровки')));

  context.clearNoteKey();
  assert.equal(
    await context.decryptNote(encrypted),
    '🔒 (зашифровано — войдите заново для просмотра)'
  );

  assert.doesNotMatch(appSource, /const NOTE_ENC_PREFIX|function clearNoteKey|async function encryptNote|async function decryptNote/);
  assert.ok(indexSource.indexOf('notes-crypto.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /const CACHE_NAME = 'aegis-cache-v\d+'/);
  assert.match(workerSource, /['"]\/notes-crypto\.js['"]/);
  console.log('Notes crypto tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
