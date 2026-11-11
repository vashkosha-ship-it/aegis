'use strict';

// Встроенные стили EPUB под политику безопасности сайта (CSP без
// 'unsafe-inline'). Книга — это XHTML с блоками <style> и атрибутами
// style="…"; браузер их блокировал («Applying inline style violates…»), и у
// книги пропадали отступы, шрифты и выравнивание. Ослаблять CSP не хотим,
// поэтому перед показом главы:
//   • блок <style> превращаем в отдельный файл стилей (blob: — разрешён);
//   • атрибут style переименовываем в data-epub-style, а после загрузки главы
//     применяем его через CSSOM (element.style.cssText CSP не блокирует).
// Работаем с деревом документа главы, поэтому текст вида «<p style="…">» в
// примерах кода не затрагивается.

const EPUB_STYLE_ATTR = 'data-epub-style';
// Освобождение файлов стилей текущей открытой книги (см. attachEpubCspStyles).
let epubCspCleanup = null;

// Текст главы (XHTML) до разбора: так браузер вообще не видит встроенных
// стилей и не пишет предупреждений CSP. Атрибуты меняем только внутри тегов —
// текст вида «&lt;p style="…"&gt;» в примерах кода не затрагивается.
function epubMoveInlineStylesInText(html, makeUrl) {
  if (typeof html !== 'string' || !html) return html;
  let out = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (match, css) => {
    if (!css.trim()) return '';
    const url = makeUrl(css);
    return url ? `<link rel="stylesheet" type="text/css" href="${url}"/>` : match;
  });
  out = out.replace(/<[a-zA-Z][^<>]*>/g, tag =>
    tag.replace(/(\s)style(\s*=\s*)("[^"]*"|'[^']*')/i, `$1${EPUB_STYLE_ATTR}$2$3`));
  return out;
}

function epubApplyMovedStyles(doc) {
  if (!doc) return;
  doc.querySelectorAll(`[${EPUB_STYLE_ATTR}]`).forEach(el => {
    try { el.style.cssText = el.getAttribute(EPUB_STYLE_ATTR) || ''; } catch (_) { /* не критично */ }
  });
}

// То же на уровне документа главы (до того, как epub.js превратит его в
// разметку для показа): надёжнее текстовой замены и не зависит от порядка
// внутренних обработчиков epub.js.
function epubMoveInlineStylesInDocument(doc, makeUrl) {
  if (!doc || !doc.querySelectorAll) return;
  doc.querySelectorAll('style').forEach(style => {
    const css = style.textContent || '';
    const url = css.trim() ? makeUrl(css) : null;
    if (url) {
      const link = doc.createElementNS(style.namespaceURI || 'http://www.w3.org/1999/xhtml', 'link');
      link.setAttribute('rel', 'stylesheet');
      link.setAttribute('type', 'text/css');
      link.setAttribute('href', url);
      style.replaceWith(link);
    } else {
      style.remove();
    }
  });
  doc.querySelectorAll('[style]').forEach(el => {
    el.setAttribute(EPUB_STYLE_ATTR, el.getAttribute('style') || '');
    el.removeAttribute('style');
  });
}

// Подключить сразу после ePub(...): обработчик срабатывает при загрузке
// каждой главы, ещё до показа.
function attachEpubCspStyles(book) {
  const urls = [];
  const makeUrl = css => {
    try {
      const url = URL.createObjectURL(new Blob([css], { type: 'text/css' }));
      urls.push(url);
      return url;
    } catch (_) {
      return null;
    }
  };
  // Главы читаются из архива книги через archive.getText — обрабатываем текст
  // до разбора. Обработчик на уровне документа — запасной путь.
  const archive = book.archive;
  if (archive && typeof archive.getText === 'function' && !archive._aegisCspWrapped) {
    const getText = archive.getText.bind(archive);
    archive.getText = (url, type) => {
      const result = getText(url, type);
      if (!/\.(x?html?)(?:$|[?#])/i.test(String(url || '')) || !result || typeof result.then !== 'function') return result;
      return result.then(text => epubMoveInlineStylesInText(text, makeUrl));
    };
    archive._aegisCspWrapped = true;
  }
  book.spine.hooks.content.register(doc => epubMoveInlineStylesInDocument(doc, makeUrl));
  // Ссылки на файлы стилей освобождаем вместе с книгой.
  return () => urls.splice(0).forEach(url => { try { URL.revokeObjectURL(url); } catch (_) { /* уже */ } });
}

// Книга с битым оглавлением: файл оглавления указан в описании EPUB, но его
// нет в архиве. epub.js тогда не сообщает об ошибке, а навсегда оставляет
// «оглавление загружается» — book.ready не наступает, книга не открывается,
// в консоли «Uncaught (in promise) File not found in the epub». Если
// оглавление не загрузилось, просим epub.js построить пустое — так он сам
// поступает с книгами без оглавления. Вызывать сразу после ePub(...).
function hardenEpubBook(book) {
  if (!book || typeof book.loadNavigation !== 'function' || book._aegisNavHardened) return;
  const loadNavigation = book.loadNavigation.bind(book);
  book.loadNavigation = packaging => loadNavigation(packaging).catch(error => {
    console.info('Оглавление EPUB не найдено — книга откроется без него:', error && error.message ? error.message : error);
    const withoutToc = Object.assign(Object.create(Object.getPrototypeOf(packaging)), packaging,
      { navPath: undefined, ncxPath: undefined, toc: undefined });
    return loadNavigation(withoutToc);
  });
  book._aegisNavHardened = true;
}

// Книга готова к показу. book.ready ждёт все части EPUB, включая оглавление
// и обложку, и падает, если хоть одной нет в архиве («File not found in the
// epub: /OEBPS/toc01.xhtml») — такая книга не открывалась вовсе. Для чтения
// нужны только содержимое (spine) и метаданные; без оглавления и обложки
// книга откроется, просто без них.
async function waitEpubUsable(book) {
  const optional = (promise, what) => Promise.resolve(promise).catch(error => {
    console.info(`В EPUB нет части «${what}» — открываем без неё:`, error && error.message ? error.message : error);
    return null;
  });
  // Сами по себе эти обещания epub.js не обрабатывает — без catch ошибка
  // всплывала в консоль как «Uncaught (in promise)».
  Promise.resolve(book.ready).catch(() => {});
  await book.opened;
  await Promise.all([
    book.loaded.spine,
    book.loaded.metadata,
    optional(book.loaded.navigation, 'оглавление'),
    optional(book.loaded.cover, 'обложка'),
    optional(book.loaded.resources, 'ресурсы'),
  ]);
}

// Применить перенесённые атрибуты style в показанной главе.
function attachEpubMovedStylesApply(rendition) {
  rendition.hooks.content.register(contents => epubApplyMovedStyles(contents.document));
}
