// Инициализация остальных интерактивных возможностей читалки.
document.addEventListener('DOMContentLoaded', () => {
  initPullToRefresh();
  initReaderBrightnessGesture();
});

// ===== A2: Gesture-zone яркости (вертикальный свайп слева в читалке) =====
let readerBrightness = parseFloat(localStorage.getItem('aegis_reader_brightness') || '1');
function applyReaderBrightness() {
  const vp = document.getElementById('pdfViewport');
  const ep = document.getElementById('epubViewport');
  [vp, ep].forEach(el => { if (el) el.style.filter = `brightness(${readerBrightness})`; });
}
function initReaderBrightnessGesture() {
  const zone = document.getElementById('tapZoneLeft');
  if (!zone) return;
  let startY = 0, startB = 1, active = false;
  zone.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY; startB = readerBrightness; active = true;
  }, { passive: true });
  zone.addEventListener('touchmove', (e) => {
    if (!active) return;
    const dy = startY - e.touches[0].clientY;       // вверх = ярче
    const delta = dy / 300;                          // чувствительность
    readerBrightness = Math.max(0.4, Math.min(1.6, startB + delta));
    applyReaderBrightness();
    if (Math.abs(dy) > 12) e.stopPropagation();      // чтобы не сработал тап-переход
  }, { passive: true });
  zone.addEventListener('touchend', () => {
    if (active) localStorage.setItem('aegis_reader_brightness', String(readerBrightness));
    active = false;
  });
  applyReaderBrightness();
}

// Ctrl+F / Cmd+F в читалке открывает панель
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f' && state.currentScreen === 'reader') {
    e.preventDefault();
    if (!readerSearchActive) toggleReaderSearch();
    else document.getElementById('readerSearchInput').focus();
  }
});

function closeReader() {
  hideEpubSelectionPopup();
  closeReaderSearch();
  if (window._pdfTextCache) window._pdfTextCache = {};
  document.querySelectorAll('.note-tooltip').forEach(e => e.remove());
  document.getElementById('selectionToolbar').style.display = 'none';

  // Удаляем EPUB-подсветку до сброса rendition и режима читалки.
  if (isEpubMode && epubRendition && window._lastEpubSearchCfi) {
    try {
      epubRendition.annotations.remove(window._lastEpubSearchCfi, 'highlight');
    } catch (_) { /* Подсветка уже могла быть удалена самим epub.js. */ }
  }
  window._lastEpubSearchCfi = null;

  if (state.currentBook) state.readingProgress[currentBookId].currentPage = isEpubMode ? epubCurrentPage : pdfCurrentPage;
  flushPendingProgress();
  isEpubMode = false;
  epubRendition = null;
  epubBook = null;

  const zone = document.getElementById('readerGestureZone');
  if (zone) {
    zone.removeEventListener('touchstart', handleTouchStart);
    zone.removeEventListener('touchend', handleTouchEnd);
    zone.removeEventListener('touchmove', handleTouchMove);
  }

  const returnTo = state._readerReturnTo || 'home';
  state._readerReturnTo = null;
  navigateTo(returnTo);

  // Если возвращаемся на детальную — она уже отрендерена (currentBookId сохранён)
  // Иначе на home — он сам перерисуется

}

