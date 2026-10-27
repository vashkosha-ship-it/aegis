'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readGroup } = require('./helpers/module-source');

const frontend = path.resolve(__dirname, '..');
const admin = readGroup('admin');
const api = fs.readFileSync(path.join(frontend, 'api.js'), 'utf8');
const markup = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');

assert.match(api, /indexStatus\(id\).*\/index-status/);
assert.match(admin, /function bookIndexStatusText\s*\(/);
assert.match(admin, /function renderBookIndexStatus\s*\(/);
assert.match(admin, /function retryBookIndexing\s*\(/);
assert.ok(admin.includes("(book.indexing_status || 'not_indexed') !== 'succeeded'"));
// Ручная индексация доступна и для книг «в очереди» (после массовой
// индексации очередь бывает в тысячи задач).
assert.ok(admin.includes('retry.disabled = !hasFile;'));
assert.match(markup, /id="adminIndexStatus"/);
assert.match(markup, /id="adminReindexBookBtn"/);

console.log('persistent indexing status tests passed');
