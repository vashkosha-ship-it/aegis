'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(frontend, name), 'utf8');
const tokens = read('css/layout-tokens.css');
const entrypoint = read('desktop-stability.css');
const worker = read('sw.js');
const componentFiles = [
  'css/components/reader-toolbar.css',
  'css/components/detail-assistant.css',
  'css/components/responsive-shell.css',
];

for (const token of [
  '--breakpoint-phone', '--breakpoint-tablet', '--breakpoint-desktop',
  '--breakpoint-sidebar', '--breakpoint-wide', '--breakpoint-ultrawide',
  '--z-content', '--z-sticky', '--z-navigation', '--z-overlay', '--z-modal',
  '--z-toast', '--z-critical',
]) assert.match(tokens, new RegExp(`${token}:`), `${token} must be canonical`);

for (const file of componentFiles) {
  const source = read(file);
  assert.ok(entrypoint.includes(file), `${file} must be imported by the final layer`);
  assert.ok(worker.includes(`'/${file}'`), `${file} must be in the atomic app shell`);
  const widths = [...source.matchAll(/@media[^\{]*(?:min|max)-width:\s*([\d.]+)px/g)]
    .map(match => Number.parseFloat(match[1]));
  widths.forEach(width => assert.ok(
    [599.98, 768, 1024, 1279.98, 1280, 1600, 2000].includes(width),
    `${file} uses non-canonical breakpoint ${width}`,
  ));
}

const cssFiles = fs.readdirSync(frontend).filter(name => name.endsWith('.css'));
const legacyImportant = cssFiles.reduce((count, name) => (
  count + (read(name).match(/!important/g) || []).length
), 0);
assert.ok(legacyImportant <= 771, `!important baseline increased: ${legacyImportant}`);

const arbitraryHighZ = cssFiles.flatMap(name => (
  [...read(name).matchAll(/z-index:\s*(\d+)/g)]
    .map(match => ({ name, value: Number(match[1]) }))
    .filter(item => item.value >= 100)
));
assert.deepEqual(arbitraryHighZ, [], 'high z-index values must use semantic tokens');

console.log('CSS architecture contract passed');
