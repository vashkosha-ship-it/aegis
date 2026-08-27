/* Проверки диспетчера обработчиков (frontend/inline-handlers.js).
 *
 * Главное, что здесь проверяется: разметка, попавшая в DOM через innerHTML,
 * не должна уметь позвать произвольную функцию приложения. Диспетчер по
 * своей природе исполняет то, что написано в атрибуте, — значит именно он и
 * есть место, где нужен барьер.
 *
 * Запуск:  node frontend/tests/dispatcher.test.js
 * Нужен jsdom:  npm install --no-save jsdom
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed++;
    console.log('  ok   ' + name);
  } else {
    failed++;
    console.log('  FAIL ' + name);
  }
}

/** Свежий DOM с загруженным диспетчером и заданным реестром. */
function makeEnv(allowlist) {
  const dom = new JSDOM('<!doctype html><body></body>', {
    runScripts: 'outside-only',
    resources: undefined,
  });
  const win = dom.window;

  win.AEGIS_ALLOWED_HANDLERS = allowlist;
  win.calls = [];
  // Функции-приманки: любой их вызов означает, что барьер не сработал
  win.allowedFn = function (...args) { win.calls.push(['allowedFn', args]); };
  win.deleteAdminUser = function (...args) { win.calls.push(['deleteAdminUser', args]); };
  win.replaceWithFallback = function (el) {
    win.calls.push(['replaceWithFallback', el && el.tagName]);
  };

  // console.warn диспетчера в тестах только шумит
  win.console.warn = () => {};

  const code = fs.readFileSync(path.join(FRONTEND, 'inline-handlers.js'), 'utf8');
  win.eval(code);
  return win;
}

function click(win, el) {
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
}

console.log('\nДиспетчер: разрешённые вызовы');
{
  const win = makeEnv({ click: ['allowedFn'] });
  win.document.body.innerHTML =
    '<button id="b" data-onclick="allowedFn(42, \'текст\', true)">x</button>';
  click(win, win.document.getElementById('b'));

  check('функция из реестра вызывается', win.calls.length === 1);
  check('аргументы разобраны по типам',
    JSON.stringify(win.calls[0][1]) === JSON.stringify([42, 'текст', true]));
}

console.log('\nИнъекция data-onclick');
{
  const win = makeEnv({ click: ['allowedFn'] });
  // Так выглядит внедрение через innerHTML: разметка есть, в реестре — нет
  win.document.body.innerHTML =
    '<button id="b" data-onclick="deleteAdminUser(1)">x</button>';
  click(win, win.document.getElementById('b'));

  check('функция вне реестра не вызывается', win.calls.length === 0);
}

console.log('\nИнъекция data-onerror (выполняется без действия пользователя)');
{
  const win = makeEnv({
    click: ['allowedFn', 'deleteAdminUser'],
    error: ['replaceWithFallback'],
  });
  const img = win.document.createElement('img');
  img.setAttribute('data-onerror', 'deleteAdminUser(1)');
  win.document.body.appendChild(img);
  // Событие error возникает само, когда картинка не загрузилась
  img.dispatchEvent(new win.Event('error'));

  check('для error разрешён только свой узкий список', win.calls.length === 0);
}

{
  const win = makeEnv({ error: ['replaceWithFallback'] });
  const img = win.document.createElement('img');
  img.setAttribute('data-onerror', 'replaceWithFallback()');
  img.setAttribute('data-args', 'this');
  win.document.body.appendChild(img);
  img.dispatchEvent(new win.Event('error'));

  check('штатная подмена обложки работает',
    win.calls.length === 1 && win.calls[0][0] === 'replaceWithFallback');
}

console.log('\nОбход реестра через точечные имена');
{
  const win = makeEnv({ click: ['allowedFn'] });
  win.document.body.innerHTML =
    '<button id="b" data-onclick="window.deleteAdminUser(1)">x</button>';
  click(win, win.document.getElementById('b'));
  check('window.foo не вызывается', win.calls.length === 0);
}
{
  const win = makeEnv({ click: ['allowedFn'] });
  win.document.body.innerHTML =
    '<button id="b" data-onclick="document.getElementById(\'b\').remove()">x</button>';
  click(win, win.document.getElementById('b'));
  check('цепочка через document не выполняется',
    win.document.getElementById('b') !== null);
}

console.log('\nРазделение по событиям');
{
  // Функция разрешена для click, но не для error — и наоборот
  const win = makeEnv({ click: ['deleteAdminUser'], error: ['replaceWithFallback'] });
  const img = win.document.createElement('img');
  img.setAttribute('data-onerror', 'deleteAdminUser(1)');
  win.document.body.appendChild(img);
  img.dispatchEvent(new win.Event('error'));
  check('разрешение для click не действует на error', win.calls.length === 0);

  const btn = win.document.createElement('button');
  btn.setAttribute('data-onclick', 'deleteAdminUser(1)');
  win.document.body.appendChild(btn);
  click(win, btn);
  check('по своему событию та же функция работает', win.calls.length === 1);
}

console.log('\nПустой реестр');
{
  const win = makeEnv({});
  win.document.body.innerHTML =
    '<button id="b" data-onclick="allowedFn(1)">x</button>';
  click(win, win.document.getElementById('b'));
  check('без реестра не вызывается ничего', win.calls.length === 0);
}

console.log('\nРеестр соответствует разметке');
{
  // Если в разметку добавили обработчик, а реестр не пересобрали, диспетчер
  // молча откажется его вызывать. Ловим это здесь, а не в проде.
  const allowSrc = fs.readFileSync(path.join(FRONTEND, 'handler-allowlist.js'), 'utf8');
  const win = new JSDOM('', { runScripts: 'outside-only' }).window;
  win.eval(allowSrc);
  const allow = win.AEGIS_ALLOWED_HANDLERS;

  const attrRe = /data-on([a-z]+)\s*=\s*(["'])([\s\S]*?)\2/g;
  const callRe = /^\s*([A-Za-z_$][\w$]*)\s*\(/;
  const missing = [];

  for (const file of ['app.js', 'index.html']) {
    const text = fs.readFileSync(path.join(FRONTEND, file), 'utf8');
    let m;
    while ((m = attrRe.exec(text)) !== null) {
      const [, ev, , code] = m;
      const c = callRe.exec(code.trim());
      if (!c) continue;
      const list = allow[ev] || [];
      if (!list.includes(c[1])) missing.push(`${file}: ${ev} -> ${c[1]}`);
    }
  }

  if (missing.length) {
    console.log('    отсутствуют в реестре:');
    missing.slice(0, 20).forEach((x) => console.log('      ' + x));
  }
  check('все обработчики из разметки есть в реестре', missing.length === 0);
}

console.log(`\nИтого: ${passed} ok, ${failed} fail\n`);
process.exit(failed === 0 ? 1 - 1 : 1);
