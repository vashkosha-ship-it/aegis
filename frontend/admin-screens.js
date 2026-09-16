// Administrative screens, book management and bulk operations.
// Loaded as a classic script before app.js; public handlers intentionally remain global.

function replaceAdminStaticMarkup(container, markup) {
  const parsed = new DOMParser().parseFromString(`<body>${markup}</body>`, 'text/html');
  const fragment = document.createDocumentFragment();
  Array.from(parsed.body.childNodes).forEach(node => {
    fragment.appendChild(document.importNode(node, true));
  });
  container.replaceChildren(fragment);
}

function renderAdminPanel() {
  const at = document.querySelector('.admin-tab-btn.active')?.dataset?.atab || 'dashboard';
  if (at === 'dashboard') renderDashboard();
  if (at === 'books') renderAdminBooks();
  if (at === 'users') loadAndRenderAdminUsers();
  if (at === 'reviews') loadAndRenderAdminReviews();
  if (at === 'analytics') renderAnalytics();
  if (at === 'leaderboard') loadAndRenderLeaderboard();
}

function renderAdminDashboardStats(container, stats) {
  const cards = document.createElement('div');
  cards.className = 'stat-cards';
  [
    [stats.total_books, 'Книг в каталоге'],
    [stats.total_users, 'Пользователей'],
    [stats.total_views, 'Просмотров'],
    [stats.total_downloads, 'Скачиваний'],
    [stats.total_reviews, 'Отзывов'],
    [stats.total_quiz_attempts, 'Попыток тестов'],
  ].forEach(([value, label]) => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    const valueNode = document.createElement('div');
    valueNode.className = 'stat-value';
    valueNode.textContent = String(value);
    const labelNode = document.createElement('div');
    labelNode.className = 'stat-label';
    labelNode.textContent = label;
    card.append(valueNode, labelNode);
    cards.appendChild(card);
  });
  container.replaceChildren(cards);
}

async function renderDashboard() {
  const container = document.getElementById('adDashboard');
  replaceWithStaticText(container, 'Загрузка...', 'a449');

  try {
    const stats = await api.library.adminDashboard();
    renderAdminDashboardStats(container, stats);
  } catch (err) {
    console.error('Ошибка загрузки дашборда:', err);
    replaceWithStaticText(container, 'Не удалось загрузить статистику', 'a150');
  }
}

function appendAdminCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = String(value ?? '');
  row.appendChild(cell);
  return cell;
}

async function retryBookIndexing(bookId, button) {
  button.disabled = true;
  try {
    await api.library.reindexBook(bookId);
    showToast('Книга поставлена в очередь на индексацию');
    await loadBooksFromApi();
    renderAdminBooks();
  } catch (err) {
    button.disabled = false;
    showToast('Ошибка индексации: ' + (err.detail || err.message));
  }
}

function appendAdminIndexStatusCell(row, book) {
  const cell = document.createElement('td');
  const status = document.createElement('span');
  status.textContent = bookIndexStatusText(book);
  cell.appendChild(status);
  const retryable = (book.has_pdf || book.has_epub)
    && ['failed', 'not_indexed'].includes(book.indexing_status || 'not_indexed');
  if (retryable) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn-sm';
    retry.title = 'Повторить индексацию';
    retry.textContent = '↻';
    retry.addEventListener('click', () => retryBookIndexing(book.id, retry));
    cell.appendChild(document.createTextNode(' '));
    cell.appendChild(retry);
  }
  row.appendChild(cell);
}

function renderAdminBookRows(tbody, books) {
  const fragment = document.createDocumentFragment();
  books.forEach(book => {
    const row = document.createElement('tr');
    appendAdminCell(row, book.title);
    appendAdminCell(row, book.author);
    appendAdminCell(row, bookCategoriesText(book));
    appendAdminCell(row, String(book.file_format || 'pdf').toUpperCase());
    appendAdminIndexStatusCell(row, book);
    const rating = document.createElement('td');
    appendTrustedIcon(rating, ICONS.star);
    rating.appendChild(document.createTextNode(String(book.rating ?? '')));
    row.appendChild(rating);
    const actions = document.createElement('td');
    const analytics = document.createElement('button');
    analytics.type = 'button';
    analytics.className = 'btn-sm';
    analytics.title = 'Аналитика';
    analytics.textContent = '📊';
    analytics.addEventListener('click', () => openBookAnalyticsModal(book.id));
    const settings = document.createElement('button');
    settings.type = 'button';
    settings.className = 'btn-sm admin-book-action-icon';
    settings.title = 'Редактировать книгу';
    settings.setAttribute('aria-label', 'Редактировать книгу');
    if (!appendTrustedIcon(settings, ICONS.settingsGear)) settings.textContent = '⚙';
    settings.addEventListener('click', () => openAdminBookModal(book.id));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn-sm danger admin-book-action-icon';
    remove.title = 'Удалить книгу';
    remove.setAttribute('aria-label', 'Удалить книгу');
    if (!appendTrustedIcon(remove, ICONS.trash)) remove.textContent = '✕';
    remove.addEventListener('click', () => deleteBook(book.id));
    actions.append(analytics, settings, remove);
    row.appendChild(actions);
    fragment.appendChild(row);
  });
  tbody.replaceChildren(fragment);
}

