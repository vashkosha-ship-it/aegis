// Book adaptation, library loading, home screen and book details.
// Loaded as a classic script before app.js; public handlers intentionally remain global.

// Пока у книги нет ни одной оценки, рейтинг «0.0» выглядит как плохая
// оценка. Показываем его только если он есть.
function hasRating(book) {
  return Number(book && book.rating) > 0;
}

function adaptBookFromApi(b) {
  // Определяем наличие файла по всем возможным полям
  const hasPdf = b.has_pdf === true || b.has_pdf === 'true' || b.has_pdf === 1;
  const hasEpub = b.has_epub === true || b.has_epub === 'true' || b.has_epub === 1;
  const hasFile = b.has_file === true || b.has_file === 'true' || b.has_file === 1;
  // file_format описывает ожидаемый формат, но сам по себе не означает,
  // что бинарный файл уже загружен.
  const has_file = hasFile || hasPdf || hasEpub;

  return {
    id: b.id,
    title: b.title,
    author: b.author,
    categories: b.categories || [],  // ← массив!
    rating: typeof b.rating === 'string' ? b.rating : Number(b.rating).toFixed(1),
    icon: b.icon || ICONS.bookCover,
    desc: b.description || '',
    has_file,
    has_cover: !!(b.has_cover || b.cover_url),
    file_format: b.file_format || 'pdf',
    // Отпечаток файла книги: меняется, когда админ загружает новый файл.
    // По нему кэш на устройстве понимает, что копия устарела.
    file_version: b.file_version || null,
    total_pages: b.total_pages || 0,
    dateAdded: (b.created_at || '').split('T')[0],
    datePublished: b.date_published || null,
    popularity: b.popularity || 50,
    views: b.views || 0,
    downloads: b.downloads || 0,
    // Без этих полей админская таблица считала каждую книгу
    // «не индексировавшейся», хотя сервер возвращает реальный статус.
    has_pdf: hasPdf,
    has_epub: hasEpub,
    indexing_status: b.indexing_status || 'not_indexed',
    indexed_sections: b.indexed_sections || 0,
    indexing_finished_at: b.indexing_finished_at || null,
    indexed_at: b.indexed_at || null,
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
  if (api.isAuthBootstrapPending?.() && !state.currentUser) return false;
  // Показываем скелетон-заглушки, пока книги грузятся (вместо пустого экрана)
  if (!state.books || state.books.length === 0) {
    showSkeleton('scrollPopular', 6);
    showSkeleton('scrollAll', 6);
  }
  try {
    const perPage = 100;
    const maxPages = 50;   // защита: максимум 5000 книг
    // Первая страница сообщает общее число книг, остальные грузим
    // параллельно по несколько штук: по одной 20 страниц — это лишние секунды
    // при каждом входе, пока на экране пустая главная.
    const first = await api.books.list({ per_page: perPage, page: 1 });
    const firstItems = first.items || [];
    const total = typeof first.total === 'number' ? first.total : firstItems.length;
    const pageCount = Math.min(maxPages, Math.max(1, Math.ceil(total / perPage)));
    const pages = new Array(pageCount);
    pages[0] = firstItems;
    const queue = [];
    if (firstItems.length >= perPage) {
      for (let page = 2; page <= pageCount; page++) queue.push(page);
    }
    const PARALLEL = 4;
    await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
      while (queue.length) {
        const page = queue.shift();
        const data = await api.books.list({ per_page: perPage, page });
        pages[page - 1] = data.items || [];
      }
    }));
    const all = pages.flat().filter(Boolean);
    state.books = all.map(adaptBookFromApi);
    state.books.forEach(b => { ensureProgress(b); });
    saveState();
    return true;
  } catch (err) {
    if (!api.isNetworkError?.(err) && err?.status !== 401) {
      console.error('Не удалось загрузить книги с API:', err);
    }
    // Нет сети — показываем скачанные книги из оффлайн-хранилища вместо пустого экрана
    if (!navigator.onLine) {
      const ok = await loadBooksFromOffline();
      if (ok) { showToast('Офлайн-режим: показаны скачанные книги'); return true; }
    }
    if (typeof showActionToast === 'function') {
      showActionToast(
        getApiErrorMessage(err, 'Не удаётся загрузить книги с сервера'),
        'Повторить',
        () => loadBooksFromApi().then(() => renderHome()),
      );
    } else {
      showToast(getApiErrorMessage(err, 'Не удаётся загрузить книги с сервера'));
    }
    state.books = [];
    return false;
  }
}

// ========== HOME ==========
// Идёт поиск — на главной только результаты, без рекомендаций, целей и т. п.
function isHomeSearching() {
  return (document.getElementById('searchInput')?.value || '').trim().length > 0;
}

