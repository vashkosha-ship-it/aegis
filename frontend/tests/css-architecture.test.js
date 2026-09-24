'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(frontend, name), 'utf8');
const tokens = read('css/layout-tokens.css');
const entrypoint = read('desktop-stability.css');
const worker = read('sw.js');
const componentFiles = fs.readdirSync(path.join(frontend, 'css/components'))
  .filter(name => name.endsWith('.css'))
  .sort()
  .map(name => `css/components/${name}`);
const importantBaseline = JSON.parse(read('css/important-baseline.json'));

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

const cssFiles = [
  ...fs.readdirSync(frontend).filter(name => name.endsWith('.css')),
  'css/layout-tokens.css',
  ...componentFiles,
].sort();
for (const file of cssFiles) {
  const count = (read(file).match(/!important/g) || []).length;
  const limit = importantBaseline[file] || 0;
  assert.ok(count <= limit, `${file}: !important increased ${count} > ${limit}`);
}
for (const file of Object.keys(importantBaseline)) {
  assert.ok(cssFiles.includes(file), `stale !important baseline: ${file}`);
}
const currentImportant = cssFiles.reduce((sum, file) => (
  sum + (read(file).match(/!important/g) || []).length
), 0);
const importantLimit = Object.values(importantBaseline).reduce((sum, count) => sum + count, 0);
assert.ok(currentImportant <= importantLimit, `total !important increased: ${currentImportant}`);

const arbitraryHighZ = cssFiles.flatMap(file => (
  [...read(file).matchAll(/z-index:\s*(\d+)/g)]
    .map(match => ({ file, value: Number(match[1]) }))
    .filter(item => item.value >= 100)
));
assert.deepEqual(arbitraryHighZ, [], 'high z-index values must use semantic tokens');

const importOwners = cssFiles.filter(file => /@import\s/.test(read(file)));
assert.deepEqual(importOwners, ['desktop-stability.css'], 'only final CSS entrypoint may import components');

console.log(`CSS architecture contract passed: ${componentFiles.length} components, ${currentImportant}/${importantLimit} !important`);
