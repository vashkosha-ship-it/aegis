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

// Применить перенесённые атрибуты style в показанной главе.
function attachEpubMovedStylesApply(rendition) {
  rendition.hooks.content.register(contents => epubApplyMovedStyles(contents.document));
}
