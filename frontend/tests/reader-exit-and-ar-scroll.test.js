'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');

// Выход из книги останавливает отрисовку: тяжёлая обложка (JPEG на 5 МБ)
// иначе декодируется дальше, и приложение подвисает после «назад».
const core = read('reader-core.js');
const lifecycle = read('reader-lifecycle.js');
assert.match(core, /function stopPdfRendering\s*\(/);
assert.match(core, /_pdfBackgroundTasks\.forEach\(task =>/);
assert.ok(
  lifecycle.indexOf('stopPdfRendering()') < lifecycle.indexOf('setReaderFocusMode(false)'),
  'отрисовка должна останавливаться первым делом',
);
// После медленной страницы соседние не готовим заранее.
assert.match(core, /performance\.now\(\) - renderStartedAt < 1500/);

// Панель этапа на схемах: содержимое открытой панели прокручивается,
// шторку тянут за шапку или вниз от верха списка.
const ar = read('ar-schemes-interactions.js');
assert.match(ar, /function _isInDetailsHeader\s*\(/);
assert.match(ar, /detailsPanelOpen && !detailsTouchFromHeader && deltaY < 0/);
assert.match(ar, /detailsPanelIsDragging = !\(detailsPanelOpen && scrolled && !detailsTouchFromHeader\)/);

console.log('reader exit and AR scroll tests passed');
