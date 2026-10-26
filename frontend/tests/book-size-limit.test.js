'use strict';

// Лимит на файл книги в админке берётся из настроек сервера.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const context = {
  document: { documentElement: { classList: { toggle() {} } }, getElementById: () => null },
  window: {},
  Date,
};
vm.createContext(context);
vm.runInContext(read('navigation.js'), context);

(async () => {
  // Пока настройки не пришли — 500 МБ, как на сервере по умолчанию.
  assert.equal(context.getMaxBookSizeMb('pdf'), 500);
  vm.runInContext("var state = { currentUser: { id: 1 }, currentScreen: 'admin' };", context);
  context.api = { settings: async () => ({ assistant_enabled: true, max_pdf_size_mb: 700, max_epub_size_mb: 300 }) };
  await context.refreshAssistantAvailability(true);
  assert.equal(context.getMaxBookSizeMb('pdf'), 700);
  assert.equal(context.getMaxBookSizeMb('epub'), 300);

  // Нигде в админке не осталось зашитых 150 МБ.
  for (const file of ['admin-books.js', 'admin-bulk-upload.js', 'index.html']) {
    assert.doesNotMatch(read(file), /150 \* 1024 \* 1024|150 МБ/, file);
  }
  assert.match(read('../backend/deploy/nginx-aegis.conf'), /client_max_body_size 520M;/);
  console.log('Book size limit tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
