'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { groups, readGroup } = require('./helpers/module-source');

const frontend = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(frontend, name), 'utf8');

const app = read('app.js');
const ar = readGroup('ar');
const assistant = read('assistant-chat.js');
const admin = readGroup('admin');
const account = readGroup('account');
const index = read('index.html');
const sw = read('sw.js');

assert.match(ar, /function openARSchemeMenu\s*\(/);
assert.match(ar, /function renderKillChainScheme\s*\(/);
assert.match(assistant, /function assistantSend\s*\(/);
assert.match(assistant, /function renderAssistantScreen\s*\(/);
assert.match(admin, /function renderAdminPanel\s*\(/);
assert.match(admin, /function startBulkUpload\s*\(/);
assert.match(account, /function renderSettingsScreen\s*\(/);
assert.match(account, /function updateAvatar\s*\(/);

assert.doesNotMatch(app, /function openARSchemeMenu\s*\(/);
assert.doesNotMatch(app, /function assistantSend\s*\(/);
assert.doesNotMatch(app, /function renderAdminPanel\s*\(/);

for (const name of [...groups.ar, 'assistant-chat.js', ...groups.admin, ...groups.account]) {
  assert(
    index.indexOf(`src="${name}"`) < index.indexOf('src="app.js"'),
    `${name} must load before app.js`
  );
  assert(sw.includes(`'/${name}'`), `${name} must be in the PWA precache`);
}

for (const name of [...groups.ar, ...groups.admin, ...groups.account]) {
  assert.ok(
    read(name).split('\n').length < 900,
    `${name} should stay below 900 lines after decomposition`,
  );
}

assert(app.split('\n').length < 5000, 'app.js should stay below 5,000 lines after extraction');
console.log('large module extraction tests passed');
