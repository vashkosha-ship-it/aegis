// Book adaptation, library loading, home screen and book details.
// Loaded as a classic script before app.js; public handlers intentionally remain global.

function adaptBookFromApi(b) {
  // Определяем наличие файла по всем возможным полям
  const hasPdf = b.has_pdf === true || b.has_pdf === 'true' || b.has_pdf === 1;
  const hasEpub = b.has_epub === true || b.has_epub === 'true' || b.has_epub === 1;
  const hasFile = b.has_file === true || b.has_file === 'true' || b.has_file === 1;
  const hasFormat = b.file_format === 'pdf' || b.file_format === 'epub';
  
  // Если API вернул has_file напрямую — верим ему. Иначе проверяем has_pdf/has_epub/file_format
  const has_file = hasFile || hasPdf || hasEpub || hasFormat;

  return {
    id: b.id,
    title: b.title,
    author: b.author,
    categories: b.categories || [],  // ← массив!
    rating: typeof b.rating === 'string' ? b.rating : Number(b.rating).toFixed(1),
    icon: b.icon || ICONS.bookCover,
    desc: b.description || '',
    has_file: !!(b.has_pdf || b.has_epub || b.has_file),
    has_cover: !!(b.has_cover || b.cover_url),
    file_format: b.file_format || 'pdf',
    total_pages: b.total_pages || 0,
    dateAdded: (b.created_at || '').split('T')[0],
    datePublished: b.date_published || null,
    popularity: b.popularity || 50,
    views: b.views || 0,
    downloads: b.downloads || 0,
  };
}

function ensureProgress(book) {
  if (!state.readingProgress[book.id]) {
    state.readingProgress[book.id] = {
      currentPage: 1,
      totalPages: book.total_pages > 0 ? book.total_pages : 20,
      started: false,
    };
  } else if (book.total_pages > 0 && state.readingProgress[book.id].totalPages !== book.total_pages) {
    state.readingProgress[book.id].totalPages = book.total_pages;
  }
}

async function loadBooksFromApi() {
  // Показываем скелетон-заглушки, пока книги грузятся (вместо пустого экрана)
  if (!state.books || state.books.length === 0) {
    showSkeleton('scrollPopular', 6);
    showSkeleton('scrollAll', 6);
  }
  try {
    const perPage = 100;
    let page = 1;
    let all = [];
    let total = Infinity;
    // догружаем страницы, пока не соберём все книги (защита: максимум 50 страниц = 5000 книг)
    while (all.length < total && page <= 50) {
      const data = await api.books.list({ per_page: perPage, page });
      if (typeof data.total === 'number') total = data.total;
      const items = data.items || [];
      all = all.concat(items);
      if (items.length < perPage) break; // последняя страница
      page++;
    }
    state.books = all.map(adaptBookFromApi);
    state.books.forEach(b => { ensureProgress(b); });
    saveState();
    return true;
  } catch (err) {
    console.error('Не удалось загрузить книги с API:', err);
    // Нет сети — показываем скачанные книги из оффлайн-хранилища вместо пустого экрана
    if (!navigator.onLine) {
      const ok = await loadBooksFromOffline();
      if (ok) { showToast('Офлайн-режим: показаны скачанные книги'); return true; }
    }
    showToast('Не удаётся загрузить книги с сервера');
    state.books = [];
    return false;
  }
}

