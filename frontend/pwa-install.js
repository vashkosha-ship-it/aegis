'use strict';

/* Установка PWA и платформенные инструкции. */

// ========== УСТАНОВКА PWA НА УСТРОЙСТВО ==========
let _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  showInstallBanner();
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
  if (localStorage.getItem('aegis_install_dismissed') === '1') return;
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
    localStorage.setItem('aegis_install_dismissed', '1');
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
  _deferredInstallPrompt.prompt();
  const { outcome } = await _deferredInstallPrompt.userChoice;
  _deferredInstallPrompt = null;
  const b = document.getElementById('installBanner');
  if (b) b.remove();
  if (outcome === 'accepted') showToast('Устанавливаем приложение…');
}

function showAndroidInstallInstructions() {
  let m = document.getElementById('androidInstallModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'androidInstallModal';
    m.className = 'install-modal';
    document.body.appendChild(m);
  }
  const panel = installNode('div', undefined, 'a512');
  panel.append(
    installNode('div', 'Установка приложения', 'a513'),
    installNode('p', 'Если кнопка установки не сработала автоматически, установите вручную:', 'a514'),
  );
  const steps = installNode('ol', undefined, 'a515');
  steps.append(
    installInstructionItem(['Откройте сайт в браузере ', { strong: 'Chrome' }, ' (не в Mi Браузере)']),
    installInstructionItem(['Нажмите меню ', { strong: '⋮' }, ' в правом верхнем углу']),
    installInstructionItem(['Выберите ', { strong: '«Установить приложение»' }, ' или ', { strong: '«Добавить на главный экран»' }]),
    installInstructionItem(['Подтвердите установку']),
  );
  const note = installNode('p', 'Если приложение не появилось на рабочем столе — проверьте список всех приложений (свайп вверх). В настройках Xiaomi включите «Добавлять значки на рабочий стол».', 'a516');
  const close = installNode('button', 'Понятно', 'a517');
  close.addEventListener('click', () => m.remove());
  panel.append(steps, note, close);
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
