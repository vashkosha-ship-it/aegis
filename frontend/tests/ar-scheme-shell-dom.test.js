'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'ar-schemes.js'), 'utf8');

function extractFunction(name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, name + ' must exist');
  const brace = source.indexOf(') {', start) + 2;
  assert.ok(brace > 1, name + ' body must exist');
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error('Unclosed function ' + name);
}

function createContext() {
  const dom = new JSDOM('<div id="arSchemeContainer"></div>');
  const malicious = '<img src=x onerror=alert(1)>';
  const stage = {
    id: 1,
    code: malicious,
    name: malicious,
    nameRu: malicious,
    defenseMethod: { color: '#123456' },
  };
  const context = {
    document: dom.window.document,
    AR_IR: { stages: [stage] },
    AR_OWASP: { stages: [stage] },
    AR_OSI: { stages: [stage] },
    AR_MITRE: { stages: [stage, { ...stage, id: 2 }] },
    AR_NIST: { stages: [stage, { ...stage, id: 2 }] },
    AR_DID: { stages: [stage, { ...stage, id: 2 }] },
    AR_STRIDE: { stages: [stage] },
    dynamicStyleToken: strings => strings.join(''),
    zoomARScheme() {},
    resetARSchemeZoom() {},
    toggleStageDetailsPanel() {},
    selectKillChainStage() {},
    initStageDetailsSwipe() {},
    initARPan() {},
    setTimeout(callback) { callback(); return 1; },
    localStorage: { getItem() { return 'attack'; } },
    window: { innerWidth: 1024, innerHeight: 768 },
    console,
    activeScheme() { return { stages: [stage, { ...stage, id: 2 }] }; },
    isKillChainStageStudied() { return false; },
    setKillChainViewMode() {},
    arViewMode: 'attack',
    currentARSchemeZoom: 1,
  };
  vm.createContext(context);
  ['_arDetailNode', '_arSvgElement', '_createArSchemeShell', 'renderIrScheme', 'renderStrideScheme', 'renderGenericScheme', 'renderOwaspScheme', 'renderOsiScheme', 'renderMitreScheme', 'renderNistScheme', 'renderDidScheme', 'renderKillChainScheme', 'renderOwaspScheme', 'renderOsiScheme', 'renderMitreScheme']
    .forEach(name => vm.runInContext(extractFunction(name), context));
  return { dom, context, malicious, stage };
}

for (const renderer of [
  ({ context }) => context.renderIrScheme(),
  ({ context }) => context.renderStrideScheme(),
  ({ context, stage }) => context.renderGenericScheme({ stages: [stage] }),
  ({ context }) => context.renderOwaspScheme(),
  ({ context }) => context.renderOsiScheme(),
  ({ context }) => context.renderMitreScheme(),
]) {
  const setup = createContext();
  renderer(setup);
  const container = setup.dom.window.document.getElementById('arSchemeContainer');
  assert.equal(container.querySelector('img'), null);
  assert.ok(container.textContent.includes(setup.malicious));
  assert.equal(container.querySelectorAll('#arStageDetails').length, 1);
  assert.equal(container.querySelectorAll('#arStageToggleBtn svg polyline').length, 1);
  assert.equal(container.querySelectorAll('#killChainNodes button').length >= 1, true);
}

for (const name of ['_createArSchemeShell', 'renderIrScheme', 'renderStrideScheme', 'renderGenericScheme']) {
  const body = extractFunction(name);
  assert.doesNotMatch(body, /innerHTML/);
  assert.doesNotMatch(body, /data-onclick/);
}
for (const renderer of [
  ({ context }) => context.renderNistScheme(),
  ({ context }) => context.renderDidScheme(),
]) {
  const setup = createContext();
  renderer(setup);
  const container = setup.dom.window.document.getElementById('arSchemeContainer');
  assert.equal(container.querySelector('img'), null);
  assert.ok(container.textContent.includes(setup.malicious));
  assert.equal(container.querySelectorAll('#killChainNodes svg').length, 1);
  assert.equal(container.querySelectorAll('#arStageToggleBtn svg polyline').length, 1);
}

for (const name of ['_arSvgElement', 'renderNistScheme', 'renderDidScheme']) {
  const body = extractFunction(name);
  assert.doesNotMatch(body, /innerHTML/);
  assert.doesNotMatch(body, /data-onclick/);
}
{
  const setup = createContext();
  setup.context.renderKillChainScheme();
  const container = setup.dom.window.document.getElementById('arSchemeContainer');
  assert.equal(container.querySelector('img'), null);
  assert.ok(container.textContent.includes(setup.malicious));
  assert.equal(container.querySelectorAll('.ar-killchain-node').length, 2);
  assert.equal(container.querySelectorAll('.ar-stage-item').length, 2);
  assert.equal(container.querySelectorAll('.ar-stage-name').length, 2);
  assert.equal(container.querySelectorAll('.ar-chain-link').length, 1);
  assert.equal(container.querySelectorAll('[data-onclick]').length, 0);
}
const killChainSource = extractFunction('renderKillChainScheme');
assert.doesNotMatch(killChainSource, /innerHTML/);
assert.doesNotMatch(killChainSource, /data-onclick/);
assert.doesNotMatch(source, /\.innerHTML\s*=/);
console.log('AR scheme shell DOM tests passed');
