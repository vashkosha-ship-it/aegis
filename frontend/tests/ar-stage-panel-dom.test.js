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
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error('Unclosed function ' + name);
}

const dom = new JSDOM('<div id="arStageDetailContent"></div>');
const context = {
  document: dom.window.document,
  dynamicStyleToken: strings => strings.join(''),
  activeScheme: () => ({ stages: [{}, {}] }),
  switchKillChainTab: () => {},
  openBookFromAR: () => {},
  prevKillChainStage: () => {},
  nextKillChainStage: () => {},
};
vm.createContext(context);
['_arDetailNode', '_arDetailTab', '_arDetailList', '_renderKillChainStageDetails']
  .forEach(name => vm.runInContext(extractFunction(name), context));

const payload = '<img src=x onerror=alert(1)>';
context._renderKillChainStageDetails({
  id: 1,
  metaphor: payload,
  description: payload,
  relatedCategory: payload,
  attacker: [payload],
  defender: [payload],
  defenseTools: [payload],
  defenseMethod: { color: '#123456', code: payload, nameRu: payload },
}, [{ id: 7, title: payload, author: payload }], 1);

const content = dom.window.document.getElementById('arStageDetailContent');
assert.equal(content.querySelector('img'), null);
assert.ok(content.textContent.includes(payload));
assert.equal(content.querySelectorAll('.killchain-tab-btn').length, 3);
assert.equal(content.querySelectorAll('.killchain-tab-content').length, 3);
assert.equal(content.querySelectorAll('[data-static-style="a094"]').length, 1);
assert.equal(content.querySelectorAll('[data-static-style="a098"] button').length, 2);

const renderer = extractFunction('_renderKillChainStageDetails');
assert.doesNotMatch(renderer, /innerHTML/);
assert.doesNotMatch(renderer, /data-onclick/);

const selectStart = source.indexOf('function selectKillChainStage(');
const closeStart = source.indexOf('function closeKillChainStage(');
assert.equal((source.slice(selectStart, closeStart).match(/Обновляем содержимое панели/g) || []).length, 1);
console.log('AR stage panel DOM tests passed');
