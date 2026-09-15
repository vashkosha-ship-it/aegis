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

function appendTrustedIcon(container, markup) {
  if (!container || !markup) return null;
  // HTML-парсер помещает <svg> в SVG namespace. XML-парсер без явного
  // xmlns создавал внешне правильный, но не рисуемый браузером XML-элемент:
  // кнопка занимала место, а сама иконка оставалась пустой.
  const parsed = new DOMParser().parseFromString(String(markup), 'text/html');
  const svg = parsed.body.firstElementChild;
  if (
    !svg
    || parsed.body.childElementCount !== 1
    || svg.localName !== 'svg'
    || svg.namespaceURI !== 'http://www.w3.org/2000/svg'
    || svg.querySelector('script, foreignObject, iframe, object, embed, image, use')
  ) {
    return null;
  }
  const nodes = [svg, ...svg.querySelectorAll('*')];
  if (nodes.some(node => Array.from(node.attributes).some(attr =>
    /^on/i.test(attr.name) || /^(?:style|href|xlink:href)$/i.test(attr.name)
  ))) return null;
  const iconNode = document.importNode(svg, true);
  container.appendChild(iconNode);
  return iconNode;
}

function replaceWithTrustedIcon(container, markup) {
  if (!container) return null;
  container.replaceChildren();
  return appendTrustedIcon(container, markup);
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
