'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'reader-theme.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM('<main id="readerScreen"></main><button id="btnReaderTheme"></button>', { url: 'https://aegis.test/' });
const registered = [];
const selected = [];
const toasts = [];
const warnings = [];
const context = {
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  ICONS: { theme: '<svg id="theme-icon"></svg>' },
  replaceWithTrustedIcon: (container, markup) => {
    const parsed = new dom.window.DOMParser().parseFromString(markup, 'image/svg+xml');
    container.replaceChildren(dom.window.document.importNode(parsed.documentElement, true));
  },
  epubRendition: {
    themes: {
      register: (...args) => registered.push(args),
      select: name => selected.push(name),
    },
  },
  showToast: message => toasts.push(message),
  console: { warn: (...args) => warnings.push(args) },
};
vm.createContext(context);
vm.runInContext(source, context);

assert.equal(context.getReaderTheme(), 'light');
context.applyReaderTheme('dark');
assert.ok(dom.window.document.getElementById('readerScreen').classList.contains('reader-theme-dark'));
assert.equal(dom.window.document.getElementById('btnReaderTheme').title, 'Светлая тема');
assert.ok(dom.window.document.getElementById('theme-icon'));
assert.equal(registered.length, 2);
assert.equal(selected.at(-1), 'aegis-dark');

context.toggleReaderTheme();
assert.equal(context.localStorage.getItem('aegis_reader_theme'), 'dark');
assert.equal(toasts.at(-1), 'Тёмная тема');
context.toggleReaderTheme();
assert.equal(context.getReaderTheme(), 'light');
assert.ok(!dom.window.document.getElementById('readerScreen').classList.contains('reader-theme-dark'));
assert.equal(selected.at(-1), 'aegis-light');
assert.equal(toasts.at(-1), 'Светлая тема');

context.epubRendition.themes.register = () => { throw new Error('disposed'); };
assert.doesNotThrow(() => context.applyReaderTheme('dark'));
assert.equal(warnings.length, 1);
assert.doesNotMatch(source, /\.innerHTML\s*=/);

assert.doesNotMatch(appSource, /function getReaderTheme|function toggleReaderTheme/);
assert.ok(indexSource.indexOf('reader-theme.js') < indexSource.indexOf('app.js'));
assert.match(workerSource, /['"]\/reader-theme\.js['"]/);
console.log('Reader theme tests passed');