function renderHome() {
  if (!state.currentUser) return;
  updateAvatar('avatarHome');
  const isAdmin = state.currentUser.role === 'admin';
  document.getElementById('badgeHome').classList.toggle('hidden', !isAdmin);
  document.getElementById('btnAdminGo').classList.toggle('hidden', !isAdmin);
  if (typeof updateTeamEntryPoints === 'function') updateTeamEntryPoints();
  updateFabVisibility();
  const sorted = getFilteredBooks(), q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const isSearching = q.trim().length > 0;

  const sectionResume = document.getElementById('sectionResume');
  const sectionContinue = document.getElementById('sectionContinue');
  const sectionFavCats = document.getElementById('sectionFavCategories');
  const sectionRecommend = document.getElementById('sectionRecommendations');
  const sectionGoal = document.getElementById('sectionBooksGoal');
  const booksTabs = document.querySelector('#sectionBooks .books-tabs');

  const sectionBooks = document.getElementById('sectionBooks');
  if (isSearching) {
    // Режим поиска: прячем всё, кроме списка «Найдено» — он один для любого
    // запроса (названия, авторы и текст книг).
    if (sectionBooks) sectionBooks.style.display = 'none';
    if (sectionContinue) sectionContinue.style.display = 'none';
    if (sectionFavCats) sectionFavCats.style.display = 'none';
    if (sectionRecommend) sectionRecommend.style.display = 'none';
    if (sectionResume) sectionResume.style.display = 'none';
    if (sectionGoal) sectionGoal.style.display = 'none';
    if (booksTabs) booksTabs.style.display = 'none';
    // После перезагрузки или возврата список мог не успеть построиться.
    if (q.trim().length >= 2 && !document.getElementById('fullTextResults')
        && typeof runFullTextSearch === 'function') {
      runFullTextSearch({ silent: true });
    }
    return;
  }

  // Обычный режим — возвращаем секции и табы
  if (sectionBooks) sectionBooks.style.display = '';
  document.getElementById('fullTextResults')?.remove();
  if (sectionContinue) sectionContinue.style.display = '';
  if (booksTabs) booksTabs.style.display = '';

  renderContinueScroll(sorted, q);
  renderBookScroll('scrollPopular', [...sorted].sort((a, b) => b.popularity - a.popularity).slice(0, 5), q);
  renderPaginatedBooks('scrollAll', sorted, q);
  setHomeBooksTab(state.homeBooksTab || 'popular');
  renderBooksGoalWidget();
  renderFavCategories();
  renderRecommendations();
  if (typeof maybeRefreshAssignedForMe === 'function') maybeRefreshAssignedForMe();
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
  document.querySelectorAll('.detail-tab').forEach(tab => {
    tab.setAttribute('aria-selected', String(tab === t));
  });
  document.querySelectorAll('.detail-tab-content').forEach(x => x.classList.add('hidden'));
  const tabId = 'detailTab' + t.dataset.dtab.charAt(0).toUpperCase() + t.dataset.dtab.slice(1);
  const el = document.getElementById(tabId);
  if (el) el.classList.remove('hidden');
  if (state.detailTab === 'reviews') { reviewRating = 0; renderReviews(); }
  if (state.detailTab === 'discussion') renderDiscussion();
  if (state.detailTab === 'training') renderDetailTraining();
  if (state.detailTab === 'notes') renderDetailNotes();
});

document.getElementById('detailTabs')?.addEventListener('keydown', event => {
  const current = event.target.closest('.detail-tab');
  if (!current) return;
  const tabs = [...document.querySelectorAll('.detail-tab')];
  const index = tabs.indexOf(current);
  let nextIndex = null;
  if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
  if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = tabs.length - 1;
  if (nextIndex === null) return;
  event.preventDefault();
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
});

