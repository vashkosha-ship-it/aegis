/* Делегирование инлайновых обработчиков.
 *
 * CSP без script-src 'unsafe-inline' запрещает onclick="..." в разметке.
 * Переписывать 300 вызовов на отдельные addEventListener нереально, поэтому
 * атрибут остаётся в разметке, но переезжает в data-onclick — а вызов
 * разбирает и выполняет этот диспетчер.
 *
 * Строка НЕ выполняется через eval или new Function: это потребовало бы
 * script-src 'unsafe-eval', то есть мы бы поменяли одну дыру на другую.
 * Вместо этого разбираем имя функции и её аргументы-литералы вручную.
 *
 * Обработчики, которым нужен this или event, диспетчер тоже поддерживает:
 * они получают элемент и событие последними аргументами, если объявлены с
 * data-onclick-args="event" / "this".
 */
(function () {
  'use strict';

  // Делегируем на document: узлы, добавленные через innerHTML позже,
  // подхватываются сами, без переустановки слушателей.
  var EVENTS = ['click', 'change', 'input', 'keydown', 'keyup', 'submit'];
  // error на <img> не всплывает — ловим на фазе перехвата
  var CAPTURE_EVENTS = ['error'];

  function parseArgs(src) {
    var args = [];
    var i = 0;
    var n = src.length;

    while (i < n) {
      while (i < n && /[\s,]/.test(src[i])) i++;
      if (i >= n) break;

      var ch = src[i];
      var start = i;

      if (ch === '"' || ch === "'") {
        var quote = ch;
        var buf = '';
        i++;
        while (i < n) {
          if (src[i] === '\\' && i + 1 < n) {
            buf += src[i + 1];
            i += 2;
            continue;
          }
          if (src[i] === quote) { i++; break; }
          buf += src[i];
          i++;
        }
        args.push(buf);
        continue;
      }

      if (ch === '{' || ch === '[') {
        // JSON-литерал: считаем скобки, не заглядывая внутрь строк
        var open = ch;
        var close = ch === '{' ? '}' : ']';
        var depth = 0;
        var inStr = null;
        while (i < n) {
          var c = src[i];
          if (inStr) {
            if (c === '\\') { i += 2; continue; }
            if (c === inStr) inStr = null;
          } else if (c === '"' || c === "'") {
            inStr = c;
          } else if (c === open) {
            depth++;
          } else if (c === close) {
            depth--;
            if (depth === 0) { i++; break; }
          }
          i++;
        }
        var raw = src.slice(start, i);
        try {
          args.push(JSON.parse(raw));
        } catch (e) {
          try {
            args.push(JSON.parse(raw.replace(/'/g, '"')));
          } catch (e2) {
            console.warn('[handlers] не разобран аргумент:', raw);
            args.push(null);
          }
        }
        continue;
      }

      while (i < n && src[i] !== ',') i++;
      var token = src.slice(start, i).trim();
      if (token === 'true') args.push(true);
      else if (token === 'false') args.push(false);
      else if (token === 'null') args.push(null);
      else if (token === 'undefined') args.push(undefined);
      else if (token !== '' && !isNaN(Number(token))) args.push(Number(token));
      else if (token !== '') args.push(token);
    }

    return args;
  }

  function resolve(name) {
    var parts = name.split('.');
    var ctx = window;
    for (var i = 0; i < parts.length; i++) {
      if (ctx == null) return null;
      ctx = ctx[parts[i]];
    }
    return typeof ctx === 'function' ? ctx : null;
  }

  var CALL_RE = /^\s*([A-Za-z_$][\w$.]*)\s*\(([\s\S]*)\)\s*;?\s*$/;

  function invoke(spec, el, ev) {
    var m = CALL_RE.exec(spec);
    if (!m) {
      console.warn('[handlers] не похоже на вызов функции:', spec);
      return;
    }

    var fn = resolve(m[1]);
    if (!fn) {
      console.warn('[handlers] функция не найдена:', m[1]);
      return;
    }

    var args = parseArgs(m[2]);

    // Явно запрошенные аргументы: data-args="event" или "this".
    // Если на элементе несколько обработчиков и лишний аргумент мешает
    // одному из них — можно уточнить событие: data-args-keydown="event".
    var extra = el.getAttribute('data-args-' + (ev && ev.type)) ||
                el.getAttribute('data-args');
    if (extra) {
      extra.split(',').forEach(function (kind) {
        kind = kind.trim();
        if (kind === 'event') args.push(ev);
        else if (kind === 'this') args.push(el);
      });
    }

    try {
      fn.apply(el, args);
    } catch (e) {
      console.error('[handlers] ошибка в ' + m[1] + ':', e);
    }
  }

  function handler(type) {
    return function (ev) {
      var attr = 'data-on' + type;
      var el = ev.target;
      // Идём вверх: клик мог прийти в <svg> внутри кнопки
      while (el && el !== document) {
        if (el.nodeType === 1 && el.hasAttribute && el.hasAttribute(attr)) {
          invoke(el.getAttribute(attr), el, ev);
          return;
        }
        el = el.parentNode;
      }
    };
  }

  EVENTS.forEach(function (type) {
    document.addEventListener(type, handler(type), false);
  });
  CAPTURE_EVENTS.forEach(function (type) {
    document.addEventListener(type, handler(type), true);
  });
})();
