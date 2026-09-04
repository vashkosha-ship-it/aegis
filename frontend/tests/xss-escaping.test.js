'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

assert.match(
  appSource,
  /\$\{eh\(col\.icon \|\| '📁'\)\}\s+\$\{eh\(col\.name\)\}/,
  'Пользовательские icon и name коллекции должны экранироваться перед innerHTML',
);
assert.doesNotMatch(
  appSource,
  /\$\{col\.icon \|\| '📁'\}/,
  'Иконка коллекции не должна попадать в innerHTML без экранирования',
);

console.log('XSS escaping tests passed');
