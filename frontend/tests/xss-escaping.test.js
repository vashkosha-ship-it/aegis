'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const annotationsUiSource = fs.readFileSync(
  path.join(__dirname, '..', 'annotations-ui.js'),
  'utf8',
);

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
  annotationsUiSource,
  /function annotationPercent\(value, fallback\)/,
  'Координаты аннотаций должны проходить числовую нормализацию',
);
assert.match(
  annotationsUiSource,
  /function annotationColor\(value\)/,
  'Цвет аннотации должен проверяться перед вставкой в style',
);
assert.doesNotMatch(
  annotationsUiSource,
  /style="[^"]*\$\{a\.position\?/,
  'Значения annotation.position не должны напрямую попадать в style',
);


const favoritesSource = fs.readFileSync(
  path.join(__dirname, '..', 'favorite-categories.js'),
  'utf8',
);

assert.match(
  appSource,
  /renderFavCategories\(\)/,
  'Главная страница должна вызывать renderer избранных категорий',
);
assert.match(
  favoritesSource,
  /function renderFavCategories\(\)/,
  'Renderer избранных категорий должен быть определён в отдельном модуле',
);
assert.match(
  favoritesSource,
  /function getFavCategories\(\)/,
  'Чтение избранных категорий должно быть определено',
);
assert.match(
  favoritesSource,
  /function renderFavCatsPicker\(\)/,
  'Окно выбора категорий должно иметь функцию рендера',
);
assert.doesNotMatch(
  favoritesSource,
  /\.innerHTML\s*=|onclick=/,
  'Избранные категории должны строиться безопасными DOM-операциями',
);
