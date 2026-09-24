'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(frontend, 'accessibility-themes.css'), 'utf8');
const index = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
const accessibility = fs.readFileSync(path.join(frontend, 'accessibility.js'), 'utf8');
const dom = new JSDOM('<button id="opener">Открыть</button><div id="dialog" role="dialog"><button id="first">Первый</button><button id="last">Последний</button></div>');
const context = vm.createContext({ document: dom.window.document, window: dom.window, setTimeout: fn => { fn(); return 1; } });
vm.runInContext(accessibility, context);

assert.match(css, /color-scheme:\s*dark/);
assert.match(css, /\[data-theme="light"\][\s\S]*color-scheme:\s*light/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);
assert.match(css, /animation-duration:\s*0\.01ms\s*!important/);
assert.match(index, /href="accessibility-themes\.css"/);
assert.match(index, /src="accessibility\.js"/);

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
for (const [foreground, background] of [
  ['#f1f5f9', '#0a0e17'], ['#cbd5e1', '#0a0e17'], ['#94a3b8', '#0a0e17'],
  ['#0f172a', '#f5f7fa'], ['#334155', '#f5f7fa'], ['#475569', '#f5f7fa'],
]) assert.ok(contrast(foreground, background) >= 4.5, `${foreground} needs AA contrast on ${background}`);

const unnamedIconButtons = [...new JSDOM(index).window.document.querySelectorAll('button')]
  .filter(button => button.querySelector('svg') && !button.textContent.trim())
  .filter(button => !button.getAttribute('aria-label') && !button.getAttribute('aria-labelledby') && !button.getAttribute('title'));
assert.deepEqual(unnamedIconButtons.map(button => button.id || button.className), [], 'icon buttons need accessible names');

const opener = dom.window.document.getElementById('opener');
const dialog = dom.window.document.getElementById('dialog');
opener.focus();
context.escapeCalls = 0;
vm.runInContext('activateFocusTrap(document.getElementById("dialog"), { initialFocus: document.getElementById("first"), onEscape: () => { escapeCalls += 1; } })', context);
assert.equal(dom.window.document.activeElement.id, 'first');
dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
assert.equal(context.escapeCalls, 1);
dom.window.document.getElementById('last').focus();
dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
assert.equal(dom.window.document.activeElement.id, 'first');
vm.runInContext('releaseFocusTrap(document.getElementById("dialog"))', context);
assert.equal(dom.window.document.activeElement.id, 'opener');

console.log('Accessibility themes tests passed');
