'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const frontend = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(frontend, name), 'utf8');

const app = read('app.js');
const ar = read('ar-schemes.js');
const assistant = read('assistant-chat.js');
const admin = read('admin-screens.js');
const index = read('index.html');
const sw = read('sw.js');

assert.match(ar, /function openARSchemeMenu\s*\(/);
assert.match(ar, /function renderKillChainScheme\s*\(/);
assert.match(assistant, /function assistantSend\s*\(/);
assert.match(assistant, /function renderAssistantScreen\s*\(/);
assert.match(admin, /function renderAdminPanel\s*\(/);
assert.match(admin, /function startBulkUpload\s*\(/);

assert.doesNotMatch(app, /function openARSchemeMenu\s*\(/);
assert.doesNotMatch(app, /function assistantSend\s*\(/);
assert.doesNotMatch(app, /function renderAdminPanel\s*\(/);

for (const name of ['ar-schemes.js', 'assistant-chat.js', 'admin-screens.js']) {
  assert(
    index.indexOf(`src="${name}"`) < index.indexOf('src="app.js"'),
    `${name} must load before app.js`
  );
  assert(sw.includes(`'/${name}'`), `${name} must be in the PWA precache`);
}

assert(app.split('\n').length < 5000, 'app.js should stay below 5,000 lines after extraction');
console.log('large module extraction tests passed');
