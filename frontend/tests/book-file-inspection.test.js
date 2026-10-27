'use strict';

// Массовая загрузка: формат книги — по содержимому, неподходящие файлы
// отклоняются до создания карточки с понятной причиной.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const admin = read('admin-books.js');
const inspect = read('book-file-inspect.js');
const index = read('index.html');
const context = { TextDecoder, Uint8Array };
vm.createContext(context);
vm.runInContext(admin.match(/function detectFileFormat[\s\S]*?\n}\n/)[0] + inspect, context);
assert.ok(index.indexOf('book-file-inspect.js') < index.indexOf('admin-books.js'));
assert.match(read('sw.js'), /'\/book-file-inspect\.js'/);

const bytes = (...parts) => {
  const out = [];
  for (const part of parts) {
    if (typeof part === 'string') for (const char of part) out.push(char.charCodeAt(0));
    else out.push(...part);
  }
  return new Uint8Array(out);
};
const zeros = n => new Array(n).fill(0);

const cases = [
  [bytes('%PDF-1.7\n'), 'pdf'],
  [bytes([0xef, 0xbb, 0xbf], '%PDF-1.4'), 'pdf'],
  [bytes(zeros(128), '%PDF-1.5'), 'pdf'],
  [bytes('x'.repeat(1100), '%PDF-1.5'), 'unknown'],
  [bytes(''), 'empty'],
  [bytes('<!DOCTYPE html><html>'), 'html'],
  [bytes('\n  <html lang="ru">'), 'html'],
  [bytes('AT&TFORM', zeros(4), 'DJVM'), 'djvu'],
  [bytes([0x50, 0x4b, 3, 4], zeros(26), 'mimetypeapplication/epub+zip'), 'epub'],
  [bytes([0x50, 0x4b, 3, 4], zeros(26), '[Content_Types].xml'), 'word'],
  [bytes([0x50, 0x4b, 3, 4], zeros(26), 'book.pdf'), 'archive'],
  [bytes('Rar!', [0x1a, 7, 0]), 'archive'],
  [bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1]), 'word'],
  [bytes(zeros(60), 'BOOKMOBI'), 'mobi'],
  [bytes('ITSF', [3, 0, 0, 0]), 'chm'],
  [bytes('{\\rtf1\\ansi'), 'rtf'],
  [bytes('<?xml version="1.0"?><FictionBook xmlns="'), 'fb2'],
];
for (const [input, kind] of cases) {
  assert.equal(context.sniffBookBytes(input), kind, `${kind}: ${Array.from(input.slice(0, 12))}`);
}

const file = data => ({ name: 'book.pdf', slice: () => ({ arrayBuffer: async () => data.buffer }) });
(async () => {
  assert.equal((await context.inspectBookFile(file(bytes('%PDF-1.7')))).format, 'pdf');
  // EPUB с расширением .pdf загружается как EPUB.
  assert.equal((await context.inspectBookFile(file(bytes([0x50, 0x4b, 3, 4], zeros(26), 'mimetypeapplication/epub+zip')))).format, 'epub');
  assert.match((await context.inspectBookFile(file(bytes('<html>')))).problem, /веб-страница/);
  assert.match((await context.inspectBookFile(file(bytes('AT&TFORM')))).problem, /DjVu/);

  // Массовая загрузка проверяет файл до создания карточки и удаляет
  // карточку, если сервер файл не принял.
  const bulk = read('admin-bulk-upload.js');
  assert.ok(bulk.indexOf('inspectBookFile(item.file)') < bulk.indexOf('api.books.create('));
  assert.match(bulk, /Файл не принят — пустую карточку тоже убираем\.\n\s+try \{ await api\.books\.delete\(created\.id\)/);
  assert.match(admin, /Без файла карточка в каталоге бесполезна/);
  // «Названия и теги» в админке: кнопка, модуль и правки со старыми значениями.
  const screens = read('admin-screens.js');
  const review = read('admin-metadata-review.js');
  assert.match(screens, /id="adminMetadataBtn"/);
  assert.match(screens, /refreshMetadataReviewStatus\(\)/);
  assert.match(review, /api\.library\.startMetadataReview\(\)/);
  assert.match(review, /change\.old_title/);
  assert.match(read('api.js'), /'\/admin\/book-metadata\/jobs'/);
  assert.ok(index.indexOf('admin-metadata-review.js') < index.indexOf('app.js'));
  assert.match(read('sw.js'), /'\/admin-metadata-review\.js'/);
  console.log('Book file inspection tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
