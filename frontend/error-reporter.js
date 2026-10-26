'use strict';

// Сбор ошибок в браузере пользователя. Подключается первым, чтобы поймать
// и ошибки при загрузке остальных скриптов. Отчёт уходит на свой сервер
// (/api/client-errors), а тот пишет его в журнал и, если настроен, в Sentry
// или GlitchTip.
//
// Что отправляется: текст ошибки, стек, путь страницы без параметров.
// Ничего из того, что человек вводит, и никаких данных аккаунта.
(function () {
  const ENDPOINT = '/api/client-errors';
  // За одну загрузку страницы — не больше десяти отчётов: зациклившаяся
  // ошибка иначе отправляла бы их на каждом кадре.
  const MAX_REPORTS = 10;
  let sent = 0;
  const seen = new Set();

  function isForeign(stack, filename) {
    // Ошибки расширений браузера — не наши, чинить их нечем.
    return /(?:chrome|moz|safari(?:-web)?)-extension:\/\//.test(`${stack || ''} ${filename || ''}`);
  }

  function send(kind, message, stack) {
    if (sent >= MAX_REPORTS) return;
    const text = String(message || '').slice(0, 2000);
    const trace = String(stack || '').slice(0, 8000);
    if (!text && !trace) return;
    const key = `${kind}|${text}|${trace.slice(0, 300)}`;
    if (seen.has(key)) return;
    seen.add(key);
    sent += 1;

    const body = JSON.stringify({ kind, message: text, stack: trace, url: location.pathname });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) {
        return;
      }
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
        credentials: 'omit',
      }).catch(() => { /* без сети отчёт теряется — это нормально */ });
    } catch (_) { /* отчёт об ошибке не должен сам стать ошибкой */ }
  }

  window.addEventListener('error', event => {
    // Ошибки загрузки картинок и файлов приходят сюда же, но без message:
    // это не сбой кода, у них свои обработчики (заглушка обложки и т. п.).
    if (event.target && event.target !== window) return;
    const stack = (event.error && event.error.stack) || `${event.filename || ''}:${event.lineno || 0}:${event.colno || 0}`;
    if (isForeign(stack, event.filename)) return;
    send('error', event.message, stack);
  });

  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    // Обрыв сети — не ошибка кода: приложение показывает «Нет связи» само.
    if (reason && (reason.isNetworkError || reason.name === 'AbortError')) return;
    const stack = reason && reason.stack;
    if (isForeign(stack)) return;
    send('unhandledrejection', (reason && reason.message) || String(reason), stack);
  });

  // Для мест, где ошибку перехватывают и показывают пользователю, но знать
  // о ней всё равно нужно: reportClientError(err, 'reader').
  window.reportClientError = (error, where) => {
    send(where ? `manual:${String(where).slice(0, 20)}` : 'manual',
      (error && error.message) || String(error), error && error.stack);
  };
})();
