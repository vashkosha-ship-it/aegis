'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');

// --- Значок приложения ---
// Выбор цвета значка убран: остаётся синий, прежний выбор сбрасывается.
const appIcon = read('app-icon.js');
assert.match(read('index.html'), /<link rel="manifest" href="\/api\/app\/manifest" crossorigin="use-credentials">\s*<script src="app-icon\.js"><\/script>/);
assert.match(appIcon, /function resetAppIcon\(\)/);
assert.match(appIcon, /localStorage\.removeItem\(APP_ICON_KEY\)/);
assert.match(appIcon, /Max-Age=0/);
assert.doesNotMatch(read('account-personalization.js'), /Значок приложения|APP_ICONS/);
assert.match(read('sw.js'), /'\/app-icon\.js'/);
const variants = [];

// --- Масштаб страницы в читалке ---
const html = read('index.html');
const gestures = read('reader-gestures.js');
assert.match(html, /id="pdfZoomControls"/);
assert.match(html, /id="pdfZoomIn"/);
assert.match(html, /id="pdfZoomOut"/);
// Щипок слушается на зоне читалки, а не только на странице: поверх страницы
// лежат зоны перелистывания и перехватывают касания.
assert.match(gestures, /getElementById\('readerGestureZone'\) \|\| viewport/);
assert.match(gestures, /zone\.addEventListener\('touchstart'/);
assert.match(gestures, /function setPdfZoom\s*\(/);
assert.match(read('reader-ux-fix.css'), /is-pdf-zoomed \.tap-zone \{ display: none; \}/);
// Масштаб меньше 100 % — страница целиком в горизонтальной ориентации.
assert.match(gestures, /const PDF_ZOOM_MIN = 0\.5;/);
assert.match(gestures, /PDF_ZOOM_STEPS = \[0\.5,/);

// --- Панель выделения на телефоне внизу экрана ---
assert.match(read('reader-selection-ai.js'), /classList\.add\('is-docked'\)/);
assert.match(read('styles.css'), /\.selection-toolbar\.is-docked \{/);

console.log('app icon, reader zoom and selection toolbar tests passed');

// Подпись под значком установленного приложения — «Aegis Lib» во всех
// вариантах значка и на iPhone.
for (const file of ['manifest.json', ...variants]) {
  assert.equal(JSON.parse(read(file)).short_name, 'Aegis Lib', `${file}: short_name`);
}
assert.match(read('index.html'), /<meta name="apple-mobile-web-app-title" content="Aegis Lib">/);
