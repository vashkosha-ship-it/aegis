'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(frontend, name), 'utf8');
const system = read('design-system.css');
const index = read('index.html');

for (const token of ['--ui-surface', '--ui-border', '--ui-radius-md', '--ui-shadow']) {
  assert.ok(system.includes(token), `missing design token ${token}`);
}
for (const selector of ['.settings-card', '.shortcuts-modal', '.table-wrap', '.mylist-empty']) {
  assert.ok(system.includes(selector), `missing component family ${selector}`);
}
assert.match(system, /\.book-card-compact > \.book-card-open/);
assert.match(system, /\.book-card-compact \.continue-remove/);
assert.doesNotMatch(system, /!important/, 'design system must not add specificity overrides');
assert.ok(
  index.indexOf('href="design-system.css"') > index.indexOf('href="ux-accessibility.css"'),
  'design system must load after compatibility styles'
);

const uxOverrides = ['detail-ux.css', 'ux-accessibility.css']
  .reduce((sum, name) => sum + (read(name).match(/!important/g) || []).length, 0);
assert.equal(uxOverrides, 0, 'new UX layers must not depend on !important');

console.log('design system tests passed');
