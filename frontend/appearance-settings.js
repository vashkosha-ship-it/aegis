// Настройки внешнего вида приложения.
const APP_THEME_KEY = 'aegis_app_theme';
const GRID_SIZE_KEY = 'aegis_grid_size';

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
  localStorage.setItem(APP_THEME_KEY, theme);

  const btnDark = document.getElementById('appThemeBtnDark');
  const btnLight = document.getElementById('appThemeBtnLight');
  if (btnDark && btnLight) {
    btnDark.classList.toggle('active', theme === 'dark');
    btnLight.classList.toggle('active', theme === 'light');
  }
}

function setAppTheme(theme) {
  applyAppTheme(theme);
  showToast(theme === 'light' ? 'Светлая тема' : 'Тёмная тема');
}

// Применяем сохранённые настройки до запуска основной логики приложения.
applyGridSize(getGridSize());
applyAppTheme(getAppTheme());
