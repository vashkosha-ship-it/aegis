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
assert.match(reader, /epubBook\.locations\.length\(\)/);
assert.doesNotMatch(reader, /epubTotalPages\s*=\s*location\.total/);
assert.match(admin, /await api\.books\.uploadEpub\(adminBookModalCurrentId, file\)/);
assert.doesNotMatch(admin, /typeof api\.books\.uploadEpub/);

console.log('EPUB API integration tests passed');