function renderAdminBooks() {
  const container = document.getElementById('adBooks');
  replaceAdminStaticMarkup(container, `
    <div data-static-style="a541">
      <div data-static-style="a542">
        <div data-static-style="a543">Всего книг:</div>
        <div id="adminBooksCount" data-static-style="a544"></div>
      </div>
      <button id="adminBulkUploadBtn" data-static-style="a545">Массовая загрузка</button>
      <button id="adminReindexBtn" title="Переиндексировать текст всех книг для поиска" data-static-style="a546">Индексировать поиск</button>
      <button id="adminLogsBtn" title="Журнал действий администраторов" data-static-style="a547">Журнал</button>
      <button id="adminStorageAuditBtn" title="Проверить файлы книг, обложек и аватаров" data-static-style="a547">Хранилище</button>
      <button id="adminCoversBtn" title="Создать обложки для книг без обложки" data-static-style="a547">Обложки</button>
      <button id="adminDescriptionsBtn" title="Создать ИИ-описания для книг без описания" data-static-style="a547">ИИ-описания</button>
      <button id="adminArMatchBtn" title="ИИ подберёт книги к темам AR-схем" data-static-style="a548">Подобрать книги для AR</button>
      <button id="adminRegenerateQuizzesBtn" title="Сбросить и пересоздать тесты всех книг (по 15 вопросов)" data-static-style="a549">Перегенерировать тесты</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Книга</th><th>Автор</th><th>Категория</th><th>Формат</th><th>Индекс</th><th>Рейтинг</th><th>Действия</th></tr></thead>
        <tbody id="adminBooksTableBody"></tbody>
      </table>
    </div>`);
  document.getElementById('adminBulkUploadBtn').addEventListener('click', openBulkUploadModal);
  document.getElementById('adminReindexBtn').addEventListener('click', reindexAllBooksUI);
  document.getElementById('adminLogsBtn').addEventListener('click', openAdminLogs);
  document.getElementById('adminStorageAuditBtn').addEventListener('click', auditStorageUI);
  document.getElementById('adminCoversBtn').addEventListener('click', generateMissingCoversUI);
  document.getElementById('adminDescriptionsBtn').addEventListener('click', generateMissingDescriptionsUI);
  document.getElementById('adminArMatchBtn').addEventListener('click', aiMatchArBooksUI);
  document.getElementById('adminRegenerateQuizzesBtn').addEventListener('click', regenerateAllQuizzesUI);
  document.getElementById('adminBooksCount').textContent = String(state.books.length);
  renderAdminBookRows(document.getElementById('adminBooksTableBody'), state.books);
  refreshDescriptionGenerationStatus();
}

async function auditStorageUI() {
  try {
    const report = await api.library.adminStorageAudit();
    const missing = report.missing_count || 0;
    const orphans = report.orphan_count || 0;
    const recent = report.recent_unreferenced_count || 0;
    if (!orphans) {
      showToast(
        `Хранилище проверено: сирот нет, потерянных ссылок ${missing}`
        + (recent ? `, новых неподтверждённых файлов ${recent}` : ''),
      );
      return;
    }
    showConfirmModal({
      title: 'Очистить хранилище?',
      message: `Найдено старых файлов без ссылок: ${orphans}. Потерянных ссылок: ${missing}. Новые файлы младше суток (${recent}) защищены и удалены не будут.`,
      confirmText: 'Удалить сироты',
      cancelText: 'Оставить',
      danger: true,
      onConfirm: async () => {
        try {
          const result = await api.library.adminCleanupStorage();
          showToast(`Удалено файлов: ${result.deleted_count}. Ошибок: ${result.failed_keys.length}.`);
        } catch (error) {
          showToast(error && error.detail ? error.detail : 'Не удалось очистить хранилище');
        }
      },
    });
  } catch (error) {
    showToast(error && error.detail ? error.detail : 'Не удалось проверить хранилище');
  }
}
// ========== МАССОВАЯ ЗАГРУЗКА КНИГ ==========

