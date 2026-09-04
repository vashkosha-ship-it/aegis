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

assert.match(
  appSource,
  /function annotationPercent\(value, fallback\)/,
  'Координаты аннотаций должны проходить числовую нормализацию',
);
assert.match(
  appSource,
  /function annotationColor\(value\)/,
  'Цвет аннотации должен проверяться перед вставкой в style',
);
assert.doesNotMatch(
  appSource,
  /style="[^"]*\$\{a\.position\?/,
  'Значения annotation.position не должны напрямую попадать в style',
);
