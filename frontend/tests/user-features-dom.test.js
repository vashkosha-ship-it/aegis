'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(frontend, 'user-features.js'), 'utf8');
const dom = new JSDOM(`
  <div id="detailTabNotes"></div>
  <button class="detail-tab" data-dtab="notes"></button>
`);
const icon = '<svg viewBox="0 0 10 10"></svg>';
const annotations = [{
  id: 5,
  type: 'note',
  page: '<img src=x onerror=alert(1)>',
  text: '<script>alert(1)</script>',
  note: '<svg onload=alert(1)>',
  date: '2026-09-10T00:00:00Z',
  position: { cfi: "epubcfi('/6/2')" },
}];
const context = {
  window: dom.window,
  document: dom.window.document,
  DOMParser: dom.window.DOMParser,
  state: {},
  currentBookId: 7,
  ICONS: { bookmark: icon, trash: icon },
  appendTrustedIcon: container => container.appendChild(dom.window.document.createElement('svg')),
  dynamicStyleToken: () => 'test-style',
  showListSkeleton: () => {},
  getAnnotations: async () => annotations,
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  const modal = context.certModalShell('<div>&lt;img src=x onerror=alert(1)&gt;</div>');
  assert.match(modal.textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(modal.querySelector('img'), null);

  await context.renderDetailNotes();
  const notes = dom.window.document.getElementById('detailTabNotes');
  assert.match(notes.textContent, /<script>alert\(1\)<\/script>/);
  assert.match(notes.textContent, /<svg onload=alert\(1\)>/);
  assert.equal(notes.querySelector('script, img, svg[onload]'), null);
  assert.equal(notes.querySelectorAll('[onclick], [data-onclick], [data-nonce]').length, 0);
  assert.equal(notes.querySelector('[data-static-style="a245"]').textContent, '1');
  assert.match(dom.window.document.querySelector('[data-dtab="notes"]').textContent, /\(1\)/);

  const shellSource = source.slice(
    source.indexOf('function certModalShell'),
    source.indexOf('function closeCertModal'),
  );
  const notesSource = source.slice(
    source.indexOf('async function renderDetailNotes'),
  );
  assert.doesNotMatch(shellSource, /innerHTML/);
  assert.doesNotMatch(notesSource, /innerHTML/);
  console.log('User certification and notes DOM tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
