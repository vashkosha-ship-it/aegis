/* Делегирование обработчиков из разметки.
 *
 * CSP без script-src 'unsafe-inline' запрещает onclick="..." в разметке.
 * Вызов остаётся в атрибуте, но переезжает в data-onclick, а разбирает и
 * выполняет его этот диспетчер.
 *
 * Три ограничения, каждое закрывает свой способ злоупотребления.
 *
 * 1. Строка НЕ выполняется через eval или new Function. Иначе понадобился бы
 *    script-src 'unsafe-eval', то есть мы бы поменяли одну лазейку на другую.
 *    Имя функции и аргументы-литералы разбираются вручную.
 *
 * 2. Функция обязана быть в реестре handler-allowlist.js. Раньше имя бралось
 *    прямо из window — любая разметка, попавшая в DOM через innerHTML, могла
 *    позвать любую глобальную функцию приложения.
 *
 * 3. Списки разделены по событиям, и для error он предельно узкий. error
 *    возникает сам, без действия пользователя: достаточно вставить
 *    <img src=x data-onerror="...">, и обработчик выполнится немедленно.
 *
 * 4. Разрушительные обработчики — удаление книги, пользователя, аккаунта —
 *    требуют одноразового значения в data-nonce. Реестра для них мало:
 *    внедрённая разметка может нарисовать кнопку «Удалить» с разрешённым
 *    именем, и пользователь нажмёт её сам, не подозревая, что делает.
 *
 *    Значение генерируется при каждой загрузке страницы. Свой код подставляет
 *    его в разметку, а внедрённый — не может: это заранее заготовленный текст,
 *    а прочитать что-либо со страницы ему нечем, скрипты запрещены политикой.
 *
 * Элемент и само событие передаются последними аргументами, если в разметке
 * указано data-args="this" или data-args="event".
 */
(function () {
  'use strict';

  // Делегируем на document: узлы, добавленные через innerHTML позже,
  // подхватываются сами, без переустановки слушателей.
  var EVENTS = ['click', 'change', 'input', 'keydown', 'keyup', 'submit'];
  // error на <img> не всплывает — ловим на фазе перехвата
  var CAPTURE_EVENTS = ['error'];

  // Одноразовое значение текущей загрузки страницы. Свой код подставляет его
  // в разметку разрушительных кнопок через sensitiveNonce(), диспетчер
  // сверяет. Хранится в замыкании: даже если однажды появится способ
  // выполнить чужой скрипт, прочитать значение из window не выйдет.
  var NONCE = (function () {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    var bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.prototype.map.call(bytes, function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  })();

  // Единственный способ узнать значение — вызвать эту функцию из своего кода.
  window.sensitiveNonce = function () { return NONCE; };

  var RAW = window.AEGIS_ALLOWED_HANDLERS || {};
  var ALLOWED = {};
  Object.keys(RAW).forEach(function (ev) {
    var set = Object.create(null);
    (RAW[ev] || []).forEach(function (name) { set[name] = true; });
    ALLOWED[ev] = set;
  });

  var SENSITIVE = Object.create(null);
  (RAW.sensitive || []).forEach(function (name) { SENSITIVE[name] = true; });

  function isAllowed(eventType, name) {
    var set = ALLOWED[eventType];
    return !!(set && set[name] === true);
  }

  function isSensitive(name) {
    return SENSITIVE[name] === true;
  }

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

  // Точки в имени не допускаются: через window.foo.bar раньше дотягивались
  // до document.getElementById и подобного в обход реестра.
  var CALL_RE = /^\s*([A-Za-z_$][\w$]*)\s*\(([\s\S]*)\)\s*;?\s*$/;

  function invoke(spec, el, ev) {
    var m = CALL_RE.exec(spec);
    if (!m) {
      console.warn('[handlers] не похоже на вызов функции:', spec);
      return;
    }

    var name = m[1];
    if (!isAllowed(ev.type, name)) {
      console.warn('[handlers] запрещён для события ' + ev.type + ':', name);
      return;
    }

    if (isSensitive(name) && el.getAttribute('data-nonce') !== NONCE) {
      // Разметка пришла не из нашего кода — либо её внедрили, либо забыли
      // подставить sensitiveNonce() при отрисовке. Оба случая требуют
      // внимания, поэтому сообщение заметное.
      console.error(
        '[handlers] разрушительный обработчик без действительного nonce:', name
      );
      return;
    }

    var fn = window[name];
    if (typeof fn !== 'function') {
      console.warn('[handlers] функция не найдена:', name);
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

    if (el.getAttribute('data-stop')) ev.stopPropagation();

    try {
      fn.apply(el, args);
    } catch (e) {
      console.error('[handlers] ошибка в ' + name + ':', e);
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
