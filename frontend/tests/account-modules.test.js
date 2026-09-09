'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(frontend, name), 'utf8');

const app = read('app.js');
const auth = read('auth-ui.js');
const account = read('account-settings.js');
const index = read('index.html');
const worker = read('sw.js');

for (const symbol of ['openForgotPassword', 'showVerifyEmailScreen', 'tryAutoLogin']) {
  assert.match(auth, new RegExp(`function ${symbol}\\s*\\(`));
  assert.doesNotMatch(app, new RegExp(`function ${symbol}\\s*\\(`));
}
for (const symbol of ['renderSettingsScreen', 'renderSettingsSecurityTab', 'openEditProfileModal', 'updateAvatar']) {
  assert.match(account, new RegExp(`function ${symbol}\\s*\\(`));
  assert.doesNotMatch(app, new RegExp(`function ${symbol}\\s*\\(`));
}
for (const name of ['auth-ui.js', 'account-settings.js']) {
  assert(index.indexOf(`src="${name}"`) < index.indexOf('src="app.js"'));
  assert(worker.includes(`'/${name}'`));
}
assert(app.split('\n').length < 1800, 'app.js should stay below 1,800 lines');
console.log('account module extraction tests passed');
