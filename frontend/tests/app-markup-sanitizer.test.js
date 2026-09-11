'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'csp-helpers.js'), 'utf8');

function extractFunction(name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, name + ' must exist');
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error('Unclosed function ' + name);
}

const dom = new JSDOM('<div id="target"></div>', { url: 'https://example.test/' });
const context = {
  document: dom.window.document,
  DOMParser: dom.window.DOMParser,
  Set,
  Array,
  String,
};
vm.createContext(context);
['_sanitizeAppMarkup', 'appMarkupFragment', 'replaceWithAppMarkup', '_iconNode']
  .forEach(name => vm.runInContext(extractFunction(name), context));

const target = dom.window.document.getElementById('target');
context.replaceWithAppMarkup(target, `
  <script>globalThis.pwned = true</script>
  <style>body{display:none}</style>
  <img src="javascript:alert(1)" onerror="alert(2)" data-onerror="replaceWithFallback()">
  <a href="javascript:alert(3)" target="_blank">link</a>
  <iframe srcdoc="<script>alert(4)</script>"></iframe>
  <button data-onclick="navigateTo('home')" data-static-style="safe">Открыть</button>
  <svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"></circle></svg>
`);

assert.equal(target.querySelector('script,style,iframe,object,embed,meta,base,link'), null);
assert.equal(target.querySelector('img').hasAttribute('src'), false);
assert.equal(target.querySelector('img').hasAttribute('onerror'), false);
assert.equal(target.querySelector('img').dataset.onerror, 'replaceWithFallback()');
assert.equal(target.querySelector('a').hasAttribute('href'), false);
assert.equal(target.querySelector('a').getAttribute('rel'), 'noopener noreferrer');
assert.equal(target.querySelector('button').dataset.onclick, "navigateTo('home')");
assert.equal(target.querySelector('svg circle') !== null, true);
assert.equal(context.pwned, undefined);

const icon = context._iconNode('<svg><path onload="alert(1)" d="M0 0"></path></svg>');
assert.equal(icon.tagName.toLowerCase(), 'svg');
assert.equal(icon.querySelector('path').hasAttribute('onload'), false);
assert.doesNotMatch(source, /\.innerHTML\s*=/);
console.log('App markup sanitizer tests passed');
