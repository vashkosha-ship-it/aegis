'use strict';

// Встроенные стили EPUB переводятся в разрешённый CSP вид, текст не страдает.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'epub-csp-styles.js'), 'utf8')
  + '\nthis.toText = epubMoveInlineStylesInText;', sandbox);

const css = [];
const html = `<html><head><style type="text/css">p { text-indent: 2em; }</style><style> </style></head>
<body><h1 class="t" style="text-align:center">Заголовок</h1>
<p><code>&lt;p style="color:red"&gt;</code></p>
<p STYLE='color: green' id="x">Текст style="не атрибут"</p></body></html>`;
const out = sandbox.toText(html, c => { css.push(c); return `blob:css-${css.length}`; });

assert.deepEqual(css, ['p { text-indent: 2em; }']);
assert.match(out, /<link rel="stylesheet" type="text\/css" href="blob:css-1"\/>/);
assert.doesNotMatch(out, /<style/i);
assert.match(out, /<h1 class="t" data-epub-style="text-align:center">/);
assert.match(out, /<p data-epub-style='color: green' id="x">/);
// Текст и примеры кода — без изменений.
assert.match(out, /<code>&lt;p style="color:red"&gt;<\/code>/);
assert.match(out, /Текст style="не атрибут"/);

const core = fs.readFileSync(path.join(__dirname, '..', 'reader-core.js'), 'utf8');
assert.match(core, /epubCspCleanup = attachEpubCspStyles\(book\)/);
assert.match(core, /attachEpubMovedStylesApply\(rendition\)/);
console.log('epub-csp-styles: ok');
