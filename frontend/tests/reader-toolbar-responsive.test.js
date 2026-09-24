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

assert.match(css, /@media \(max-width: 599\.98px\)/);
assert.match(css, /\.reader-toolbar-secondary\.is-open/);
assert.match(css, /grid-template-columns: repeat\(3, 38px\)/);
assert.match(lifecycle, /initReaderToolbarMenu\(\)/);
assert.match(lifecycle, /aria-expanded/);
assert.match(lifecycle, /e\.key === 'Escape'/);

console.log('Reader toolbar responsive contract passed');
