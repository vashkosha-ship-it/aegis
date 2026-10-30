'use strict';

/* Установка PWA и платформенные инструкции. */

// ========== УСТАНОВКА PWA НА УСТРОЙСТВО ==========
let _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  showInstallBanner();
});

// В Mi Браузере и встроенных браузерах события beforeinstallprompt не бывает,
// и плашка «Установить» не появлялась вовсе. Показываем её и там: кнопка
// откроет инструкцию с «Открыть в Chrome».
window.addEventListener('load', () => {
  if (androidBrowserWithoutInstall()) setTimeout(showInstallBanner, 1500);
});

window.addEventListener('appinstalled', () => {
  _deferredInstallPrompt = null;
  const b = document.getElementById('installBanner');
  if (b) b.remove();
  showToast('Приложение установлено');
});

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isMobile() {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}
function isAndroid() {
  return /android/i.test(navigator.userAgent);
}

// Браузер на Android, в котором установки в одно нажатие нет: встроенный
// браузер Xiaomi (Mi Браузер), браузеры внутри Telegram/VK и т. п.
// Samsung Internet, Яндекс и Edge установку поддерживают — их не трогаем.
function androidBrowserWithoutInstall() {
  const ua = navigator.userAgent || '';
  if (!isAndroid()) return null;
  if (/MiuiBrowser|XiaoMi\//i.test(ua)) return 'Mi Браузер';
  if (/HeyTapBrowser|OppoBrowser/i.test(ua)) return 'браузер телефона';
  if (/Telegram|Instagram|FBAN|FBAV|VKAndroidApp|; wv\)/i.test(ua)) return 'встроенный браузер приложения';
  return null;
}

// Ссылка, которая открывает этот же сайт в Chrome (если он установлен).
function chromeIntentUrl() {
  const { host, pathname, search } = window.location;
  return `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;end`;
}

// Плашку «Установить» закрыли — не показываем её две недели, а не навсегда:
// раньше закрытая один раз плашка больше не появлялась никогда.
const INSTALL_DISMISS_KEY = 'aegis_install_dismissed';
const INSTALL_DISMISS_DAYS = 14;
function installBannerDismissed() {
  let value = null;
  try { value = localStorage.getItem(INSTALL_DISMISS_KEY); } catch (_) { return false; }
  if (!value) return false;
  const at = Number(value);
  // Старое значение «1» — закрыто до этой версии: показываем снова.
  if (!at || at < 1e12) return false;
  return Date.now() - at < INSTALL_DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

// Готово ли системное окно установки (Chrome, Samsung Internet, Яндекс).
function installAvailable() {
  return Boolean(_deferredInstallPrompt);
}

function installNode(tagName, text, staticStyle) {
  const node = document.createElement(tagName);
  if (staticStyle) node.setAttribute('data-static-style', staticStyle);
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function installInstructionItem(parts) {
  const item = document.createElement('li');
  parts.forEach(part => {
    if (typeof part === 'string') item.appendChild(document.createTextNode(part));
    else item.appendChild(installNode('strong', part.strong));
  });
  return item;
}

function showInstallBanner() {
  if (isStandalone() || document.getElementById('installBanner')) return;
  if (!isMobile()) return; // баннер только на мобильных
  if (installBannerDismissed()) return;
  const banner = document.createElement('div');
  banner.id = 'installBanner';
  banner.className = 'install-banner';
  const copy = installNode('div', undefined, 'a004');
  copy.append(
    installNode('div', 'Установить Aegis', 'a508'),
    installNode('div', 'Добавьте приложение на телефон для быстрого доступа', 'a509'),
  );
  const install = installNode('button', 'Установить', 'a510');
  install.id = 'installBannerBtn';
  const close = installNode('button', '✕', 'a511');
  close.id = 'installBannerClose';
  banner.append(copy, install, close);
  document.body.appendChild(banner);
  install.onclick = triggerInstall;
  close.onclick = () => {
    banner.remove();
    try { localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now())); } catch (_) { /* не запомним — покажем снова */ }
  };
}

async function triggerInstall() {
  if (isStandalone()) {
    showToast('Приложение уже установлено');
    return;
  }
  if (isIOS()) {
    showIOSInstallInstructions();
    return;
  }
  if (!_deferredInstallPrompt) {
    // Событие beforeinstallprompt не пришло (уже установлено, не Chrome,
    // или критерии ещё не выполнены) — показываем ручную инструкцию.
    showAndroidInstallInstructions();
    return;
  }
  // Главный путь: системное окно установки Chrome — одно нажатие «Установить».
  _deferredInstallPrompt.prompt();
  const { outcome } = await _deferredInstallPrompt.userChoice;
  _deferredInstallPrompt = null;
  const b = document.getElementById('installBanner');
  if (b) b.remove();
  if (outcome === 'accepted') {
    showToast('Устанавливаем приложение…');
    if (isAndroid()) showAndroidAfterInstallTips();
  }
}

// Где искать значок после установки. На Xiaomi/Redmi/POCO оболочка по
// умолчанию запрещает браузеру класть значки на рабочий стол — приложение
// ставится, а значка не видно.
function showAndroidAfterInstallTips() {
  const m = _installModal('androidInstalledModal');
  const panel = installNode('div', undefined, 'a512');
  panel.append(
    installNode('div', 'Приложение устанавливается', 'a513'),
    installNode('p', 'Через несколько секунд значок «Aegis Lib» появится на рабочем столе или в списке всех приложений (свайп вверх).', 'a514'),
  );
  panel.appendChild(_xiaomiShortcutHint());
  const close = installNode('button', 'Понятно', 'a517');
  close.addEventListener('click', () => m.remove());
  panel.appendChild(close);
  m.replaceChildren(panel);
}

