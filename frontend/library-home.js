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
    if (pop) { pop.classList.add('hidden'); pop.replaceChildren(); }
    if (all) all.classList.remove('hidden');
    const pager = document.getElementById('booksPager');
    if (sorted.length === 0) {
      // Ничего не найдено — дружелюбное сообщение вместо пустоты
      if (all) {
        const empty = document.createElement('div');
        empty.setAttribute('data-static-style', 'a312');
        const queryMessage = document.createElement('div');
        queryMessage.setAttribute('data-static-style', 'a314');
        queryMessage.textContent = `По запросу «${q}» ничего не найдено`;
        empty.append(
          Object.assign(document.createElement('div'), {
            textContent: '🔍',
          }),
          queryMessage,
          Object.assign(document.createElement('div'), {
            textContent: 'Попробуйте другие слова или проверьте раскладку клавиатуры',
          }),
        );
        empty.children[0].setAttribute('data-static-style', 'a313');
        empty.children[2].setAttribute('data-static-style', 'a315');
        all.replaceChildren(empty);
      }
      if (pager) pager.replaceChildren();
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

function _libraryNode(tagName, className, text, staticStyle) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (staticStyle) node.setAttribute('data-static-style', staticStyle);
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function _libraryIconText(icon, text) {
  const container = document.createElement('span');
  appendTrustedIcon(container, icon);
  container.appendChild(document.createTextNode(' ' + text));
  return container;
}

function _libraryAction(icon, text, onClick, className = 'btn-detail', staticStyle) {
  const button = _libraryNode('button', className, undefined, staticStyle);
  button.type = 'button';
  appendTrustedIcon(button, icon);
  button.appendChild(document.createTextNode(' ' + text));
  button.addEventListener('click', onClick);
  return button;
}

function renderBookInfo() {
  const book = state.books.find(item => item.id === currentBookId);
  if (!book) return;
  const target = document.getElementById('detailTabInfo');
  if (!target) return;

  const isAdmin = state.currentUser?.role === 'admin';
  const formatLabel = (book.file_format || 'pdf').toUpperCase();
  const content = _libraryNode('div', 'detail-content');
  const cover = _libraryNode('div', 'detail-cover');

  if (book.has_cover) {
    const image = _libraryNode('img', null, undefined, 'a467');
    image.src = api.books.coverUrl(book.id);
    image.alt = '';
    image.dataset.fallback = 'cover';
    image.addEventListener('error', () => replaceWithFallback(image), { once: true });
    cover.appendChild(image);
  } else {
    appendTrustedIcon(cover, ICONS.bookCover);
  }

  const info = _libraryNode('div', 'detail-info');
  info.append(
    _libraryNode('div', 'detail-title', book.title),
    _libraryNode('div', 'detail-author', book.author),
    _libraryIconText(ICONS.star, book.rating),
    _libraryNode('div', 'detail-category', `${bookCategoriesText(book)} • ${formatLabel}`),
    _libraryNode('div', 'detail-desc', book.desc),
  );
  info.children[2].className = 'detail-rating';

  if (isAdmin) {
    const stats = _libraryNode('div', 'admin-book-stats');
    stats.append(
      _libraryIconText(ICONS.eye, `${book.views || 0} просмотров`),
      _libraryIconText(ICONS.download, `${book.downloads || 0} скачиваний`),
      _libraryIconText(ICONS.fileText, formatLabel),
    );
    info.appendChild(stats);
  }

  const status = _libraryNode('select', 'mylist-status-select');
  [
    ['', 'Не в списке'],
    ['reading', 'Читаю'],
    ['planned', 'В планах'],
    ['dropped', 'Брошено'],
    ['completed', 'Прочитано'],
    ['liked', 'Избранное'],
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    status.appendChild(option);
  });
  status.value = state.mylist[currentBookId] || '';
  status.addEventListener('change', () => onBookStatusChange(book.id, status));
  info.appendChild(status);

  const actions = _libraryNode('div', 'detail-actions');
  actions.appendChild(_libraryAction(ICONS.book, 'Читать', () => openReader(book.id)));
  if (book.has_file) {
    if (offlineBookIds.has(book.id)) {
      actions.appendChild(
        _libraryAction(
          ICONS.cloudCheck,
          'Удалить из оффлайн',
          () => removeBookOffline(book.id),
          'btn-detail offline-btn-saved',
        ),
      );
    } else {
      actions.appendChild(
        _libraryAction(
          ICONS.cloudDownload,
          'Сохранить оффлайн',
          () => saveBookOffline(book.id),
          'btn-detail offline-btn-save',
        ),
      );
    }
  }

  const stage = findKillChainStageForBook(book);
  if (stage) {
    const arButton = _libraryAction(
      ICONS.target,
      'Смотреть схему атаки',
      () => openARWithScheme('killchain', stage.id),
      'btn-detail',
      'a468',
    );
    arButton.title = `Открыть схему Cyber Kill Chain на этапе «${stage.nameRu}»`;
    actions.appendChild(arButton);
  }
  if (isAdmin) {
    actions.appendChild(
      _libraryAction(
        ICONS.settings,
        'Управление',
        () => openAdminBookModal(book.id),
        'btn-detail',
        'a469',
      ),
    );
  }
  actions.appendChild(
    _libraryAction(
      ICONS.bookmark || '',
      'В коллекцию',
      () => openAddToCollection(book.id),
      'btn-detail',
      'a470',
    ),
  );

  info.appendChild(actions);
  content.append(cover, info);
  const alsoRead = _libraryNode('div', null, undefined, 'a471');
  alsoRead.id = 'alsoReadSection';
  target.replaceChildren(content, alsoRead);
  loadAlsoRead(currentBookId);
}

// ========== EPUB READER ==========
