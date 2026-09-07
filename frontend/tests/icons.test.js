'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontendDir = path.join(__dirname, '..');
const iconsSource = fs.readFileSync(path.join(frontendDir, 'icons.js'), 'utf8');
const appSource = fs.readFileSync(path.join(frontendDir, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');
const swSource = fs.readFileSync(path.join(frontendDir, 'sw.js'), 'utf8');

const context = vm.createContext({ window: {} });
vm.runInContext(iconsSource, context);

const icons = context.window.ICONS;
assert.ok(icons && typeof icons === 'object', 'Реестр должен быть доступен как window.ICONS');
assert.ok(Object.keys(icons).length >= 60, 'При извлечении нельзя потерять иконки');

for (const name of ['home', 'book', 'bookmark', 'target', 'settings', 'bookCover']) {
  assert.match(icons[name], /^<svg\b[\s\S]*<\/svg>$/, `Иконка ${name} должна содержать SVG`);
}

assert.doesNotMatch(appSource, /const ICONS\s*=/, 'Реестр SVG не должен оставаться в app.js');
assert.ok(
  indexSource.indexOf('src="icons.js"') < indexSource.indexOf('src="app.js"'),
  'icons.js должен подключаться раньше app.js',
);
assert.match(swSource, /const CACHE_NAME = 'aegis-cache-v212'/);
assert.match(swSource, /'\/icons\.js'/);

console.log('Icons registry tests passed');
