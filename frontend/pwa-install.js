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

function showInstallBanner() {
  if (isStandalone() || document.getElementById('installBanner')) return;
  if (!isMobile()) return; // баннер только на мобильных
  if (localStorage.getItem('aegis_install_dismissed') === '1') return;
  const banner = document.createElement('div');
  banner.id = 'installBanner';
  banner.className = 'install-banner';
  banner.innerHTML = `
    <div data-static-style="a004">
      <div data-static-style="a508">Установить Aegis</div>
      <div data-static-style="a509">Добавьте приложение на телефон для быстрого доступа</div>
    </div>
    <button id="installBannerBtn" data-static-style="a510">Установить</button>
    <button id="installBannerClose" data-static-style="a511">✕</button>`;
  document.body.appendChild(banner);
  document.getElementById('installBannerBtn').onclick = triggerInstall;
  document.getElementById('installBannerClose').onclick = () => {
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
  m.innerHTML = `
    <div data-static-style="a512">
      <div data-static-style="a513">Установка приложения</div>
      <p data-static-style="a514">
        Если кнопка установки не сработала автоматически, установите вручную:
      </p>
      <ol data-static-style="a515">
        <li>Откройте сайт в браузере <strong>Chrome</strong> (не в Mi Браузере)</li>
        <li>Нажмите меню <strong>⋮</strong> в правом верхнем углу</li>
        <li>Выберите <strong>«Установить приложение»</strong> или <strong>«Добавить на главный экран»</strong></li>
        <li>Подтвердите установку</li>
      </ol>
      <p data-static-style="a516">
        Если приложение не появилось на рабочем столе — проверьте список всех приложений (свайп вверх). В настройках Xiaomi включите «Добавлять значки на рабочий стол».
      </p>
      <button data-onclick="closeModal('androidInstallModal')" data-static-style="a517">Понятно</button>
    </div>`;
}

function showIOSInstallInstructions() {
  let m = document.getElementById('iosInstallModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'iosInstallModal';
    m.className = 'install-modal';
    document.body.appendChild(m);
  }
  m.innerHTML = `
    <div data-static-style="a518">
      <div data-static-style="a519">Установка на iPhone/iPad</div>
      <p data-static-style="a520">
        1. Нажмите кнопку «Поделиться» <span data-static-style="a521">⬆️</span> внизу Safari<br>
        2. Выберите «На экран Домой»<br>
        3. Нажмите «Добавить»
      </p>
      <button data-onclick="closeModal('iosInstallModal')" data-static-style="a517">Понятно</button>
    </div>`;
}