// ========== HOME ==========
function renderHome() {
  if (!state.currentUser) return;
  updateAvatar('avatarHome');
  const isAdmin = state.currentUser.role === 'admin';
  document.getElementById('badgeHome').classList.toggle('hidden', !isAdmin);
  document.getElementById('btnAdminGo').classList.toggle('hidden', !isAdmin);
  updateFabVisibility();
  const sorted = getFilteredBooks(), q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const isSearching = q.trim().length > 0;

  const sectionResume = document.getElementById('sectionResume');
  const sectionContinue = document.getElementById('sectionContinue');
  const sectionFavCats = document.getElementById('sectionFavCategories');
  const sectionRecommend = document.getElementById('sectionRecommendations');
  const sectionGoal = document.getElementById('sectionBooksGoal');
  const booksTabs = document.querySelector('#sectionBooks .books-tabs');

  if (isSearching) {
    // Режим поиска: прячем рекомендации/продолжить/возобновить/цели/табы,
    // показываем только результаты поиска единым списком.
    if (sectionContinue) sectionContinue.style.display = 'none';
    if (sectionFavCats) sectionFavCats.style.display = 'none';
    if (sectionRecommend) sectionRecommend.style.display = 'none';
    if (sectionResume) sectionResume.style.display = 'none';
    if (sectionGoal) sectionGoal.style.display = 'none';
    if (booksTabs) booksTabs.style.display = 'none';
    const pop = document.getElementById('scrollPopular');
    const all = document.getElementById('scrollAll');
    if (pop) { pop.classList.add('hidden'); pop.innerHTML = ''; }
    if (all) all.classList.remove('hidden');
    const pager = document.getElementById('booksPager');
    if (sorted.length === 0) {
      // Ничего не найдено — дружелюбное сообщение вместо пустоты
      if (all) all.innerHTML = `
        <div data-static-style="a312">
          <div data-static-style="a313">🔍</div>
          <div data-static-style="a314">По запросу «${eh(q)}» ничего не найдено</div>
          <div data-static-style="a315">Попробуйте другие слова или проверьте раскладку клавиатуры</div>
        </div>`;
      if (pager) pager.innerHTML = '';
    } else {
      renderPaginatedBooks('scrollAll', sorted, q);
    }
    return;
  }

  // Обычный режим — возвращаем секции и табы
  if (sectionContinue) sectionContinue.style.display = '';
  if (booksTabs) booksTabs.style.display = '';

  renderContinueScroll(sorted, q);
  renderBookScroll('scrollPopular', [...sorted].sort((a, b) => b.popularity - a.popularity).slice(0, 5), q);
  renderPaginatedBooks('scrollAll', sorted, q);
  setHomeBooksTab(state.homeBooksTab || 'popular');
  renderBooksGoalWidget();
  renderFavCategories();
  renderRecommendations();
}

function setHomeBooksTab(tab) {
  state.homeBooksTab = tab;
  document.querySelectorAll('.books-tab').forEach(b => b.classList.toggle('active', b.dataset.btab === tab));
  const pop = document.getElementById('scrollPopular');
  const all = document.getElementById('scrollAll');
  if (pop) pop.classList.toggle('hidden', tab !== 'popular');
  if (all) all.classList.toggle('hidden', tab !== 'all');
  // Пагинатор показываем только на вкладке «Все книги»
  const pager = document.getElementById('booksPager');
  if (pager) pager.style.display = (tab === 'all') ? 'block' : 'none';
  // При переходе на «Все книги» сразу перерисовываем книги и пагинатор,
  // иначе панель страниц появляется с задержкой (scrollAll был hidden при первом рендере).
  if (tab === 'all') {
    const sorted = getFilteredBooks();
    const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
    renderPaginatedBooks('scrollAll', sorted, q);
  }
}

// ========== DETAIL ==========
document.getElementById('detailTabs')?.addEventListener('click', e => {
  const t = e.target.closest('.detail-tab');
  if (!t) return;
  state.detailTab = t.dataset.dtab;
  document.querySelectorAll('.detail-tab').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  document.querySelectorAll('.detail-tab-content').forEach(x => x.classList.add('hidden'));
  const tabId = 'detailTab' + t.dataset.dtab.charAt(0).toUpperCase() + t.dataset.dtab.slice(1);
  const el = document.getElementById(tabId);
  if (el) el.classList.remove('hidden');
  if (state.detailTab === 'reviews') { reviewRating = 0; renderReviews(); }
  if (state.detailTab === 'discussion') renderDiscussion();
  if (state.detailTab === 'training') renderDetailTraining();
  if (state.detailTab === 'notes') renderDetailNotes();
});

