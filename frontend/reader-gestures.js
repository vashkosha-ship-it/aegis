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
  initPdfPinchZoom();

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
  // Страница увеличена или только что был щипок — палец двигает страницу,
  // а не листает её.
  if (!isEpubMode && (pdfZoom > 1 || pdfPinch.recent)) return;
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
  // Пока у EPUB считается нумерация, листаем средствами epub.js.
  if (isEpubMode && epubRendition && !epubLocationsReady) {
    epubRendition.next();
    return;
  }
  const current = isEpubMode ? epubCurrentPage : pdfCurrentPage;
  const total = isEpubMode ? epubTotalPages : pdfTotalPages;
  if (current < total) {
    goToPage(current + 1);
  }
}

function goToPrevPage() {
  if (isEpubMode && epubRendition && !epubLocationsReady) {
    epubRendition.prev();
    return;
  }
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

// ========== УВЕЛИЧЕНИЕ PDF ЩИПКОМ ==========
// Масштаб браузера в приложении выключен (иначе ломается интерфейс), поэтому
// страницу PDF увеличиваем сами: во время жеста — быстрым CSS-масштабом,
// после — перерисовкой в чёткости под новый размер.
const PDF_ZOOM_MIN = 1;
const PDF_ZOOM_MAX = 3;
const pdfPinch = { active: false, startDist: 0, startZoom: 1, ratio: 1, originX: 0, originY: 0, recent: false };

function _pinchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function initPdfPinchZoom() {
  const viewport = document.getElementById('pdfViewport');
  if (!viewport || viewport.dataset.pinchReady) return;
  viewport.dataset.pinchReady = '1';

  viewport.addEventListener('touchstart', e => {
    if (isEpubMode || e.touches.length !== 2) return;
    const canvas = document.getElementById('pdfCanvas');
    const rect = canvas.getBoundingClientRect();
    pdfPinch.active = true;
    pdfPinch.recent = true;
    pdfPinch.startDist = _pinchDistance(e.touches) || 1;
    pdfPinch.startZoom = pdfZoom;
    pdfPinch.ratio = 1;
    pdfPinch.originX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
    pdfPinch.originY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
    canvas.style.transformOrigin = `${pdfPinch.originX}px ${pdfPinch.originY}px`;
  }, { passive: true });

  viewport.addEventListener('touchmove', e => {
    if (!pdfPinch.active || e.touches.length !== 2) return;
    e.preventDefault();
    const target = Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, pdfPinch.startZoom * _pinchDistance(e.touches) / pdfPinch.startDist));
    pdfPinch.ratio = target / pdfPinch.startZoom;
    document.getElementById('pdfCanvas').style.transform = `scale(${pdfPinch.ratio})`;
    const textLayer = document.getElementById('pdfTextLayer');
    if (textLayer) textLayer.style.visibility = 'hidden';
  }, { passive: false });

  const finish = async () => {
    if (!pdfPinch.active) return;
    pdfPinch.active = false;
    setTimeout(() => { pdfPinch.recent = false; }, 350);
    const canvas = document.getElementById('pdfCanvas');
    const newZoom = Math.round(pdfPinch.startZoom * pdfPinch.ratio * 100) / 100;
    const zoom = newZoom < 1.08 ? 1 : Math.min(PDF_ZOOM_MAX, newZoom);
    // Точка под пальцами остаётся на месте после перерисовки.
    const factor = zoom / pdfPinch.startZoom;
    const anchorX = pdfPinch.originX * factor;
    const anchorY = pdfPinch.originY * factor;
    const viewportRect = viewport.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const screenX = canvasRect.left - viewportRect.left + pdfPinch.originX * pdfPinch.ratio;
    const screenY = canvasRect.top - viewportRect.top + pdfPinch.originY * pdfPinch.ratio;
    pdfZoom = zoom;
    await renderPdfPage(pdfCurrentPage);
    canvas.style.transform = '';
    const textLayer = document.getElementById('pdfTextLayer');
    if (textLayer) textLayer.style.visibility = '';
    viewport.scrollLeft = Math.max(0, canvas.offsetLeft + anchorX - screenX);
    viewport.scrollTop = Math.max(0, canvas.offsetTop + anchorY - screenY);
  };
  viewport.addEventListener('touchend', e => { if (e.touches.length < 2) finish(); }, { passive: true });
  viewport.addEventListener('touchcancel', finish, { passive: true });

  // Двойное касание: увеличить вдвое / вернуть по ширине экрана.
  let lastTap = 0;
  viewport.addEventListener('touchend', e => {
    if (isEpubMode || e.touches.length || e.changedTouches.length !== 1) return;
    const now = Date.now();
    if (now - lastTap < 300) {
      lastTap = 0;
      pdfZoom = pdfZoom > 1 ? 1 : 2;
      renderPdfPage(pdfCurrentPage);
    } else {
      lastTap = now;
    }
  }, { passive: true });
}
