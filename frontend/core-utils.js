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

function bookCategoriesText(book) {
  if (!book.categories || book.categories.length === 0) {
    return 'Без категории';
  }
  return book.categories.map(c => eh(c)).join(', ');
}

