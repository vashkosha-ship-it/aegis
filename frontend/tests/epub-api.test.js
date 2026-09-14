'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '..');
const api = fs.readFileSync(path.join(frontend, 'api.js'), 'utf8');
const reader = fs.readFileSync(path.join(frontend, 'reader-core.js'), 'utf8');
const admin = fs.readFileSync(path.join(frontend, 'admin-screens.js'), 'utf8');

assert.match(api, /uploadEpub\(id, file\)/);
assert.match(api, /'\/books\/' \+ id \+ '\/epub'/);
assert.match(reader, /api\.request\('\/books\/' \+ b\.id \+ '\/epub'/);
assert.match(reader, /allowScriptedContent:\s*false/);
assert.match(admin, /await api\.books\.uploadEpub\(adminBookModalCurrentId, file\)/);
assert.doesNotMatch(admin, /typeof api\.books\.uploadEpub/);

console.log('EPUB API integration tests passed');