function openBookDetail(bookId) {
  const b = state.books.find(x => x.id === bookId);
  if (!b) return;
  state.currentBook = b;
  currentBookId = bookId;
  // Куда вернуться по «назад»: поиск, «Мой список», тестирование и т. д.
  if (state.currentScreen !== 'detail') state._detailReturnTo = state.currentScreen;
  state.detailTab = 'info';
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.toggle('active', t.dataset.dtab === 'info'));
  document.querySelectorAll('.detail-tab').forEach(t => {
    t.setAttribute('aria-selected', String(t.dataset.dtab === 'info'));
  });
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
  const hero = _libraryNode('div', 'detail-hero');
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
  );
  // Пустой рейтинг не показываем: строка «Оценок пока нет» стояла у всех
  // книг и только занимала место. Появится первая оценка — появится и строка.
  if (hasRating(book)) {
    const rating = _libraryIconText(ICONS.star, book.rating);
    rating.className = 'detail-rating';
    info.appendChild(rating);
  }
  info.appendChild(_libraryNode('div', 'detail-category', `${bookCategoriesText(book)} • ${formatLabel}`));
  const assigned = typeof assignmentForBook === 'function' ? assignmentForBook(book.id) : null;
  if (assigned) {
    const due = teamDueLabel(assigned.due_date, false);
    const badge = _libraryNode('div', 'detail-assigned');
    badge.textContent = `Назначено отделом ${assigned.department} · ${due.text}`;
    if (assigned.note) badge.title = assigned.note;
    info.appendChild(badge);
  }

  if (isAdmin) {
    const stats = _libraryNode('div', 'admin-book-stats');
    stats.append(
      _libraryIconText(ICONS.eye, `${book.views || 0} просмотров`),
      _libraryIconText(ICONS.download, `${book.downloads || 0} офлайн`),
      _libraryIconText(ICONS.fileText, formatLabel),
    );
    info.appendChild(stats);
  }

  const status = _libraryNode('select', 'mylist-status-select');
  [
    ['', 'Не в списке'],
    ['reading', 'Читаю'],
    ['planned', 'В планах'],
    ['completed', 'Прочитано'],
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
  actions.appendChild(_libraryAction(ICONS.book, 'Читать', () => openReader(book.id), 'btn-detail detail-action-primary'));
  if (book.has_file) {
    if (offlineBookIds.has(book.id)) {
      actions.appendChild(
        _libraryAction(
          ICONS.trash,
          '',
          () => removeBookOffline(book.id),
          'btn-detail detail-icon-button offline-btn-saved',
        ),
      );
      const removeOfflineButton = actions.lastElementChild;
      removeOfflineButton.title = 'Удалить офлайн-копию';
      removeOfflineButton.setAttribute('aria-label', 'Удалить офлайн-копию');
    } else {
      const saveOfflineButton = _libraryAction(
          ICONS.cloudDownload,
          'Сохранить оффлайн',
          () => saveBookOffline(book.id),
          'btn-detail offline-btn-save',
        );
      saveOfflineButton.title = 'Сохранить книгу для чтения без сети';
      saveOfflineButton.setAttribute('aria-label', 'Сохранить книгу для чтения без сети');
      actions.appendChild(saveOfflineButton);
    }
  }

  if (typeof isTeamManager === 'function' && isTeamManager()) {
    const assign = _libraryAction(
      ICONS.users,
      'Назначить сотрудникам',
      () => openAssignBookModal({ bookId: book.id }),
      'btn-detail detail-action-secondary',
    );
    assign.title = 'Назначить книгу сотрудникам своего отдела со сроком';
    actions.appendChild(assign);
  }

  const schemeMatch = findSchemeStageForBook(book);
  if (schemeMatch) {
    const { schemeCode, schemeTitle, stage } = schemeMatch;
    const arButton = _libraryAction(
      ICONS.target,
      'Смотреть схему атаки',
      () => openARWithScheme(schemeCode, stage.id),
      'btn-detail detail-action-secondary',
      'a468',
    );
    arButton.title = `Открыть схему ${schemeTitle} на этапе «${stage.nameRu}»`;
    actions.appendChild(arButton);
  }
  if (isAdmin) {
    actions.appendChild(
      _libraryAction(
        ICONS.settings,
        'Управление',
        () => openAdminBookModal(book.id),
        'btn-detail detail-action-admin',
        'a469',
      ),
    );
    if (book.has_pdf || book.has_epub) {
      const indexed = book.indexing_status === 'succeeded';
      const reindex = _libraryAction(
        ICONS.refresh,
        indexed ? 'Переиндексировать' : 'Индексировать',
        () => reindexBookFromDetail(book.id, reindex),
        'btn-detail detail-action-secondary',
      );
      if (typeof bookIndexStatusText === 'function') reindex.title = bookIndexStatusText(book);
      actions.appendChild(reindex);
    }
  }

  info.appendChild(actions);
  hero.append(cover, info);
  const description = _libraryNode('section', 'detail-description-section');
  description.append(
    _libraryNode('h2', 'detail-section-title', 'О книге'),
    _libraryNode('div', 'detail-desc', book.desc || 'Описание пока не добавлено.'),
  );
  content.append(hero, description);
  const alsoRead = _libraryNode('div', null, undefined, 'a471');
  alsoRead.id = 'alsoReadSection';
  target.replaceChildren(content, alsoRead);
  loadAlsoRead(currentBookId);
}

// ========== EPUB READER ==========

async function reindexBookFromDetail(bookId, button) {
  button.disabled = true;
  try {
    await api.library.reindexBook(bookId);
    showToast('Книга поставлена первой в очередь на индексацию');
    const book = state.books.find(item => item.id === bookId);
    if (book) book.indexing_status = 'queued';
    button.title = 'Индекс: в очереди';
  } catch (err) {
    button.disabled = false;
    showToast('Ошибка индексации: ' + (err.detail || err.message));
  }
}
