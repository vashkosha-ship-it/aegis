'use strict';

// Проверка файла книги перед загрузкой (админка: новая книга, замена файла,
// массовая загрузка). Подключается раньше admin-books.js.

// Что на самом деле лежит в файле — по первым байтам, а не по расширению.
// Под видом .pdf часто приходят DjVu, сохранённая веб-страница вместо книги
// или EPUB. Раньше такая книга создавалась, сервер отклонял файл, и в
// каталоге оставалась пустая карточка. Правила совпадают с серверными
// (backend/app/core/file_validation.py).
const BOOK_FILE_PROBLEMS = {
  empty: 'Файл пустой — скорее всего, он не докачался. Скачайте книгу заново.',
  html: 'Это не книга, а веб-страница: вместо файла сохранилась страница сайта. Скачайте книгу заново.',
  djvu: 'Это DjVu. Сконвертируйте файл в PDF и загрузите снова.',
  word: 'Это документ Word. Сохраните его как PDF и загрузите снова.',
  mobi: 'Это книга Kindle (MOBI/AZW). Сконвертируйте в PDF или EPUB.',
  chm: 'Это справка CHM. Сконвертируйте в PDF.',
  rtf: 'Это документ RTF. Сохраните его как PDF.',
  archive: 'Это архив (ZIP/RAR/7z). Распакуйте его и загрузите книгу.',
  fb2: 'Это книга FB2. Сконвертируйте в PDF или EPUB.',
  image: 'Это картинка, а не книга.',
  unknown: 'Файл не похож ни на PDF, ни на EPUB — возможно, он повреждён.',
};

function _startsWith(bytes, signature, offset = 0) {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

function _ascii(text) {
  return Array.from(text, char => char.charCodeAt(0));
}

function _containsAscii(bytes, text, limit = bytes.length) {
  const needle = _ascii(text);
  const end = Math.min(limit, bytes.length) - needle.length;
  for (let i = 0; i <= end; i++) {
    if (_startsWith(bytes, needle, i)) return true;
  }
  return false;
}

function sniffBookBytes(bytes) {
  if (!bytes.length) return 'empty';
  if (_containsAscii(bytes, '%PDF-', 1024)) return 'pdf';
  if (_startsWith(bytes, _ascii('AT&TFORM'))) return 'djvu';
  if (_startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    if (_containsAscii(bytes, 'mimetypeapplication/epub+zip', 200)) return 'epub';
    if (_containsAscii(bytes, '[Content_Types].xml') || _containsAscii(bytes, 'word/')) return 'word';
    return 'archive';
  }
  if (_startsWith(bytes, _ascii('Rar!')) || _startsWith(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])
    || _startsWith(bytes, [0x1f, 0x8b])) return 'archive';
  if (_startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) return 'word';
  if (_startsWith(bytes, _ascii('BOOKMOBI'), 60) || _startsWith(bytes, _ascii('TEXtREAd'), 60)) return 'mobi';
  if (_startsWith(bytes, _ascii('ITSF'))) return 'chm';
  if (_startsWith(bytes, _ascii('{\\rtf'))) return 'rtf';
  if (_startsWith(bytes, [0xff, 0xd8, 0xff]) || _startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])
    || _startsWith(bytes, _ascii('GIF8'))) return 'image';
  const text = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.slice(0, 1024)).replace(/^[\ufeff\s]+/, '').toLowerCase();
  if (/^(<!doctype html|<html|<head|<!--)/.test(text) || text.slice(0, 300).includes('<html')) return 'html';
  if (text.includes('<fictionbook')) return 'fb2';
  return 'unknown';
}

// { format: 'pdf' | 'epub' } — можно загружать; { problem } — объяснение, почему нельзя.
async function inspectBookFile(file) {
  let bytes;
  try {
    bytes = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  } catch (_) {
    // Не удалось прочитать начало — решаем по расширению, проверит сервер.
    return { format: detectFileFormat(file) };
  }
  const kind = sniffBookBytes(bytes);
  if (kind === 'pdf' || kind === 'epub') return { format: kind };
  return { problem: BOOK_FILE_PROBLEMS[kind] || BOOK_FILE_PROBLEMS.unknown };
}
