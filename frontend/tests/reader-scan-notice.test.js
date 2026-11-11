'use strict';

// Предупреждение для отсканированных книг: показывается один раз и только
// если на проверенных страницах нет текста.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const store = new Map();
const shown = [];
const sandbox = {
  console,
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  },
  showInfoModal: opts => shown.push(opts),
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'reader-scan-notice.js'), 'utf8'), sandbox);

const doc = textPerPage => ({
  numPages: 100,
  getPage: async n => ({ getTextContent: async () => ({ items: [{ str: textPerPage(n) }] }) }),
});

(async () => {
  assert.equal(JSON.stringify(sandbox.scanSamplePages(100)), JSON.stringify([3, 50, 95]));
  assert.equal(sandbox.scanSamplePages(1).length, 0);

  // Книга с текстом: окна нет, повторно не проверяется.
  await sandbox.checkScannedBookNotice(1, doc(() => 'Обычный текст страницы, вполне достаточный.'));
  assert.equal(shown.length, 0);
  assert.equal(store.get('aegis_book_text_layer:1'), 'text');

  // Скан: окно один раз.
  await sandbox.checkScannedBookNotice(2, doc(() => ''));
  assert.equal(shown.length, 1);
  assert.match(shown[0].items.join(' '), /поиск по тексту/);
  await sandbox.checkScannedBookNotice(2, doc(() => ''));
  assert.equal(shown.length, 1);

  // Книгу уже закрыли, пока шла проверка, — окно не показываем.
  await sandbox.checkScannedBookNotice(3, doc(() => ''), () => false);
  assert.equal(shown.length, 1);

  const core = fs.readFileSync(path.join(__dirname, '..', 'reader-core.js'), 'utf8');
  assert.match(core, /checkScannedBookNotice\(\s*b\.id, loadedDoc/);
  console.log('reader-scan-notice: ok');
})().catch(e => { console.error(e); process.exit(1); });
