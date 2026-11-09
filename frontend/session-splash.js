// Заставка при запуске для того, кто уже входил на этом устройстве.
//
// Сессия проверяется на сервере (обновление токена по cookie) и библиотека
// загружается не мгновенно. Раньше всё это время был виден экран входа — будто
// пароль спрашивают заново. Теперь, если на устройстве есть признаки входа,
// вместо формы показывается заставка, а форма появится, только если сессия
// действительно закончилась. Скрипт подключён в <head>, до отрисовки страницы.

const SESSION_SPLASH_CLASS = 'session-restoring';
// Если загрузка почему-то зависла, форма входа всё равно появится.
const SESSION_SPLASH_TIMEOUT_MS = 15000;

function hasDeviceSession() {
  try {
    if (/(?:^|;\s*)aegis_csrf=/.test(document.cookie)) return true;
  } catch (_) { /* cookie недоступны */ }
  try {
    return Boolean(localStorage.getItem('aegis_cached_user'));
  } catch (_) {
    return false;
  }
}

function hideSessionSplash() {
  document.documentElement.classList.remove(SESSION_SPLASH_CLASS);
}

if (hasDeviceSession()) {
  document.documentElement.classList.add(SESSION_SPLASH_CLASS);
  setTimeout(hideSessionSplash, SESSION_SPLASH_TIMEOUT_MS);
}
