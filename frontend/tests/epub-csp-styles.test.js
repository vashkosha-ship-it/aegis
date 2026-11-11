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

// Битое оглавление: если файла оглавления нет, epub.js строит пустое.
(async () => {
  const calls = [];
  const proto = { kind: 'packaging' };
  const packaging = Object.assign(Object.create(proto), { navPath: 'toc01.xhtml', ncxPath: undefined, toc: undefined, manifest: {} });
  const book = {
    loadNavigation(p) {
      calls.push(p.navPath || 'none');
      return p.navPath ? Promise.reject(new Error('File not found in the epub: /OEBPS/toc01.xhtml')) : Promise.resolve('empty-nav');
    },
  };
  const ctx = { console: { info() {} } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'epub-csp-styles.js'), 'utf8') + '\nthis.harden = hardenEpubBook;', ctx);
  ctx.harden(book);
  const nav = await book.loadNavigation(packaging);
  assert.equal(nav, 'empty-nav');
  assert.deepEqual(calls, ['toc01.xhtml', 'none']);
  assert.equal(packaging.navPath, 'toc01.xhtml'); // исходное описание не трогаем
  const core = fs.readFileSync(path.join(__dirname, '..', 'reader-core.js'), 'utf8');
  assert.match(core, /hardenEpubBook\(book\)/);
  console.log('epub broken toc: ok');
})().catch(e => { console.error(e); process.exit(1); });
