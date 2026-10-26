'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readGroup } = require('./helpers/module-source');

const frontend = path.resolve(__dirname, '..');
const api = fs.readFileSync(path.join(frontend, 'api.js'), 'utf8');
const reader = fs.readFileSync(path.join(frontend, 'reader-core.js'), 'utf8');
const admin = readGroup('admin');

assert.match(api, /uploadEpub\(id, file\)/);
assert.match(api, /'\/books\/' \+ id \+ '\/epub'/);
assert.match(reader, /api\.request\('\/books\/' \+ b\.id \+ '\/epub'/);
assert.match(reader, /allowScriptedContent:\s*false/);
assert.match(reader, /await book\.ready/);
assert.match(reader, /book\.locations\.length\(\)/);
assert.match(reader, /book\.locations\.cfiFromLocation\(epubCurrentPage - 1\)/);
// Книга показывается до подсчёта страниц: подсчёт по всему тексту занимает
// десятки секунд, и раньше всё это время был пустой экран.
assert.doesNotMatch(reader, /await (?:epubBook|book)\.locations\.generate/);
assert.ok(
  reader.indexOf('await rendition.display(startCfi)')
    < reader.indexOf('generateEpubLocationsInBackground(b, book'),
);
// Готовая нумерация берётся из кэша, место чтения — по CFI устройства.
assert.match(reader, /readBookFromCache\(b, 'locations'\)/);
assert.match(reader, /offlineStorage\.cachePut\(\s*userId, b\.id, 'locations'/);
// locationFromCfi принимает строку CFI, а не объект loc.start.
assert.match(reader, /locationFromCfi\(loc\.start\.cfi\)/);
assert.doesNotMatch(reader, /locationFromCfi\(loc\.start\)/);
assert.doesNotMatch(reader, /epubTotalPages\s*=\s*location\.total/);
assert.match(admin, /await api\.books\.uploadEpub\(adminBookModalCurrentId, file\)/);
assert.doesNotMatch(admin, /typeof api\.books\.uploadEpub/);

console.log('EPUB API integration tests passed');