function openBookDetail(bookId) {
  const b = state.books.find(x => x.id === bookId);
  if (!b) return;
  state.currentBook = b;
  currentBookId = bookId;
  state.detailTab = 'info';
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.toggle('active', t.dataset.dtab === 'info'));
  document.querySelectorAll('.detail-tab-content').forEach(x => x.classList.add('hidden'));
  document.getElementById('detailTabInfo').classList.remove('hidden');
  navigateTo('detail');
  renderBookInfo();
  refreshBookFromApi(bookId).then(() => {
    if (state.currentScreen === 'detail' && currentBookId === bookId) renderBookInfo();
  });
}

function renderBookInfo() {
  const b = state.books.find(x => x.id === currentBookId);
  if (!b) return;
  const isAdmin = state.currentUser?.role === 'admin';
  const views = b.views || 0;
  const downloads = b.downloads || 0;
  const formatLabel = (b.file_format || 'pdf').toUpperCase();
  let adminStats = '';
  if (isAdmin) {
    adminStats = `<div class="admin-book-stats"><span>${ICONS.eye} ${views} просмотров</span><span>${ICONS.download} ${downloads} скачиваний</span><span>${ICONS.fileText} ${formatLabel}</span></div>`;
  }
  document.getElementById('detailTabInfo').innerHTML = `
    <div class="detail-content">
      <div class="detail-cover">${b.has_cover ? `<img src="${api.books.coverUrl(b.id)}" alt="" data-static-style="a467" data-onerror="replaceWithFallback()" data-args="this" data-fallback="cover">` : ICONS.bookCover}</div>
      <div class="detail-info">
        <div class="detail-title">${eh(b.title)}</div>
        <div class="detail-author">${eh(b.author)}</div>
        <div class="detail-rating">${ICONS.star} ${b.rating}</div>
        <div class="detail-category">${bookCategoriesText(b)} • ${formatLabel}</div>
        <div class="detail-desc">${eh(b.desc)}</div>
        ${adminStats}
        <select class="mylist-status-select" data-onchange="onBookStatusChange(${b.id})" data-args="this">
          <option value="">Не в списке</option>
          <option value="reading" ${state.mylist[currentBookId] === 'reading' ? 'selected' : ''}>Читаю</option>
          <option value="planned" ${state.mylist[currentBookId] === 'planned' ? 'selected' : ''}>В планах</option>
          <option value="dropped" ${state.mylist[currentBookId] === 'dropped' ? 'selected' : ''}>Брошено</option>
          <option value="completed" ${state.mylist[currentBookId] === 'completed' ? 'selected' : ''}>Прочитано</option>
          <option value="liked" ${state.mylist[currentBookId] === 'liked' ? 'selected' : ''}>Избранное</option>
        </select>
        <div class="detail-actions">
          <button class="btn-detail" data-onclick="openReader(${b.id})">${ICONS.book} Читать</button>
          ${b.has_file ? (offlineBookIds.has(b.id)
            ? `<button class="btn-detail offline-btn-saved" data-onclick="removeBookOffline(${b.id})">${ICONS.cloudCheck} Удалить из оффлайн</button>`
            : `<button class="btn-detail offline-btn-save" data-onclick="saveBookOffline(${b.id})">${ICONS.cloudDownload} Сохранить оффлайн</button>`) : ''}
          ${(() => {
            const stage = findKillChainStageForBook(b);
            if (!stage) return '';
            return `<button class="btn-detail" data-static-style="a468" data-onclick="openARWithScheme('killchain', ${stage.id})" title="Открыть схему Cyber Kill Chain на этапе «${eh(stage.nameRu)}»">${ICONS.target} Смотреть схему атаки</button>`;
          })()}
          ${isAdmin ? `<button class="btn-detail" data-static-style="a469" data-onclick="openAdminBookModal(${b.id})">${ICONS.settings} Управление</button>` : ''}
          <button class="btn-detail" data-static-style="a470" data-onclick="openAddToCollection(${b.id})">${ICONS.bookmark || ''} В коллекцию</button>
        </div>
      </div>
    </div>
    <div id="alsoReadSection" data-static-style="a471"></div>`;
  loadAlsoRead(currentBookId);
}

// ========== EPUB READER ==========
