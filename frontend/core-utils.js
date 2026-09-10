function icon(name) {
  return ICONS[name] || '';
}

// ========== УТИЛИТЫ ==========
function createParticles() {
  const c = document.getElementById('particlesContainer');
  if (!c) return;
  for (let i = 0; i < 15; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (Math.random() * 10 + 8) + 's';
    p.style.animationDelay = Math.random() * 8 + 's';
    c.appendChild(p);
  }
}
createParticles();

function getTodayISO() { return new Date().toISOString().split('T')[0]; }
function getYesterdayISO() { const d = new Date(Date.now() - 86400000); return d.toISOString().split('T')[0]; }
function eh(s) { const d = document.createElement('div'); d.textContent = (s || ''); return d.innerHTML; }

function replaceWithStaticText(container, text, staticStyle, tagName = 'div') {
  if (!container) return null;
  const allowedTags = ['div', 'span', 'p'];
  const safeTag = allowedTags.includes(tagName) ? tagName : 'div';
  const node = document.createElement(safeTag);
  if (staticStyle) node.setAttribute('data-static-style', staticStyle);
  node.textContent = String(text ?? '');
  container.replaceChildren(node);
  return node;
}

function replaceSelectOptions(select, items) {
  if (!select) return [];
  const fragment = document.createDocumentFragment();
  (items || []).forEach(item => {
    const option = document.createElement('option');
    const normalized = typeof item === 'object' && item !== null
      ? item
      : { value: item, label: item };
    option.value = String(normalized.value ?? '');
    option.textContent = String(normalized.label ?? normalized.value ?? '');
    option.selected = Boolean(normalized.selected);
    fragment.appendChild(option);
  });
  select.replaceChildren(fragment);
  return Array.from(select.options);
}

function bookCategoriesText(book) {
  if (!book.categories || book.categories.length === 0) {
    return 'Без категории';
  }
  return book.categories.map(c => eh(c)).join(', ');
}
