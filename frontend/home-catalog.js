// Пагинация и карточки каталога на главной странице.
const BOOKS_PER_PAGE = 24;
function renderPaginatedBooks(id, books, query) {
  const container = document.getElementById(id);
  if (!container) return;
  const pager = document.getElementById('booksPager');
  const total = books.length;
  const totalPages = Math.max(1, Math.ceil(total / BOOKS_PER_PAGE));
  let page = state.booksPage || 1;
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;
  state.booksPage = page;

  const start = (page - 1) * BOOKS_PER_PAGE;
  const pageBooks = books.slice(start, start + BOOKS_PER_PAGE);
  // Книги — напрямую в grid-контейнер (как карточки), без обёртки,
  // иначе grid раскладывает обёртку и пагинатор по ячейкам.
  container.innerHTML = pageBooks.map(b => cardHTML(b, query)).join('');

  // Панель пагинации — в отдельный контейнер под сеткой (вне grid)
  if (!pager) return;
  if (totalPages <= 1) { pager.replaceChildren(); return; }

  const btn = (p, label, active, disabled) =>
    `<button data-onclick="goToBooksPage(${p})" ${disabled ? 'disabled' : ''}
      data-dynamic-style="${dynamicStyleToken`min-width:38px;height:38px;padding:0 8px;border-radius:9px;border:1px solid ${active ? 'var(--accent)' : 'var(--border)'};
             background:${active ? 'var(--accent)' : 'var(--bg-card)'};color:${active ? '#fff' : 'var(--text-primary)'};
             font-family:inherit;font-size:13px;font-weight:${active ? '700' : '500'};cursor:${disabled ? 'default' : 'pointer'};
             opacity:${disabled ? '0.4' : '1'};`}">${label}</button>`;
  const nums = [];
  const around = 1;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || (p >= page - around && p <= page + around)) {
      nums.push(p);
    } else if (nums[nums.length - 1] !== '...') {
      nums.push('...');
    }
  }
  const numsHtml = nums.map(p =>
    p === '...' ? `<span data-static-style="a320">…</span>` : btn(p, p, p === page, false)
  ).join('');
  pager.innerHTML = `
    <div data-static-style="a321">
      ${btn(page - 1, '‹', false, page === 1)}
      ${numsHtml}
      ${btn(page + 1, '›', false, page === totalPages)}
    </div>
    <div data-static-style="a322">
      Страница ${page} из ${totalPages} · всего книг: ${total}
    </div>`;
}

function goToBooksPage(p) {
  state.booksPage = p;
  const sorted = getFilteredBooks();
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  renderPaginatedBooks('scrollAll', sorted, q);
  const all = document.getElementById('scrollAll');
  if (all) all.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function extractBookYear(datePublished) {
  if (!datePublished) return null;
  const s = String(datePublished);
  const match = s.match(/\d{4}/);
  return match ? match[0] : null;
}

function cardHTML(b, query, options) {
  const opts = options || {};
  const p = state.readingProgress[b.id];
  const pct = p?.started ? Math.min(Math.round(p.currentPage / p.totalPages * 100), 100) : 0;

  const coverInner = b.has_cover
    ? `<img src="${api.books.coverUrl(b.id)}" alt="" loading="lazy"
            data-static-style="a118"
            data-onerror="replaceWithFallback()" data-args="this" data-fallback="coverBg">`
    : `<div class="cover-bg">${ICONS.bookCover}</div>`;

  const year = extractBookYear(b.datePublished);

  return `<div class="book-card-compact" data-onclick="openBookDetail(${b.id})" data-book-id="${b.id}" draggable="true">
    <div class="cover-area">
      ${coverInner}
      <div class="rating-badge">${ICONS.star}${b.rating}</div>
      ${offlineBookIds.has(b.id) ? `<div class="offline-badge" title="Доступна оффлайн">${ICONS.cloudCheck}</div>` : ''}
      ${pct ? `<div class="progress-badge">${pct}%</div><div class="progress-indicator" data-dynamic-style="${dynamicStyleToken`width:${pct}%`}"></div>` : ''}
      ${opts.removable ? `<button data-onclick="hideFromResume(${b.id})" title="Убрать из «Продолжить»" aria-label="Убрать из «Продолжить»" data-static-style="a323">&times;</button>` : ''}
    </div>
    <div class="book-card-meta">
      <div class="book-card-title" title="${eh(b.title)}">${eh(b.title)}</div>
      ${year ? `<div class="book-card-year">${eh(year)}</div>` : ''}
    </div>
  </div>`;
}
