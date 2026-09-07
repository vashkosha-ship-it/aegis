// ========== SKELETON LOADING ==========
function loadingSpinnerHTML(text) {
  return `
    <div data-static-style="a002">
      <div class="aegis-spinner"></div>
      <div data-static-style="a003">${text || 'Загрузка…'}</div>
    </div>`;
}

function showSkeleton(containerId, count = 4) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = Array(count).fill(`
    <div class="skeleton-card">
      <div class="skeleton skeleton-cover"></div>
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-text"></div>
    </div>
  `).join('');
}

function showListSkeleton(containerId, count = 3) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = Array(count).fill(`
    <div class="skeleton-list-item">
      <div class="skeleton skeleton-avatar"></div>
      <div data-static-style="a004">
        <div class="skeleton skeleton-title" data-static-style="a005"></div>
        <div class="skeleton skeleton-text" data-static-style="a006"></div>
      </div>
    </div>
  `).join('');
}

