'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');

// --- Значок приложения ---
const appIcon = read('app-icon.js');
const base = JSON.parse(read('manifest.json'));
const variants = [...appIcon.matchAll(/manifest: '\/(manifest[^']*\.json)'/g)].map(m => m[1]);
assert.ok(variants.length >= 4, 'должно быть несколько вариантов значка');
for (const file of variants) {
  const manifest = JSON.parse(read(file));
  // Одинаковые id и start_url: иначе браузер посчитает выбор значка другим приложением.
  assert.equal(manifest.id, base.id, `${file}: id`);
  assert.equal(manifest.start_url, base.start_url, `${file}: start_url`);
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'), `${file}: нет maskable`);
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(frontend, icon.src)), `${file}: нет файла ${icon.src}`);
  }
}
for (const [, src] of appIcon.matchAll(/icon: '([^']+)'/g)) {
  assert.ok(fs.existsSync(path.join(frontend, src)), `нет превью ${src}`);
}
// Адрес manifest постоянный (сервер подставляет значок по cookie), скрипт
// значка — сразу после него.
assert.match(read('index.html'), /<link rel="manifest" href="\/api\/app\/manifest\.json">\s*<script src="app-icon\.js"><\/script>/);
assert.doesNotMatch(appIcon, /setHref\('link\[rel="manifest"\]'/);
assert.match(appIcon, /aegis_app_icon=/);
assert.match(read('account-personalization.js'), /меняется не сразу/);
assert.match(read('sw.js'), /'\/app-icon\.js'/);
assert.match(read('account-personalization.js'), /Значок приложения/);

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
