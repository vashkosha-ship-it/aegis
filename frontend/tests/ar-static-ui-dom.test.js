'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(frontend, 'ar-schemes.js'), 'utf8');

function extractFunction(name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, name + ' must exist');
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error('Unclosed function ' + name);
}

const dom = new JSDOM('<div id="arSchemeContainer"></div>');
const timers = [];
const context = {
  document: dom.window.document,
  AR_SCHEMES: {},
  AR_KILL_CHAIN: {},
  arSelectedStage: 1,
  arActiveSchemeCode: '',
  setTimeout: callback => { timers.push(callback); return 1; },
  console,
};
vm.createContext(context);
vm.runInContext(extractFunction('renderARScheme'), context);
vm.runInContext(extractFunction('showZoomIndicator'), context);

context.renderARScheme('<img src=x onerror=alert(1)>');
const container = dom.window.document.getElementById('arSchemeContainer');
assert.equal(container.textContent, 'Схема в разработке');
assert.equal(container.querySelector('img'), null);

context.showZoomIndicator('<img src=x>');
const indicator = dom.window.document.getElementById('zoomIndicator');
assert.equal(indicator.querySelectorAll('svg circle').length, 1);
assert.equal(indicator.querySelectorAll('svg line').length, 3);
assert.equal(indicator.querySelector('span').textContent, '0%');
assert.equal(indicator.querySelector('img'), null);
assert.equal(indicator.querySelector('[data-static-style="a076"]') !== null, true);
timers.forEach(callback => callback());
assert.equal(dom.window.document.getElementById('zoomIndicator'), null);

const renderSource = extractFunction('renderARScheme');
const indicatorSource = extractFunction('showZoomIndicator');
assert.doesNotMatch(renderSource, /innerHTML/);
assert.doesNotMatch(indicatorSource, /innerHTML/);
console.log('AR static UI DOM tests passed');
