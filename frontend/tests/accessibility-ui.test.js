'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(frontend, 'ux-accessibility.css'), 'utf8');
const dom = new JSDOM(index);
const document = dom.window.document;

for (const selector of ['.sidebar-item', '.nav-item', '.ai-quick-chip', '.profile-avatar-lg']) {
  document.querySelectorAll(selector).forEach(control => {
    assert.equal(control.tagName, 'BUTTON', selector + ' must use native buttons');
    assert.equal(control.type, 'button');
  });
}

const nonSemanticControls = [...document.querySelectorAll('div[data-onclick], span[data-onclick]')]
  .filter(node => !node.classList.contains('overlay'));
assert.equal(nonSemanticControls.length, 0, 'main UI must not use clickable divs or spans');
assert.equal(document.querySelectorAll('.nav-item[aria-current="page"]').length, 1);
assert.equal(document.querySelectorAll('#detailTabs [role="tab"]').length, 5);
assert.equal(document.querySelectorAll('[role="tabpanel"]').length, 5);
assert.match(styles, /:focus-visible/);
assert.match(styles, /font-size: 16px !important/);

for (const file of ['training-screen.js', 'home-recommendations.js', 'home-catalog.js',
  'reviews-core.js', 'annotations-ui.js', 'also-read.js', 'reader-toc.js']) {
  const source = fs.readFileSync(path.join(frontend, file), 'utf8');
  assert.doesNotMatch(source, /<(?:div|span)[^>]*data-onclick/,
    file + ' must not create non-semantic controls');
}

console.log('Accessibility UI tests passed');
