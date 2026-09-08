// ========== ЧИТАЛКА: ТЁМНАЯ ТЕМА ==========

const READER_THEME_KEY = 'aegis_reader_theme';

function getReaderTheme() {
  return localStorage.getItem(READER_THEME_KEY) || 'light';
}

function applyReaderTheme(theme) {
  const screen = document.getElementById('readerScreen');
  if (theme === 'dark') {
    screen.classList.add('reader-theme-dark');
  } else {
    screen.classList.remove('reader-theme-dark');
  }

  // Обновляем иконку на кнопке
  const btn = document.getElementById('btnReaderTheme');
  if (btn) {
    btn.innerHTML = ICONS.theme;
    btn.title = theme === 'dark' ? 'Светлая тема' : 'Тёмная тема';
  }

  // Для EPUB — применяем тему через epubjs
  if (typeof epubRendition !== 'undefined' && epubRendition) {
    try {
      epubRendition.themes.register('aegis-dark', {
        'body': {
          'background': '#1a1a1a !important',
          'color': '#e0e0e0 !important',
        },
        'p, div, span, h1, h2, h3, h4, h5, h6, li, td, th, blockquote': {
          'color': '#e0e0e0 !important',
        },
        'a': {
          'color': '#00d4ff !important',
        },
      });
      epubRendition.themes.register('aegis-light', {
        'body': {
          'background': '#fff !important',
          'color': '#000 !important',
        },
      });
      epubRendition.themes.select(theme === 'dark' ? 'aegis-dark' : 'aegis-light');
    } catch (e) {
      console.warn('Не удалось применить тему EPUB:', e);
    }
  }
}

function toggleReaderTheme() {
  const current = getReaderTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(READER_THEME_KEY, next);
  applyReaderTheme(next);
  showToast(next === 'dark' ? 'Тёмная тема' : 'Светлая тема');
}
