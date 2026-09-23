'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(frontend, name), 'utf8');
const styles = read('styles.css');
const accessibilityCss = `${styles}\n${read('ux-accessibility.css')}`;
const accessibilityJs = read('accessibility.js');
const index = read('index.html');
const worker = read('sw.js');

function color(source, scopePattern, name) {
  const scope = source.match(scopePattern)?.[0] || '';
  const value = scope.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
  assert.ok(value, `${name} must be declared`);
  return value;
}

function rgb(hex) {
  return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
}

function luminance(hex) {
  return rgb(hex)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

const dark = styles.match(/:root\s*\{[\s\S]*?\}/)[0];
const light = styles.match(/\[data-theme="light"\]\s*\{[\s\S]*?\}/)[0];
assert.ok(contrast(color(dark, /[\s\S]*/, '--text-muted'), '#151a23') >= 4.5);
assert.ok(contrast(color(light, /[\s\S]*/, '--text-muted'), '#ffffff') >= 4.5);
assert.ok(contrast(color(light, /[\s\S]*/, '--accent'), '#ffffff') >= 4.5);

assert.match(accessibilityCss, /\*, \*::before, \*::after/);
assert.match(accessibilityCss, /animation-duration: \.01ms !important/);
assert.match(accessibilityCss, /transition-duration: \.01ms !important/);
assert.match(accessibilityJs, /event\.key === 'Escape'/);
assert.match(accessibilityJs, /event\.key !== 'Tab'/);
assert.match(accessibilityJs, /returnFocus/);
assert.match(accessibilityJs, /MutationObserver/);
assert.ok(index.includes('src="accessibility.js"'));
assert.ok(worker.includes("'/accessibility.js'"));

const dom = new JSDOM(index, { runScripts: 'outside-only', pretendToBeVisual: true });
dom.window.eval(accessibilityJs);
dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
dom.window.aegisAccessibility.enhance();

const unnamed = [...dom.window.document.querySelectorAll('button')].filter(button => {
  const text = (button.textContent || '').replace(/[←→✕×+−⋮]/gu, '').trim();
  return !text && !button.getAttribute('aria-label')
    && !button.getAttribute('aria-labelledby') && !button.title;
});
assert.deepEqual(unnamed.map(button => button.id || button.className), []);

const opener = dom.window.document.createElement('button');
opener.textContent = 'Открыть';
dom.window.document.body.appendChild(opener);
opener.focus();
const dialog = dom.window.document.createElement('div');
dialog.id = 'testModal';
dialog.innerHTML = '<h2>Проверка</h2><button id="first">Первый</button><button id="last">Закрыть</button>';
dom.window.document.body.appendChild(dialog);
dom.window.aegisAccessibility.syncDialogs();
assert.equal(dialog.getAttribute('role'), 'dialog');
assert.equal(dialog.getAttribute('aria-modal'), 'true');
assert.equal(dom.window.document.activeElement.id, 'first');
dom.window.document.getElementById('last').focus();
dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
assert.equal(dom.window.document.activeElement.id, 'first');

console.log('Accessibility and theme contract passed');