async function deleteBook(id) {
  const book = state.books.find(b => b.id === id);
  const title = book ? book.title : `книгу #${id}`;
  if (!confirm(`Удалить «${title}»? Это действие необратимо.`)) return;

  try {
    await api.books.delete(id);
    await loadBooksFromApi();
    renderAdminPanel();
    renderHome();
    showToast('Книга удалена');
  } catch (err) {
    showToast('Ошибка при удалении книги');
    console.error(err);
  }
}

async function loadAndRenderAdminUsers() {
  const container = document.getElementById('adUsers');
  if (!container) return;
  replaceWithStaticText(container, 'Загрузка...', 'a449');
  try {
    const users = await api.library.adminUsers();

    // Сохраняем в state, чтобы фильтр работал без повторного запроса
    state._adminUsers = users;

    renderAdminUsersWithFilter();
  } catch (err) {
    replaceWithStaticText(container, 'Не удалось загрузить пользователей', 'a150');
  }
}

function appendAdminMetric(container, value, label, valueStyle) {
  const card = document.createElement('div');
  card.setAttribute('data-static-style', 'a553');
  const valueNode = document.createElement('div');
  valueNode.setAttribute('data-static-style', valueStyle);
  valueNode.textContent = String(value);
  const labelNode = document.createElement('div');
  labelNode.setAttribute('data-static-style', 'a192');
  labelNode.textContent = label;
  card.append(valueNode, labelNode);
  container.appendChild(card);
}

