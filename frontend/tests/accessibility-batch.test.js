'use strict';

// Проверка окон (обход всего документа + вычисленные стили) запускается
// один раз на пачку изменений DOM, а не на каждый добавленный элемент:
// при 1880 книгах экран «Тестирование» открывался 9 секунд.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'accessibility.js'), 'utf8');
let dialogScans = 0;
let observerCallback = null;
const listeners = {};
const element = () => ({
  nodeType: 1,
  matches: () => false,
  querySelectorAll: () => [],
});
const context = {
  Node: { ELEMENT_NODE: 1 },
  window: {},
  document: {
    body: {},
    addEventListener: (name, fn) => { listeners[name] = fn; },
    querySelectorAll: selector => {
      if (selector.includes('[id$="Modal"]')) dialogScans += 1;
      return [];
    },
  },
  MutationObserver: class {
    constructor(callback) { observerCallback = callback; }
    observe() {}
  },
  getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
};
vm.createContext(context);
vm.runInContext(source, context);
listeners.DOMContentLoaded();

dialogScans = 0;
const added = Array.from({ length: 1880 }, element);
observerCallback([{ type: 'childList', addedNodes: added }]);
assert.equal(dialogScans, 1, `проверок окон: ${dialogScans}`);

console.log('Accessibility batching tests passed');
