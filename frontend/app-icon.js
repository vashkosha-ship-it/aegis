// Значок установленного приложения (PWA).
//
// Выбор хранится на устройстве: у каждого варианта свой manifest с теми же
// id и start_url, отличаются только картинки. Страница подменяет ссылку на
// manifest и значки вкладки. Браузер берёт значок при установке на экран
// «Домой»; у уже установленного приложения Android-Chrome обновляет значок
// сам (может спросить подтверждение), на iPhone ярлык нужно добавить заново.

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

function applyAppIcon(id) {
  const item = APP_ICONS.find(entry => entry.id === id) || APP_ICONS[0];
  const setHref = (selector, href) => {
    const link = document.querySelector(selector);
    if (link && link.getAttribute('href') !== href) link.setAttribute('href', href);
  };
  setHref('link[rel="manifest"]', item.manifest);
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
      ? `Значок «${item.label}» выбран. Телефон заменит его не сразу — быстрее всего переустановить приложение на экран «Домой»`
      : `Значок «${item.label}» будет у приложения после установки на экран «Домой»`);
  }
  return item;
}

applyAppIcon(getAppIcon());
