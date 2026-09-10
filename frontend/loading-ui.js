// ========== SKELETON LOADING ==========
function loadingSpinnerHTML(text) {
  return `
    <div data-static-style="a002">
      <div class="aegis-spinner"></div>
      <div data-static-style="a003">${text || 'Загрузка…'}</div>
    </div>`;
}

function renderLoadingSpinner(container, text) {
  if (!container) return null;
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-static-style', 'a002');
  const spinner = document.createElement('div');
  spinner.className = 'aegis-spinner';
  const label = document.createElement('div');
  label.setAttribute('data-static-style', 'a003');
  label.textContent = String(text || 'Загрузка…');
  wrapper.append(spinner, label);
  container.replaceChildren(wrapper);
  return wrapper;
}

function showSkeleton(containerId, count = 4) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < count; index += 1) {
    const card = document.createElement('div');
    card.className = 'skeleton-card';
    for (const className of ['skeleton-cover', 'skeleton-title', 'skeleton-text']) {
      const part = document.createElement('div');
      part.className = `skeleton ${className}`;
      card.appendChild(part);
    }
    fragment.appendChild(card);
  }
  container.replaceChildren(fragment);
}

function showListSkeleton(containerId, count = 3) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < count; index += 1) {
    const item = document.createElement('div');
    item.className = 'skeleton-list-item';
    const avatar = document.createElement('div');
    avatar.className = 'skeleton skeleton-avatar';
    const body = document.createElement('div');
    body.setAttribute('data-static-style', 'a004');
    const title = document.createElement('div');
    title.className = 'skeleton skeleton-title';
    title.setAttribute('data-static-style', 'a005');
    const text = document.createElement('div');
    text.className = 'skeleton skeleton-text';
    text.setAttribute('data-static-style', 'a006');
    body.append(title, text);
    item.append(avatar, body);
    fragment.appendChild(item);
  }
  container.replaceChildren(fragment);
}
