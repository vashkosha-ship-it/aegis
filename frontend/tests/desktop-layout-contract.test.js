'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(frontend, name), 'utf8');

const index = read('index.html');
const entrypoint = read('desktop-stability.css');
const shell = read('css/components/responsive-shell.css');
const detail = read('css/components/detail-assistant.css');
const worker = read('sw.js');

const designIndex = index.indexOf('href="design-system.css"');
const stabilityIndex = index.indexOf('href="desktop-stability.css"');
assert.ok(designIndex >= 0, 'design-system.css must be loaded');
assert.ok(
  stabilityIndex > designIndex,
  'desktop-stability.css must be the final canonical style layer',
);

assert.match(
  shell,
  /\.sidebar-item\s*\{[\s\S]*?background:\s*transparent/,
  'native white button backgrounds must not leak into the dark sidebar',
);
assert.match(
  shell,
  /768px\) and \(max-width:\s*1279\.98px\)[\s\S]*?\.sidebar-nav[\s\S]*?display:\s*none\s*!important/,
  'sidebar must not cover tablet content before the desktop offset starts',
);
assert.match(
  shell,
  /@media \(min-width:\s*1280px\)[\s\S]*?margin-left:\s*var\(--desktop-sidebar-width\)\s*!important/,
  'sidebar offset must start at the same breakpoint as the sidebar',
);
assert.match(
  detail,
  /#detailScreen \.detail-content\s*\{[\s\S]*?display:\s*grid/,
  'book sections must remain vertically stacked on desktop',
);
assert.match(
  detail,
  /#detailScreen \.detail-hero\s*\{[\s\S]*?minmax\(0,\s*1fr\)/,
  'book title column must have a non-collapsing grid track',
);
assert.match(detail, /word-break:\s*normal/, 'long titles must wrap by words');
assert.match(
  detail,
  /#detailScreen \.detail-desc\s*\{[\s\S]*?width:\s*100%[\s\S]*?max-width:\s*none/,
  'book description must use the full card width',
);
assert.match(
  detail,
  /#assistantScreen :is\(\.top-header, \.assistant-body\)[\s\S]*?max-width:\s*960px/,
  'assistant toolbar and conversation must share a readable axis',
);
assert.match(entrypoint, /css\/layout-tokens\.css/);
assert.match(entrypoint, /css\/components\/reader-toolbar\.css/);
assert.match(entrypoint, /css\/components\/detail-assistant\.css/);
assert.match(entrypoint, /css\/components\/responsive-shell\.css/);
assert.match(
  worker,
  /const APP_SHELL_URLS\s*=\s*\[[\s\S]*?'\/desktop-stability\.css'/,
  'desktop layout layer must be part of the mandatory app shell',
);

console.log('desktop layout contract tests passed');
