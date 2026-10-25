'use strict';

/* Телефон в режиме «Версия для ПК».
   В этом режиме Chrome на Android игнорирует мобильную разметку сайта
   (meta viewport) и рисует страницу шириной 980px, уменьшая её под экран —
   всё становится мелким. Выключить этот режим сайт не может: это настройка
   браузера. Но его можно распознать: размер экрана (screen.width) браузер
   сообщает настоящий, а ширина страницы при этом намного больше. Тогда
   один раз показываем подсказку, как вернуть обычный вид. */

const DESKTOP_MODE_HINT_KEY = 'aegis_desktop_mode_hint_dismissed';

function isTouchPrimaryDevice() {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  return Boolean(coarse || ((navigator.maxTouchPoints || 0) > 0 && !fine));
}

function isPhoneInDesktopMode() {
  if (!isTouchPrimaryDevice()) return false;
  const screenWidth = Math.min(window.screen?.width || 0, window.screen?.height || Infinity);
  if (!screenWidth || screenWidth > 900) return false;
  // Страница заметно шире экрана — браузер рисует «компьютерную» версию.
  return window.innerWidth >= screenWidth * 1.25 && window.innerWidth >= 900;
}

function showDesktopModeHint() {
  let dismissed = false;
  try { dismissed = localStorage.getItem(DESKTOP_MODE_HINT_KEY) === '1'; } catch (_) { /* без хранилища показываем */ }
  if (dismissed || document.getElementById('desktopModeHint')) return;

  // Страница уменьшена браузером — увеличиваем подсказку во столько же раз,
  // чтобы её можно было прочитать.
  const screenWidth = Math.min(window.screen.width, window.screen.height);
  const scale = Math.max(1, Math.min(3, window.innerWidth / screenWidth));

  const box = document.createElement('div');
  box.id = 'desktopModeHint';
  box.className = 'desktop-mode-hint';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-labelledby', 'desktopModeHintTitle');
  box.style.setProperty('--hint-scale', String(scale));

  const title = document.createElement('strong');
  title.id = 'desktopModeHintTitle';
  title.textContent = 'Всё мелкое? Включён режим «Версия для ПК»';
  const text = document.createElement('p');
  text.textContent = 'Браузер показывает сайт как на компьютере. Чтобы вернуть обычный вид: нажмите ⋮ в Chrome и снимите галочку «Версия для ПК». Сайт сам переключить эту настройку не может.';
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.textContent = 'Понятно';
  ok.addEventListener('click', () => {
    try { localStorage.setItem(DESKTOP_MODE_HINT_KEY, '1'); } catch (_) { /* не критично */ }
    box.remove();
  });
  box.append(title, text, ok);
  document.body.appendChild(box);
}

// Горячие клавиши нужны только с клавиатурой и мышью. На устройствах, где
// главный ввод — палец, кнопку убираем из страницы: скрыть её стилями нельзя,
// общее правило для кнопок с иконкой принудительно их показывает.
function removeShortcutsButtonOnTouch() {
  document.querySelectorAll('.btn-shortcuts-icon').forEach(button => button.remove());
}

if (isTouchPrimaryDevice()) {
  document.documentElement.classList.add('is-touch-device');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', removeShortcutsButtonOnTouch);
  else removeShortcutsButtonOnTouch();
}
if (isPhoneInDesktopMode()) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showDesktopModeHint);
  else showDesktopModeHint();
}
