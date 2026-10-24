'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(frontend, 'css/components/reader-toolbar.css'), 'utf8');
const lifecycle = fs.readFileSync(path.join(frontend, 'reader-lifecycle.js'), 'utf8');
const document = new JSDOM(index).window.document;

const more = document.getElementById('btnReaderMore');
const secondary = document.getElementById('readerToolbarSecondary');
assert.ok(more, 'reader overflow button is required');
assert.equal(more.getAttribute('aria-expanded'), 'false');
assert.equal(more.getAttribute('aria-haspopup'), 'menu');
assert.ok(secondary, 'secondary reader actions must have a menu');
assert.equal(secondary.getAttribute('role'), 'menu');
assert.equal(secondary.querySelectorAll('[role="menuitem"]').length, 6);

// Меню «Ещё» работает на любой ширине, а пункты подписаны текстом из title.
assert.doesNotMatch(css, /@media/);
assert.match(css, /\.reader-toolbar-secondary\.is-open \{ display: flex; \}/);
assert.match(css, /content: attr\(title\)/);
secondary.querySelectorAll('[role="menuitem"]').forEach(item => {
  assert.ok(item.getAttribute('title'), `${item.id} needs a title for its label`);
});
assert.match(lifecycle, /initReaderToolbarMenu\(\)/);
assert.match(lifecycle, /aria-expanded/);
assert.match(lifecycle, /e\.key === 'Escape'/);

console.log('Reader toolbar responsive contract passed');
