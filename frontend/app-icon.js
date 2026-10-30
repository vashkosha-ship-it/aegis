// Значок установленного приложения (PWA).
//
// Выбор хранится на устройстве (localStorage) и в cookie aegis_app_icon.
// Без crossorigin="use-credentials" у <link rel="manifest"> браузер
// запрашивает manifest без cookie — и сервер всегда отдавал синий значок.
// Описание приложения (manifest) отдаёт сервер по одному постоянному адресу
// /api/app/manifest, подставляя значок из cookie. Значок на экране
// «Домой» система запоминает при установке: Chrome на Android и компьютере
// сам заменит его при очередной проверке приложения (не сразу, иногда с
// вопросом), iPhone — только если удалить ярлык и добавить заново.

const APP_ICON_KEY = 'aegis_app_icon';
const DEFAULT_APP_ICON = 'blue';
const APP_ICONS = Object.freeze([
  { id: 'blue', label: 'Синий', manifest: '/manifest.json', icon: '/icons/icon-192.png' },
  { id: 'orange', label: 'Оранжевый', manifest: '/manifest-orange.json', icon: '/icons/app/orange-192.png' },
  { id: 'green', label: 'Зелёный', manifest: '/manifest-green.json', icon: '/icons/app/green-192.png' },
  { id: 'violet', label: 'Фиолетовый', manifest: '/manifest-violet.json', icon: '/icons/app/violet-192.png' },
  { id: 'red', label: 'Красный', manifest: '/manifest-red.json', icon: '/icons/app/red-192.png' },
  { id: 'dark', label: 'Тёмный', manifest: '/manifest-dark.json', icon: '/icons/app/dark-192.png' },
]);

function getAppIcon() {
  let value = null;
  try { value = localStorage.getItem(APP_ICON_KEY); } catch (_) { /* хранилище недоступно */ }
  return APP_ICONS.some(item => item.id === value) ? value : DEFAULT_APP_ICON;
}

const APP_ICON_COOKIE = 'aegis_app_icon';

function _writeAppIconCookie(id) {
  try {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${APP_ICON_COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  } catch (_) { /* cookie недоступны — останется стандартный значок */ }
}

function _readAppIconCookie() {
  try {
    const match = document.cookie.match(/(?:^|;\s*)aegis_app_icon=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch (_) {
    return null;
  }
}

function applyAppIcon(id) {
  const item = APP_ICONS.find(entry => entry.id === id) || APP_ICONS[0];
  const setHref = (selector, href) => {
    const link = document.querySelector(selector);
    if (link && link.getAttribute('href') !== href) link.setAttribute('href', href);
  };
  // Адрес manifest не трогаем: Chrome проверяет обновления по адресу,
  // с которого приложение установили. Значок в нём выбирает сервер по cookie.
  if (_readAppIconCookie() !== item.id) _writeAppIconCookie(item.id);
  setHref('link[rel="icon"]', item.icon);
  setHref('link[rel="apple-touch-icon"]', item.icon);
  return item;
}

function isInstalledApp() {
  try {
    return Boolean(
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || window.navigator.standalone,
    );
  } catch (_) {
    return false;
  }
}

function setAppIcon(id) {
  const item = applyAppIcon(id);
  try { localStorage.setItem(APP_ICON_KEY, item.id); } catch (_) { /* хранилище недоступно */ }
  if (typeof showToast === 'function') {
    showToast(isInstalledApp()
      ? `Значок «${item.label}» выбран. На экране «Домой» он сменится не сразу — подробности в разделе «Значок приложения»`
      : `Значок «${item.label}» будет у приложения после установки на экран «Домой»`);
  }
  return item;
}

applyAppIcon(getAppIcon());
