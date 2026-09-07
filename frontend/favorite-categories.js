'use strict';

/*
 * Избранные категории главной страницы.
 * Зависимости (state, lsGet/lsSet, setHomeBooksTab и renderHome) предоставляет
 * app.js; функции вызываются только после загрузки всех defer-скриптов.
 */

// ===== Избранные категории =====
const FAV_CATS_KEY = 'aegis_fav_categories';

function getFavCategories() {
  try {
    const stored = JSON.parse(lsGet(FAV_CATS_KEY) || '[]');
    return Array.isArray(stored)
      ? [...new Set(stored.filter(cat => typeof cat === 'string' && cat.trim()).map(cat => cat.trim()))]
      : [];
  } catch (_) {
    return [];
  }
}

function saveFavCategories(categories) {
  lsSet(FAV_CATS_KEY, JSON.stringify(categories));
}

function availableBookCategories() {
  const categories = new Set();
  (state.books || []).forEach(book => {
    (book.categories || []).forEach(category => {
      if (typeof category === 'string' && category.trim()) categories.add(category.trim());
    });
  });
  return [...categories].sort((left, right) => left.localeCompare(right, 'ru'));
}

function toggleFavCategory(category) {
  if (typeof category !== 'string' || !category.trim()) return;
  const normalized = category.trim();
  const available = availableBookCategories();
  if (!available.includes(normalized)) return;

  const favorites = getFavCategories();
  const index = favorites.indexOf(normalized);
  if (index >= 0) favorites.splice(index, 1);
  else favorites.push(normalized);

  saveFavCategories(favorites);
  if (typeof navigator.vibrate === 'function') navigator.vibrate(10);
  renderFavCategories();
  renderFavCatsPicker();
}

function createFavCategoryButton(label, active, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = active ? 'fav-category-chip is-active' : 'fav-category-chip';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function renderFavCategories() {
  const section = document.getElementById('sectionFavCategories');
  const container = document.getElementById('favCategoriesChips');
  if (!section || !container) return;

  container.replaceChildren();
  getFavCategories().forEach(category => {
    container.appendChild(
      createFavCategoryButton(category, true, () => filterByCategory(category)),
    );
  });
  container.appendChild(
    createFavCategoryButton('+ Тема', false, openFavCatsPicker),
  );
  section.style.display = 'block';
}

function filterByCategory(category) {
  const input = document.getElementById('searchInput');
  if (input) input.value = category;
  setHomeBooksTab('all');
  renderHome();
  document.getElementById('scrollAll')?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

function closeFavCatsPicker() {
  document.getElementById('favCatsPickerModal')?.remove();
}

function openFavCatsPicker() {
  closeFavCatsPicker();

  const modal = document.createElement('div');
  modal.id = 'favCatsPickerModal';
  modal.className = 'fav-categories-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'favCatsPickerTitle');

  const panel = document.createElement('div');
  panel.className = 'fav-categories-panel';

  const header = document.createElement('div');
  header.className = 'fav-categories-header';

  const title = document.createElement('h3');
  title.id = 'favCatsPickerTitle';
  title.textContent = 'Избранные темы';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'fav-categories-close';
  closeButton.setAttribute('aria-label', 'Закрыть');
  closeButton.textContent = '✕';
  closeButton.addEventListener('click', closeFavCatsPicker);

  const body = document.createElement('div');
  body.id = 'favCatsPickerBody';

  header.append(title, closeButton);
  panel.append(header, body);
  modal.appendChild(panel);
  modal.addEventListener('click', event => {
    if (event.target === modal) closeFavCatsPicker();
  });
  document.body.appendChild(modal);
  renderFavCatsPicker();
  closeButton.focus();
}

function renderFavCatsPicker() {
  const body = document.getElementById('favCatsPickerBody');
  if (!body) return;

  body.replaceChildren();
  const categories = availableBookCategories();
  const favorites = getFavCategories();

  if (categories.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'fav-categories-empty';
    empty.textContent = 'Категорий пока нет';
    body.appendChild(empty);
    return;
  }

  categories.forEach(category => {
    const active = favorites.includes(category);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = active ? 'fav-category-option is-active' : 'fav-category-option';
    button.addEventListener('click', () => toggleFavCategory(category));

    const label = document.createElement('span');
    label.textContent = category;
    const marker = document.createElement('span');
    marker.className = 'fav-category-marker';
    marker.textContent = active ? '✓' : '+';

    button.append(label, marker);
    body.appendChild(button);
  });
}

