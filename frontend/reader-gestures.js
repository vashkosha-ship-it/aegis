// ========== READER (ЖЕСТЫ И СВАЙПЫ) ==========
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
const SWIPE_THRESHOLD = 50;
const SWIPE_RESTRAINT = 100;

function initReaderGestures() {
  const zone = document.getElementById('readerGestureZone');
  if (!zone) return;

  zone.removeEventListener('touchstart', handleTouchStart);
  zone.removeEventListener('touchend', handleTouchEnd);
  zone.removeEventListener('touchmove', handleTouchMove);

  zone.addEventListener('touchstart', handleTouchStart, { passive: true });
  zone.addEventListener('touchend', handleTouchEnd, { passive: true });
  zone.addEventListener('touchmove', handleTouchMove, { passive: true });

  const tapLeft = document.getElementById('tapZoneLeft');
  const tapRight = document.getElementById('tapZoneRight');
  if (tapLeft) tapLeft.onclick = () => goToPrevPage();
  if (tapRight) tapRight.onclick = () => goToNextPage();

  const arrowLeft = document.getElementById('readerArrowLeft');
  const arrowRight = document.getElementById('readerArrowRight');
  if (arrowLeft) arrowLeft.onclick = () => goToPrevPage();
  if (arrowRight) arrowRight.onclick = () => goToNextPage();
}

function handleTouchStart(e) {
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
}

function handleTouchMove(e) {
  touchEndX = e.changedTouches[0].screenX;
  touchEndY = e.changedTouches[0].screenY;
}

function handleTouchEnd() {
  // Если пользователь выделяет текст — не листаем (иначе выделение срывается)
  const sel = window.getSelection();
  if (sel && sel.toString().trim().length > 0) {
    return;
  }
  const diffX = touchStartX - touchEndX;
  const diffY = Math.abs(touchStartY - touchEndY);

  if (Math.abs(diffX) > SWIPE_THRESHOLD && diffY < SWIPE_RESTRAINT) {
    if (diffX > 0) {
      goToNextPage();
    } else {
      goToPrevPage();
    }
  }
}

function goToNextPage() {
  const current = isEpubMode ? epubCurrentPage : pdfCurrentPage;
  const total = isEpubMode ? epubTotalPages : pdfTotalPages;
  if (current < total) {
    goToPage(current + 1);
  }
}

function goToPrevPage() {
  const current = isEpubMode ? epubCurrentPage : pdfCurrentPage;
  if (current > 1) {
    goToPage(current - 1);
  }
}

let pageIndicatorTimeout = null;
function flashPageIndicator() {
  const indicator = document.getElementById('pageIndicatorOverlay');
  if (!indicator) return;
  indicator.classList.remove('hidden-indicator');
  if (pageIndicatorTimeout) clearTimeout(pageIndicatorTimeout);
  pageIndicatorTimeout = setTimeout(() => {
    indicator.classList.add('hidden-indicator');
  }, 2000);
}

function updatePageIndicator() {
  const total = isEpubMode ? (epubTotalPages || 1) : pdfTotalPages;
  const current = isEpubMode ? (epubCurrentPage || 1) : pdfCurrentPage;

  const topIndicator = document.getElementById('pageIndicatorTop');
  if (topIndicator) topIndicator.textContent = `${current} / ${total}`;
  if (typeof updateBookmarkIcon === 'function') updateBookmarkIcon();

  const overlayCurrent = document.getElementById('pageCurrent');
  const overlayTotal = document.getElementById('pageTotal');
  if (overlayCurrent) overlayCurrent.textContent = current;
  if (overlayTotal) overlayTotal.textContent = total;

  flashPageIndicator();
  try { maybeShowFinishReviewPrompt(); } catch (_) {}
}