function renderAdminUsersWithFilter() {
  const container = document.getElementById('adUsers');
  const users = state._adminUsers || [];
  if (!users.length) {
    replaceWithStaticText(container, 'Нет пользователей', 'a209');
    return;
  }

  const filter = state._adminUsersFilter || 'all';
  const limit = state._adminUsersLimit || 10;
  const sorted = [...users];
  let title = '';
  if (filter === 'top_books') {
    sorted.sort((left, right) => (right.completed_books || 0) - (left.completed_books || 0));
    title = `ТОП-${limit} по прочитанным книгам`;
  } else if (filter === 'top_xp') {
    sorted.sort((left, right) => (right.xp || 0) - (left.xp || 0));
    title = `ТОП-${limit} по XP (активности)`;
  } else if (filter === 'top_perfect') {
    sorted.sort((left, right) => (right.perfect_quizzes || 0) - (left.perfect_quizzes || 0));
    title = `ТОП-${limit} по тестам на 100%`;
  }
  const displayed = filter === 'all' ? sorted : sorted.slice(0, limit);

  const actions = document.createElement('div');
  actions.className = 'admin-actions-bar';
  actions.setAttribute('data-static-style', 'a561');
  const actionButton = (label, titleText, style, callback) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = titleText;
    button.setAttribute('data-static-style', style);
    button.textContent = label;
    button.addEventListener('click', callback);
    actions.appendChild(button);
    return button;
  };
  actionButton('Создать пользователя', 'Создать пользователя', 'a562', openCreateUserModal);
  const pending = actionButton('Заявки', 'Заявки на регистрацию', 'a563', openPendingUsersModal);
  const badge = document.createElement('span');
  badge.id = 'pendingUsersBadge';
  badge.setAttribute('data-static-style', 'a564');
  pending.appendChild(badge);
  actionButton('Excel', 'Выгрузка прочитанного в Excel', 'a565', openExportModal);

  const dashboard = document.createElement('div');
  dashboard.setAttribute('data-static-style', 'a552');
  appendAdminMetric(dashboard, users.length, 'Всего пользователей', 'a245');
  appendAdminMetric(dashboard, users.filter(user => user.is_active).length, 'Активных', 'a554');
  appendAdminMetric(dashboard, users.reduce((sum, user) => sum + (user.completed_books || 0), 0), 'Книг прочитано (всеми)', 'a242');
  appendAdminMetric(dashboard, users.reduce((sum, user) => sum + (user.quiz_attempts || 0), 0), 'Попыток тестов', 'a555');

  const filters = document.createElement('div');
  filters.setAttribute('data-static-style', 'a556');
  const filterLabel = document.createElement('label');
  filterLabel.setAttribute('data-static-style', 'a192');
  filterLabel.textContent = 'Показать:';
  const filterSelect = document.createElement('select');
  filterSelect.id = 'adminUsersFilter';
  filterSelect.setAttribute('data-static-style', 'a557');
  replaceSelectOptions(filterSelect, [
    { value: 'all', label: 'Все', selected: filter === 'all' },
    { value: 'top_books', label: 'ТОП по прочитанным книгам', selected: filter === 'top_books' },
    { value: 'top_xp', label: 'ТОП по XP (активности)', selected: filter === 'top_xp' },
    { value: 'top_perfect', label: 'ТОП по тестам на 100%', selected: filter === 'top_perfect' },
  ]);
  filterSelect.addEventListener('change', onAdminUsersFilterChange);
  filters.append(filterLabel, filterSelect);
  if (filter !== 'all') {
    const limitLabel = document.createElement('label');
    limitLabel.setAttribute('data-static-style', 'a558');
    limitLabel.textContent = 'Размер ТОП:';
    const limitSelect = document.createElement('select');
    limitSelect.id = 'adminUsersLimit';
    limitSelect.setAttribute('data-static-style', 'a557');
    replaceSelectOptions(limitSelect, [5, 10, 25, 50].map(value => ({
      value, label: value, selected: limit === value,
    })));
    limitSelect.addEventListener('change', onAdminUsersLimitChange);
    filters.append(limitLabel, limitSelect);
  }

  const fragment = document.createDocumentFragment();
  fragment.append(actions, dashboard, filters);
  if (title) {
    const heading = document.createElement('div');
    heading.setAttribute('data-static-style', 'a559');
    heading.textContent = title;
    fragment.appendChild(heading);
  }

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const header = document.createElement('tr');
  const headers = ['ID', 'Логин', 'ФИО', 'Подразделение', 'Email', 'Роль', 'Уровень', 'XP', 'Стрик', 'Книг прочит.', 'Тестов', 'На 100%', 'Страниц', 'Активен', 'Действия'];
  if (filter !== 'all') headers.unshift('#');
  headers.forEach(label => {
    const th = document.createElement('th');
    th.textContent = label;
    header.appendChild(th);
  });
  thead.appendChild(header);
  const tbody = document.createElement('tbody');
  displayed.forEach((user, index) => {
    const row = document.createElement('tr');
    if (filter !== 'all') {
      const place = appendAdminCell(row, index + 1);
      place.setAttribute('data-static-style', 'a560');
    }
    const levelInfo = user.cyber_level ? getCyberLevelInfo(user.cyber_level) : null;
    [user.id, user.username, user.full_name || '—', user.department || '—', user.email || '—',
      user.role, levelInfo ? levelInfo.name : '—', user.xp, user.streak_count, user.completed_books,
      user.quiz_attempts, user.perfect_quizzes, user.total_pages_read].forEach(value => appendAdminCell(row, value));
    const active = document.createElement('td');
    appendTrustedIcon(active, user.is_active ? ICONS.check : ICONS.x);
    row.appendChild(active);
    const userActions = document.createElement('td');
    if (user.role !== 'admin') {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn-sm danger';
      appendTrustedIcon(remove, ICONS.trash);
      remove.addEventListener('click', () => deleteAdminUser(user.id, user.username));
      userActions.appendChild(remove);
    } else {
      userActions.textContent = '—';
    }
    row.appendChild(userActions);
    tbody.appendChild(row);
  });
  table.append(thead, tbody);
  wrap.appendChild(table);
  fragment.appendChild(wrap);
  container.replaceChildren(fragment);
  refreshPendingBadge();
}

function onAdminUsersFilterChange() {
  const sel = document.getElementById('adminUsersFilter');
  state._adminUsersFilter = sel.value;
  renderAdminUsersWithFilter();
}

function onAdminUsersLimitChange() {
  const sel = document.getElementById('adminUsersLimit');
  state._adminUsersLimit = parseInt(sel.value, 10) || 10;
  renderAdminUsersWithFilter();
}

async function deleteAdminUser(userId, username) {
  if (!confirm(`Удалить пользователя «${username}»? Это действие необратимо.`)) return;
  try {
    await api.library.adminDeleteUser(userId);
    showToast('Пользователь удалён');
    loadAndRenderAdminUsers();
  } catch (err) {
    if (err instanceof api.ApiError) showToast('Ошибка: ' + (err.detail || err.status));
    else showToast('Сервер недоступен');
  }
}
