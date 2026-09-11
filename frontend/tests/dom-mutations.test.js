'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '..');
const sources = fs.readdirSync(frontend)
  .filter(name => name.endsWith('.js'))
  .map(name => [name, fs.readFileSync(path.join(frontend, name), 'utf8')]);

let assignments = 0;
for (const [name, source] of sources) {
  assert.doesNotMatch(
    source,
    /\.innerHTML\s*=\s*(['"])\1/,
    `${name} must clear elements with replaceChildren()`,
  );
  assignments += (source.match(/\.innerHTML\s*=/g) || []).length;
}

assert.ok(assignments <= 45, `innerHTML assignment count grew to ${assignments}`);

const arSchemes = sources.find(([name]) => name === 'ar-schemes.js')[1];
const accountSettings = sources.find(([name]) => name === 'account-settings.js')[1];
const readerCore = sources.find(([name]) => name === 'reader-core.js')[1];
assert.match(arSchemes, /titleEl\.textContent\s*=/);
assert.match(accountSettings, /el\.textContent = displayName\.charAt/);
assert.match(readerCore, /pl\.textContent = 'Не удалось загрузить PDF-движок/);

console.log(`safe DOM mutation tests passed (${assignments} innerHTML assignments remain)`);
