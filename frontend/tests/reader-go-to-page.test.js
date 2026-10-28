'use strict';

// Переход на конкретную страницу: «12 / 363» и пункт в «…» открывают окно,
// номер проверяется, переход идёт через goToPage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');
const asScript = code => code.replace(/^'use strict';/m, '');

const dom = new JSDOM('<!doctype html><body><button id="pageIndicatorTop">12 / 363</button></body>', { runScripts: 'outside-only' });
const { window } = dom;
const jumps = [];
const toasts = [];
window.eval(`
  var isEpubMode = false, epubTotalPages = 0, epubCurrentPage = 0, epubLocationsReady = false;
  var pdfTotalPages = 363, pdfCurrentPage = 12;
`);
window.showToast = text => toasts.push(text);
window.eval(asScript(read('dialogs.js')));
window.eval(asScript(read('reader-navigation.js')));
window.goToPage = page => jumps.push(page);

const submit = value => {
  window.openGoToPageDialog();
  const modal = window.document.getElementById('goToPageModal');
  const input = modal.querySelector('#goToPageInput');
  assert.equal(input.value, '12', 'окно открывается с текущей страницей');
  assert.equal(modal.querySelector('.goto-page-total').textContent, 'из 363');
  input.value = value;
  modal.querySelector('form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  return window.document.getElementById('goToPageModal');
};

assert.equal(submit('150'), null, 'после перехода окно закрывается');
assert.deepEqual(jumps, [150]);

let modal = submit('999');
assert.match(modal.querySelector('.goto-page-error').textContent, /от 1 до 363/);
assert.deepEqual(jumps, [150]);
modal.remove();

modal = submit('abc');
assert.match(modal.querySelector('.goto-page-error').textContent, /цифрами/);
modal.remove();

// Ползунок двигает номер.
window.openGoToPageDialog();
modal = window.document.getElementById('goToPageModal');
const slider = modal.querySelector('.goto-page-slider');
slider.value = '300';
slider.dispatchEvent(new window.Event('input'));
assert.equal(modal.querySelector('#goToPageInput').value, '300');
modal.remove();

// Та же страница — без лишнего перехода.
submit('12');
assert.deepEqual(jumps, [150]);

// EPUB, пока страницы считаются: подсказка вместо окна.
window.eval('isEpubMode = true; epubLocationsReady = false;');
window.openGoToPageDialog();
assert.equal(window.document.getElementById('goToPageModal'), null);
assert.match(toasts.at(-1), /считаются/);

// Подключение.
const index = read('index.html');
assert.match(index, /<button type="button" class="page-indicator-top is-clickable" id="pageIndicatorTop"[^>]*data-onclick="openGoToPageDialog\(\)"/);
assert.match(index, /id="btnGoToPage" data-onclick="openGoToPageDialog\(\)" title="Перейти на страницу"/);
assert.match(read('handler-allowlist.js'), /'openGoToPageDialog'/);

console.log('reader go-to-page tests passed');
