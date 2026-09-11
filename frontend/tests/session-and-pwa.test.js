'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '..');
const api = fs.readFileSync(path.join(frontend, 'api.js'), 'utf8');
const boot = fs.readFileSync(path.join(frontend, 'inline-boot.js'), 'utf8');
const index = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');

assert.match(api, /accessTokenNeedsRefresh/);
assert.match(api, /if \(_refreshPromise\) return _refreshPromise/);
assert.match(api, /throw new ApiError\(401, 'Сессия завершена/);
assert.match(boot, /reg\.update\(\)\.catch/);
assert.doesNotMatch(boot, /^\s*reg\.update\(\);/m);

for (const id of ['avatarHome', 'avatarMylist', 'avatarTraining']) {
  assert.doesNotMatch(index, new RegExp(`id=["']${id}["']`));
}
assert.equal((index.match(/data-screen="profile"/g) || []).length, 2,
  'profile remains available in desktop sidebar and bottom navigation');
assert.match(index, /id="bulkGenerateDescriptions" checked/);

console.log('Session, PWA and navigation tests passed');
