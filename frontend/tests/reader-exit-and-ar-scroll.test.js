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

// Панель этапа на схемах: появляется только при выборе этапа, раскладку
// задаёт CSS (не скрипт) — поворот экрана её не ломает; закрывается ✕,
// касанием мимо, смахиванием вниз и Esc.
const ar = read('ar-schemes-interactions.js');
const arCss = read('ar-schemes.css');
assert.match(ar, /panel\.classList\.add\('is-open'\)/);
assert.doesNotMatch(ar, /panel\.style\.(top|width|maxHeight|transform) =/);
assert.match(ar, /if \(dy > 50\) closeKillChainStage\(\)/);
assert.match(ar, /e\.target\.closest\('\.ar-stage-control, button, a'\)/);
assert.match(ar, /event\.key !== 'Escape'/);
assert.match(ar, /target\.style\.zoom = String\(currentARSchemeZoom\)/);
assert.match(arCss, /#arSchemeRoot #arStageDetails\.is-open \{ display: flex;/);
assert.match(arCss, /\(orientation: landscape\) and \(min-width: 700px\)/);
// Книга из схемы — «назад» возвращает в схему.
assert.match(ar, /state\._detailReturnTo = 'scheme';/);
assert.match(read('navigation.js'), /target === 'scheme' && state\._schemeReturn/);

console.log('reader exit and AR scroll tests passed');
