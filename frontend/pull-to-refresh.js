// ===== A2: Pull-to-refresh на главной =====
function initPullToRefresh() {
  let startY = 0, pulling = false, indicator = null;
  const THRESHOLD = 70;

  function getScroller() {
    // Тянем только когда на главной и страница вверху
    if (state.currentScreen !== 'home') return null;
    return document.scrollingElement || document.documentElement;
  }

  document.addEventListener('touchstart', (e) => {
    const sc = getScroller();
    if (!sc || sc.scrollTop > 5) { pulling = false; return; }
    startY = e.touches[0].clientY;
    pulling = true;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 10) {
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:4000;background:var(--bg-elevated);border:1px solid var(--border);border-radius:0 0 14px 14px;padding:8px 18px;font-size:12px;color:var(--accent);box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:opacity 0.2s;';
        document.body.appendChild(indicator);
      }
      const ready = dy >= THRESHOLD;
      indicator.textContent = ready ? '↓ Отпустите для обновления' : '↓ Потяните вниз';
      indicator.style.opacity = Math.min(1, dy / THRESHOLD);
    }
  }, { passive: true });

  document.addEventListener('touchend', async (e) => {
    if (!pulling || !indicator) { pulling = false; return; }
    const dy = (e.changedTouches[0]?.clientY || 0) - startY;
    const ind = indicator;
    indicator = null; pulling = false;
    if (dy >= THRESHOLD) {
      ind.textContent = '⟳ Обновляю…';
      if (navigator.vibrate) navigator.vibrate(15);
      try {
        await Promise.allSettled([
          loadBooksFromApi?.(),
          loadMyListFromApi?.(),
          loadProgressFromApi?.(),
        ]);
        if (typeof renderHome === 'function') renderHome();
        showToast('Обновлено');
      } catch (_) {}
    }
    ind.style.opacity = '0';
    setTimeout(() => ind.remove(), 250);
  });
}
