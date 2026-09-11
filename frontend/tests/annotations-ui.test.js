'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'annotations-ui.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM('<div id="pdfViewport"><div id="annotationLayer"></div></div>');
const annotations = [
  { id: 1, type: 'highlight', text: '<опасный>', note: '', page: 3, position: { x: -5, y: 120, w: 35, h: 4, color: '#12abEF' } },
  { id: 2, type: 'note', text: 'фрагмент', note: '<заметка>', page: 3, position: { x: 25, y: 30 } },
  { id: 3, type: 'note', text: 'другая', note: 'страница', page: 4, position: {} },
];
const apiCalls = [];
const toasts = [];
let prompt = null;
let renders = 0;
let deleteResult = true;
const dynamicStyles = [];
const captureDynamicStyle = (strings, ...values) => {
  const value = strings.reduce((result, part, index) => result + part + (index < values.length ? values[index] : ''), '');
  dynamicStyles.push(value);
  return `test-style-${dynamicStyles.length}`;
};

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const context = {
  replaceWithAppMarkup(target, markup) { target.innerHTML = markup; },
  document: dom.window.document,
  dynamicStyleToken: captureDynamicStyle,
  api: { library: {
    addAnnotation: async (...args) => apiCalls.push(['add', ...args]),
    deleteAnnotation: async (...args) => apiCalls.push(['delete', ...args]),
  } },
  currentBookId: 42,
  pdfCurrentPage: 3,
  isEpubMode: false,
  getAnnotations: async () => annotations,
  deleteAnnotation: async () => deleteResult,
  showPromptModal: options => { prompt = options; },
  showToast: message => toasts.push(message),
  sensitiveNonce: () => 'ui-nonce',
  eh: escapeHtml,
  ICONS: { bookmark: 'B', trash: 'X' },
  console,
};
vm.createContext(context);
vm.runInContext('const annotationsCache = { 42: [] };', context);
vm.runInContext(source, context);

(async () => {
  assert.equal(context.annotationPercent(-5, 10), 0);
  assert.equal(context.annotationPercent(120, 10), 100);
  assert.equal(context.annotationPercent('bad', 15), 15);
  assert.equal(context.annotationColor('#12abEF'), '#12abEF');
  assert.equal(context.annotationColor('red'), '#fbbf24');

  await context.renderAnnotations();
  const layer = dom.window.document.getElementById('annotationLayer');
  assert.equal(layer.children.length, 2);
  assert.match(dynamicStyles[0], /left:0%/);
  assert.match(dynamicStyles[0], /top:100%/);
  const highlight = layer.querySelector('.highlight-mark');
  assert.equal(highlight.getAttribute('title'), '<опасный>');
  assert.equal(layer.querySelector('опасный'), null);

  await context.showAnnotationDetail(1);
  let tooltip = dom.window.document.querySelector('.note-tooltip');
  assert.ok(tooltip);
  assert.match(tooltip.innerHTML, /data-nonce="ui-nonce"/);
  assert.match(tooltip.innerHTML, /convertToNote\(1\)/);

  await context.showNoteTooltip(2);
  tooltip = dom.window.document.querySelector('.note-tooltip');
  assert.match(tooltip.innerHTML, /&lt;заметка&gt;/);

  await context.convertToNote(1);
  assert.equal(prompt.title, 'Заметка');
  assert.equal(prompt.confirmText, 'Сохранить');

  const originalRender = context.renderAnnotations;
  context.renderAnnotations = async () => { renders += 1; };
  await context.convertToNoteSave(annotations[0], '  новая заметка  ');
  assert.equal(apiCalls[0][0], 'add');
  assert.equal(apiCalls[0][1], 42);
  assert.equal(apiCalls[0][2].type, 'note');
  assert.equal(apiCalls[0][2].page, 3);
  assert.equal(apiCalls[0][2].selected_text, '<опасный>');
  assert.equal(apiCalls[0][2].note_text, 'новая заметка');
  assert.equal(apiCalls[0][2].position, annotations[0].position);
  assert.deepEqual(apiCalls[1], ['delete', 1]);
  assert.equal(renders, 1);
  assert.ok(toasts.includes('Заметка сохранена!'));
  context.renderAnnotations = originalRender;

  await context.showNoteTooltip(2);
  tooltip = dom.window.document.querySelector('.note-tooltip');
  const button = tooltip.querySelector('button');
  assert.equal(await context.deleteAnnotationFromTooltip(42, 2, 1, button), true);
  assert.equal(dom.window.document.querySelector('.note-tooltip'), null);

  await context.showNoteTooltip(2);
  deleteResult = false;
  tooltip = dom.window.document.querySelector('.note-tooltip');
  assert.equal(await context.deleteAnnotationFromTooltip(42, 2, 1, tooltip.querySelector('button')), false);
  assert.ok(dom.window.document.querySelector('.note-tooltip'));

  assert.doesNotMatch(appSource, /function annotationPercent|async function renderAnnotations|async function showNoteTooltip|async function convertToNote/);
  assert.ok(indexSource.indexOf('annotations-core.js') < indexSource.indexOf('annotations-ui.js'));
  assert.ok(indexSource.indexOf('annotations-ui.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /const CACHE_NAME = 'aegis-cache-v\d+'/);
  assert.match(workerSource, /['"]\/annotations-ui\.js['"]/);
  console.log('Annotations UI tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
