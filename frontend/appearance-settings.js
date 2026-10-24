// Настройки внешнего вида приложения.
const APP_THEME_KEY = 'aegis_app_theme';
const GRID_SIZE_KEY = 'aegis_grid_size';
const APP_ACCENT_KEY = 'aegis_app_accent';

// Цвет акцента. Сами палитры — в css/components/theme-ember.css
// (атрибут data-accent на <html>); здесь только выбор и хранение.
const APP_ACCENTS = Object.freeze([
  { id: 'orange', label: 'Оранжевый', swatch: '#ff5c1f' },
  { id: 'blue', label: 'Синий', swatch: '#2f7bff' },
  { id: 'green', label: 'Зелёный', swatch: '#22c55e' },
  { id: 'violet', label: 'Фиолетовый', swatch: '#8b5cf6' },
]);

function getGridSize() {
  const value = parseInt(localStorage.getItem(GRID_SIZE_KEY), 10);
  return [2, 3, 4].includes(value) ? value : 2;
}

function applyGridSize(size) {
  if (![2, 3, 4].includes(size)) size = 2;
  document.documentElement.style.setProperty('--books-grid-columns', String(size));
  localStorage.setItem(GRID_SIZE_KEY, String(size));
}

function getAppTheme() {
  return localStorage.getItem(APP_THEME_KEY) || 'dark';
}

function applyAppTheme(theme) {
  if (theme !== 'light') theme = 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  if (typeof markUiPrefsChanged === 'function') markUiPrefsChanged();
  localStorage.setItem(APP_THEME_KEY, theme);

  const btnDark = document.getElementById('appThemeBtnDark');
  const btnLight = document.getElementById('appThemeBtnLight');
  if (btnDark && btnLight) {
    btnDark.classList.toggle('active', theme === 'dark');
    btnLight.classList.toggle('active', theme === 'light');
  }
}

function getAppAccent() {
  let value = null;
  try { value = localStorage.getItem(APP_ACCENT_KEY); } catch (_) { /* хранилище недоступно */ }
  return APP_ACCENTS.some(accent => accent.id === value) ? value : 'orange';
}

function applyAppAccent(accent) {
  if (!APP_ACCENTS.some(item => item.id === accent)) accent = 'orange';
  document.documentElement.setAttribute('data-accent', accent);
  if (typeof markUiPrefsChanged === 'function') markUiPrefsChanged();
  try { localStorage.setItem(APP_ACCENT_KEY, accent); } catch (_) { /* хранилище недоступно */ }
  const meta = document.querySelector && document.querySelector('meta[name="theme-color"]');
  if (meta && getAppTheme() === 'dark') meta.setAttribute('content', '#0b0b0c');
}

function setAppAccent(accent) {
  applyAppAccent(accent);
  const item = APP_ACCENTS.find(entry => entry.id === accent);
  showToast(`Цвет: ${item ? item.label.toLowerCase() : 'оранжевый'}`);
}

// Цвет акцента для мест, где CSS-переменная недоступна: графики на canvas,
// атрибуты SVG, оформление EPUB внутри iframe.
function accentRgba(alpha = 1) {
  let rgb = '';
  try {
    rgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();
  } catch (_) { /* нет DOM — например, в тестах */ }
  if (!rgb) rgb = '255, 92, 31';
  return `rgba(${rgb}, ${alpha})`;
}

function setAppTheme(theme) {
  applyAppTheme(theme);
  showToast(theme === 'light' ? 'Светлая тема' : 'Тёмная тема');
}

// Применяем сохранённые настройки до запуска основной логики приложения.
applyGridSize(getGridSize());
applyAppTheme(getAppTheme());
applyAppAccent(getAppAccent());
