// ========== CATALOG & FILTERS ==========
function toggleCatalogPanel() { state.catalogOpen = !state.catalogOpen; document.getElementById('catalogPanel').classList.toggle('show', state.catalogOpen); if (state.catalogOpen) populateCatalog(); }
function closeCatalogPanel() { state.catalogOpen = false; document.getElementById('catalogPanel').classList.remove('show'); }
function populateCatalog() {
  // Собираем все уникальные категории из всех книг
  const allCats = new Set();
  state.books.forEach(b => (b.categories || []).forEach(c => allCats.add(c)));
  const cats = [...allCats];
  document.getElementById('catalogChips').innerHTML = cats.map((c, idx) => {
  const isActive = state.filters.categories.includes(c);
  return `<span class="catalog-chip${isActive ? ' active' : ''}" data-cat-idx="${idx}" data-onclick="toggleCategoryFilter(window._catCache[${idx}])">${eh(c)}</span>`;
}).join('');
window._catCache = cats;
  document.getElementById('filterSort').value = state.filters.sort;
}
function toggleCategoryFilter(c) { const idx = state.filters.categories.indexOf(c); if (idx === -1) state.filters.categories.push(c); else state.filters.categories.splice(idx, 1); populateCatalog(); applyFilters(); }
function applyFilters() { state.booksPage = 1; state.filters.sort = document.getElementById('filterSort').value; renderHome(); showToast('Применено'); }
function resetFilters() { state.filters = { categories: [], sort: 'default' }; populateCatalog(); renderHome(); showToast('Сброшено'); }
function getFilteredBooks() {
  let books = [...state.books]; const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  if (q) books = books.filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q));
  if (state.filters.categories.length > 0) {
    books = books.filter(b => {
      const bCats = b.categories || [];
      return state.filters.categories.some(filterCat => bCats.includes(filterCat));
    });
  }
  switch (state.filters.sort) {
    case 'rating': books.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating)); break;
    case 'title': books.sort((a, b) => a.title.localeCompare(b.title)); break;
    case 'dateAdded': books.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded)); break;
    case 'datePublished': books.sort((a, b) => new Date(b.datePublished || '2020-01-01') - new Date(a.datePublished || '2020-01-01')); break;
    default: books.sort((a, b) => b.popularity - a.popularity);
  }
  return books;
}