function _installModal(id) {
  // Плашка «Установить» внизу экрана перекрывала окно — убираем её.
  document.getElementById('installBanner')?.remove();
  let m = document.getElementById(id);
  if (!m) {
    m = document.createElement('div');
    m.id = id;
    m.className = 'install-modal';
    document.body.appendChild(m);
  }
  return m;
}

function _xiaomiShortcutHint() {
  const hint = installNode('div', undefined, 'a516');
  hint.className = 'install-xiaomi-hint';
  hint.append(
    installNode('strong', 'Xiaomi, Redmi, POCO: значка нет на рабочем столе?'),
    installNode('p', 'Откройте Настройки → Приложения → Все приложения → Chrome → Другие разрешения → «Ярлыки на рабочем столе» → Разрешить. Затем установите приложение ещё раз.'),
  );
  return hint;
}

function showAndroidInstallInstructions() {
  const m = _installModal('androidInstallModal');
  const panel = installNode('div', undefined, 'a512');
  panel.appendChild(installNode('div', 'Установка приложения', 'a513'));
  const browser = androidBrowserWithoutInstall();
  if (browser) {
    // Здесь установки нет вовсе — одна кнопка переносит сайт в Chrome,
    // там появится кнопка «Установить».
    panel.appendChild(installNode('p', `Сейчас сайт открыт в: ${browser}. Установить приложение отсюда нельзя — откройте сайт в Chrome, там будет кнопка «Установить».`, 'a514'));
    const openChrome = installNode('a', 'Открыть в Chrome', 'a517');
    openChrome.className = 'install-open-chrome';
    openChrome.href = chromeIntentUrl();
    openChrome.rel = 'noopener';
    panel.appendChild(openChrome);
    panel.appendChild(installNode('p', 'Если кнопка не сработала — скопируйте адрес сайта и вставьте его в Chrome.', 'a516'));
  } else {
    panel.appendChild(installNode('p', 'Кнопка установки сейчас недоступна — так бывает, если приложение уже установлено или страница только открылась. Установите через меню браузера:', 'a514'));
    const steps = installNode('ol', undefined, 'a515');
    steps.append(
      installInstructionItem(['Нажмите меню ', { strong: '⋮' }, ' в правом верхнем углу Chrome']),
      installInstructionItem(['Выберите ', { strong: '«Установить приложение»' }, ' или ', { strong: '«Добавить на главный экран»' }]),
      installInstructionItem(['Подтвердите установку']),
      installInstructionItem(['Значок ', { strong: '«Aegis Lib»' }, ' появится на рабочем столе или в списке приложений']),
    );
    panel.appendChild(steps);
  }
  panel.appendChild(_xiaomiShortcutHint());
  const close = installNode('button', 'Понятно', 'a517');
  close.addEventListener('click', () => m.remove());
  panel.appendChild(close);
  m.replaceChildren(panel);
}

// Браузер на iPhone, отличный от Safari: Chrome (CriOS), Firefox (FxiOS),
// Яндекс, Edge, встроенные браузеры Telegram/Instagram и т.п. В старых iOS
// на экран «Домой» добавляет только Safari, в новых — не все браузеры.
function iosBrowserName() {
  const ua = navigator.userAgent || '';
  if (/CriOS/i.test(ua)) return 'Chrome';
  if (/FxiOS/i.test(ua)) return 'Firefox';
  if (/YaBrowser/i.test(ua)) return 'Яндекс Браузер';
  if (/EdgiOS/i.test(ua)) return 'Edge';
  if (/OPiOS|OPT\//i.test(ua)) return 'Opera';
  if (/Telegram|Instagram|FBAN|FBAV|VK|Line\//i.test(ua)) return 'встроенный браузер приложения';
  if (!/Safari/i.test(ua)) return 'встроенный браузер приложения';
  return null;
}

function showIOSInstallInstructions() {
  let m = document.getElementById('iosInstallModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'iosInstallModal';
    m.className = 'install-modal';
    document.body.appendChild(m);
  }
  const panel = installNode('div', undefined, 'a518');
  panel.appendChild(installNode('div', 'Установка на iPhone/iPad', 'a519'));
  const browser = iosBrowserName();
  if (browser) {
    panel.appendChild(installNode(
      'p',
      `Сейчас сайт открыт в: ${browser}. Пункт «На экран «Домой»» надёжно есть только в Safari — `
        + 'скопируйте адрес сайта и откройте его в Safari.',
      'a514',
    ));
  }
  const steps = installNode('ol', undefined, 'a515');
  steps.append(
    installInstructionItem(['Откройте сайт в ', { strong: 'Safari' }, ' (не в режиме «Частный доступ»)']),
    installInstructionItem(['Нажмите ', { strong: '«Поделиться»' }, ' — квадрат со стрелкой вверх внизу экрана. В iOS 26 она в меню ', { strong: '•••' }, ' справа от адреса']),
    installInstructionItem(['Пролистайте список действий вниз и выберите ', { strong: '«На экран «Домой»»' }, '. Если его нет — нажмите ', { strong: '«Ещё»' }, ' или ', { strong: '«Редактировать действия»' }, ' и добавьте его']),
    installInstructionItem(['Нажмите ', { strong: '«Добавить»' }, ' — значок Aegis появится на экране «Домой»']),
  );
  const close = installNode('button', 'Понятно', 'a517');
  close.addEventListener('click', () => m.remove());
  panel.append(steps, close);
  m.replaceChildren(panel);
}
