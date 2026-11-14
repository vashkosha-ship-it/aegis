'use strict';

// Большой EPUB качается с процентом загрузки (readResponseWithProgress).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'reader-core.js'), 'utf8');
const start = source.indexOf('async function readResponseWithProgress');
const end = source.indexOf('\n}\n', start) + 3;
const context = { Uint8Array, Number };
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

function response(parts, length) {
  let i = 0;
  return {
    headers: { get: name => (name === 'content-length' && length != null ? String(length) : null) },
    body: { getReader: () => ({ read: async () => (i < parts.length ? { done: false, value: parts[i++] } : { done: true }) }) },
    arrayBuffer: async () => { throw new Error('не должен вызываться'); },
  };
}

(async () => {
  const parts = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5]), new Uint8Array([6, 7, 8, 9, 10])];
  const seen = [];
  const data = await context.readResponseWithProgress(response(parts, 10), pct => seen.push(pct));
  assert.deepEqual([...new Uint8Array(data)], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(seen, [30, 50, 99]);

  // Сервер не назвал размер — читаем как обычно.
  const plain = { headers: { get: () => null }, body: null, arrayBuffer: async () => new Uint8Array([7]).buffer };
  assert.deepEqual([...new Uint8Array(await context.readResponseWithProgress(plain, () => {}))], [7]);

  // Размер не совпал с заявленным — данные не теряются.
  const longer = await context.readResponseWithProgress(response(parts, 4), () => {});
  assert.deepEqual([...new Uint8Array(longer)], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const shorter = await context.readResponseWithProgress(response(parts.slice(0, 1), 10), () => {});
  assert.deepEqual([...new Uint8Array(shorter)], [1, 2, 3]);
  console.log('Reader EPUB download tests passed');
})().catch(error => { console.error(error); process.exit(1); });
