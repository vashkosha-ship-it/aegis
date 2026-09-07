'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontendDir = path.join(__dirname, '..');
const loaderSource = fs.readFileSync(path.join(frontendDir, 'vendor-loader.js'), 'utf8');
const appSource = fs.readFileSync(path.join(frontendDir, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(frontendDir, 'index.html'), 'utf8');
const swSource = fs.readFileSync(path.join(frontendDir, 'sw.js'), 'utf8');

assert.doesNotMatch(
  appSource,
  /function ensure(?:Pdf|Epub|Chart)Loaded/,
  'Загрузчик vendor-библиотек не должен оставаться в app.js',
);
assert.ok(
  indexSource.indexOf('src="vendor-loader.js"') < indexSource.indexOf('src="app.js"'),
  'vendor-loader.js должен подключаться раньше app.js',
);
assert.match(swSource, /const CACHE_NAME = 'aegis-cache-v212'/);
assert.match(swSource, /'\/vendor-loader\.js'/);

const appended = [];
const links = new Set();
const context = vm.createContext({
  Promise,
  Error,
  document: {
    createElement(tagName) {
      return { tagName };
    },
    querySelector(selector) {
      const match = selector.match(/^link\[href="(.+)"\]$/);
      return match && links.has(match[1]) ? {} : null;
    },
    head: {
      appendChild(element) {
        appended.push(element);
        if (element.href) links.add(element.href);
      },
    },
  },
});

vm.runInContext(loaderSource, context);

const pdfPromise = vm.runInContext('ensurePdfLoaded()', context);
const pdfScript = appended.find((element) => element.src === 'vendor/pdf.min.js');
assert.ok(pdfScript, 'ensurePdfLoaded должен добавить pdf.min.js');
context.pdfjsLib = { GlobalWorkerOptions: {} };
pdfScript.onload();

pdfPromise.then(() => {
  assert.equal(context.pdfjsLib.GlobalWorkerOptions.workerSrc, 'vendor/pdf.worker.min.js');
  assert.equal(
    appended.filter((element) => element.href === 'vendor/pdf_viewer.min.css').length,
    1,
    'CSS просмотрщика PDF должен подключаться один раз',
  );
  return vm.runInContext('ensurePdfLoaded()', context);
}).then(() => {
  assert.equal(
    appended.filter((element) => element.src === 'vendor/pdf.min.js').length,
    1,
    'Уже загруженный pdf.js не должен подключаться повторно',
  );
  assert.equal(
    appended.filter((element) => element.href === 'vendor/pdf_viewer.min.css').length,
    1,
    'CSS просмотрщика PDF не должен дублироваться',
  );
  console.log('Vendor loader tests passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
