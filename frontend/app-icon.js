// Значок установленного приложения (PWA).
//
// Выбор цвета значка убран: у приложения один синий значок. Тем, кто раньше
// выбрал другой цвет, возвращаем синий: сбрасываем выбор на устройстве и
// cookie aegis_app_icon, по которой сервер подставляет значок в manifest
// (/api/app/manifest). Chrome сам заменит значок при очередной проверке
// приложения; на iPhone — после переустановки ярлыка.

const APP_ICON_KEY = 'aegis_app_icon';
const APP_ICON_COOKIE = 'aegis_app_icon';
const DEFAULT_APP_ICON_HREF = '/icons/icon-192.png';

function resetAppIcon() {
  try { localStorage.removeItem(APP_ICON_KEY); } catch (_) { /* хранилище недоступно */ }
  try {
    if (/(?:^|;\s*)aegis_app_icon=/.test(document.cookie)) {
      const secure = location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${APP_ICON_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    }
  } catch (_) { /* cookie недоступны */ }
  ['link[rel="icon"]', 'link[rel="apple-touch-icon"]'].forEach(selector => {
    const link = document.querySelector(selector);
    if (link && link.getAttribute('href') !== DEFAULT_APP_ICON_HREF) link.setAttribute('href', DEFAULT_APP_ICON_HREF);
  });
}

resetAppIcon();
