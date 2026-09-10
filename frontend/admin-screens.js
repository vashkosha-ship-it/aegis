// Administrative screens, book management and bulk operations.
// Loaded as a classic script before app.js; public handlers intentionally remain global.

async function openAdminLogs() {
  const ex = document.getElementById('adminLogsModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'adminLogsModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  m.innerHTML = `<div data-static-style="a125">
    <div data-static-style="a126">
      <h3 data-static-style="a127">Журнал действий</h3>
      <button data-onclick="closeModal('adminLogsModal')" data-static-style="a128">✕</button>
    </div>
    <div id="adminLogsBody" data-static-style="a129">Загрузка…</div>
  </div>`;
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  document.body.appendChild(m);
  try {
    const logs = await api.library.adminLogs(100);
    const body = document.getElementById('adminLogsBody');
    if (!logs.length) { replaceWithStaticText(body, 'Записей пока нет.', 'a130'); return; }
    const actionLabel = {
      book_create: '➕ Создание', book_update: '✏️ Изменение', book_delete: '🗑 Удаление',
      pdf_upload: '📄 Загрузка PDF', cover_upload: '🖼 Обложка', reindex: '🔍 Индексация',
    };
    body.style.textAlign = 'left'; body.style.padding = '0';
    body.innerHTML = logs.map(l => {
      const d = new Date(l.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `<div data-static-style="a131">
        <div data-static-style="a132">
          <span data-static-style="a133">${actionLabel[l.action] || l.action}</span>
          <span data-static-style="a134">${d}</span>
        </div>
        <div data-static-style="a135">${eh(l.detail || '')}</div>
        <div data-static-style="a136">${eh(l.admin || '—')}</div>
      </div>`;
    }).join('');
  } catch (e) {
    const body = document.getElementById('adminLogsBody');
    replaceWithStaticText(body, 'Не удалось загрузить журнал.', 'a137');
  }
}

function openCreateUserModal() {
  let modal = document.getElementById('createUserModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'createUserModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div data-static-style="a177">
      <div data-static-style="a144">
        <h3 data-static-style="a145">Создать пользователя</h3>
        <button data-onclick="closeModal('createUserModal')" data-static-style="a146">✕</button>
      </div>
      <p data-static-style="a178">Пользователь создаётся сразу активным. Передайте ему логин и пароль.</p>
      <label data-static-style="a179">Логин (латиница, цифры, _)</label>
      <input type="text" id="cuUsername" autocomplete="off" data-static-style="a180">
      <label data-static-style="a179">Пароль (минимум 8 символов)</label>
      <input type="text" id="cuPassword" autocomplete="off" data-static-style="a180">
      <label data-static-style="a179">ФИО</label>
      <input type="text" id="cuFullName" data-static-style="a180">
      <label data-static-style="a179">Подразделение</label>
      <input type="text" id="cuDepartment" data-static-style="a181">
      <button id="cuCreateBtn" data-static-style="a149">Создать</button>
    </div>`;

  document.getElementById('cuCreateBtn').onclick = async () => {
    const btn = document.getElementById('cuCreateBtn');
    const username = document.getElementById('cuUsername').value.trim();
    const password = document.getElementById('cuPassword').value;
    const full_name = document.getElementById('cuFullName').value.trim() || null;
    const department = document.getElementById('cuDepartment').value.trim() || null;
    if (username.length < 3) return showToast('Логин: минимум 3 символа');
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return showToast('Логин: только латиница, цифры и _');
    if (password.length < 8) return showToast('Пароль: минимум 8 символов');
    btn.disabled = true; btn.textContent = 'Создаю…';
    try {
      await api.library.adminCreateUser({ username, password, full_name, department });
      showToast('Пользователь создан');
      document.getElementById('createUserModal').remove();
      // обновим список пользователей
      try {
        state._adminUsers = await api.library.adminUsers();
        renderAdminUsersWithFilter();
      } catch (_) {}
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Создать';
      const msg = (e && (e.detail || (e.body && e.body.detail))) || 'Не удалось создать пользователя';
      showToast(msg);
    }
  };
}

function openExportModal() {
  let modal = document.getElementById('exportModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'exportModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div data-static-style="a177">
      <div data-static-style="a144">
        <h3 data-static-style="a145">Выгрузка в Excel</h3>
        <button data-onclick="closeModal('exportModal')" data-static-style="a146">✕</button>
      </div>
      <p data-static-style="a182">Прочитанные книги по сотрудникам за период (ФИО, подразделение, книги). Оставьте даты пустыми — выгрузится всё.</p>
      <label data-static-style="a179">Дата с</label>
      <input type="date" id="exportDateFrom" data-static-style="a183">
      <label data-static-style="a179">Дата по</label>
      <input type="date" id="exportDateTo" data-static-style="a181">
      <button id="exportRunBtn" data-static-style="a184">Скачать Excel</button>
    </div>`;

  document.getElementById('exportRunBtn').onclick = async () => {
    const btn = document.getElementById('exportRunBtn');
    const from = document.getElementById('exportDateFrom').value || null;
    const to = document.getElementById('exportDateTo').value || null;
    btn.disabled = true;
    btn.textContent = 'Формирую…';
    try {
      const blob = await api.library.adminExportReading(from, to);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'aegis_reading' + (from || to ? '_' + (from || 'нач') + '_' + (to || 'кон') : '') + '.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      document.getElementById('exportModal').remove();
      showToast('Файл выгружен');
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Скачать Excel';
      console.error('Ошибка экспорта:', err);
      showToast('Не удалось сформировать файл');
    }
  };
}

async function openPendingUsersModal() {
  let modal = document.getElementById('pendingUsersModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'pendingUsersModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div data-static-style="a185">
      <div data-static-style="a126">
        <h3 data-static-style="a145">Заявки на регистрацию</h3>
        <button data-onclick="closeModal('pendingUsersModal')" data-static-style="a186">✕</button>
      </div>
      <div id="pendingUsersList" data-static-style="a187">Загрузка…</div>
    </div>`;

  try {
    const users = await api.library.adminPendingUsers();
    const list = document.getElementById('pendingUsersList');
    if (!users.length) {
      replaceWithStaticText(list, 'Нет заявок на рассмотрении', 'a188');
    } else {
      list.innerHTML = users.map(u => `
        <div data-static-style="a189">
          <div data-static-style="a190">
            <div data-static-style="a191">${eh(u.full_name || u.username)}</div>
            <div data-static-style="a192">@${eh(u.username)} · ${eh(u.email || '—')}</div>
            ${u.department ? `<div data-static-style="a193">${eh(u.department)}</div>` : ''}
          </div>
          <div data-static-style="a194">
            <button data-onclick="approvePendingUser(${u.id})" data-nonce="${sensitiveNonce()}" data-args="this" data-static-style="a195">Одобрить</button>
            <button data-onclick="rejectPendingUser(${u.id})" data-nonce="${sensitiveNonce()}" data-args="this" data-static-style="a196">Отклонить</button>
          </div>
        </div>`).join('');
    }
    updatePendingBadge(users.length);
  } catch (err) {
    console.error('Ошибка загрузки заявок:', err, err && err.status, err && err.body);
    const detail = (err && (err.detail || (err.body && err.body.detail))) || (err && err.message) || '';
    document.getElementById('pendingUsersList').innerHTML = '<div data-static-style="a197">Не удалось загрузить заявки' + (detail ? '<br><span data-static-style="a192">' + eh(String(detail)) + '</span>' : '') + '</div>';
  }
}

async function approvePendingUser(userId, btn) {
  btn.disabled = true; btn.textContent = '…';
  try {
    await api.library.adminApproveUser(userId);
    btn.closest('div[style*="justify-content:space-between"]').parentElement.remove();
    showToast('Пользователь одобрен');
    refreshPendingBadge();
    const list = document.getElementById('pendingUsersList');
    if (list && !list.querySelector('button')) {
      replaceWithStaticText(list, 'Нет заявок на рассмотрении', 'a188');
    }
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Одобрить';
    showToast('Не удалось одобрить');
  }
}

async function rejectPendingUser(userId, btn) {
  if (!confirm('Отклонить заявку? Аккаунт будет удалён.')) return;
  btn.disabled = true; btn.textContent = '…';
  try {
    await api.library.adminRejectUser(userId);
    btn.closest('div[style*="justify-content:space-between"]').parentElement.remove();
    showToast('Заявка отклонена');
    refreshPendingBadge();
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Отклонить';
    showToast('Не удалось отклонить');
  }
}

function updatePendingBadge(count) {
  const badge = document.getElementById('pendingUsersBadge');
  if (!badge) return;
  if (count > 0) { badge.textContent = count; badge.style.display = 'inline-block'; }
  else badge.style.display = 'none';
}

async function refreshPendingBadge() {
  if (!state.currentUser || state.currentUser.role !== 'admin') return;
  try {
    const users = await api.library.adminPendingUsers();
    updatePendingBadge(users.length);
  } catch (_) {}
}

function collectArTopics() {
  // Собираем уникальные relatedCategory из всех AR-схем
  const topics = new Set();
  try {
    Object.values(AR_SCHEMES || {}).forEach(scheme => {
      const stages = (scheme && scheme.stages) || [];
      stages.forEach(st => { if (st.relatedCategory) topics.add(st.relatedCategory); });
    });
  } catch (_) {}
  return Array.from(topics);
}

async function aiMatchArBooksUI() {
  const topics = collectArTopics();
  if (!topics.length) { showToast('Не удалось собрать темы AR-схем'); return; }
  if (!confirm(`ИИ проанализирует книги и подберёт подходящие к ${topics.length} темам AR-схем. Это может занять пару минут. Продолжить?`)) return;
  showToast('ИИ подбирает книги для AR-тем, подождите…');
  try {
    const res = await api.library.aiMatchArTopics(topics);
    showToast(`Готово: обновлено книг ${res.updated} из ${res.total}`);
    // обновим книги в состоянии, чтобы рекомендации в AR появились
    try { await loadBooksFromApi(); } catch (_) {}
  } catch (e) {
    const msg = (e && (e.detail || (e.body && e.body.detail))) || 'Не удалось подобрать книги';
    showToast(msg);
  }
}

async function generateMissingCoversUI() {
  const candidates = (state.books || []).filter(b => !b.has_cover && (b.has_pdf || b.format !== 'epub'));
  if (!candidates.length) {
    showToast('Все книги уже с обложками');
    return;
  }
  showConfirmModal({
    title: 'Создать обложки?',
    message: `Книг без обложки: ${candidates.length}. Для каждой будет скачан PDF и создана обложка из первой страницы. Это может занять время.`,
    confirmText: 'Создать',
    cancelText: 'Отмена',
    onConfirm: async () => {
      let done = 0, failed = 0;
      try {
        await ensurePdfLoaded();
      } catch (e) {
        showToast('Не удалось загрузить PDF-движок');
        return;
      }
      showToast('Создание обложек запущено…');
      for (const b of candidates) {
        try {
          const bytes = await api.books.fetchPdfBytes(b.id);
          const blob = await generateCoverFromPdf(new Blob([bytes], { type: 'application/pdf' }));
          if (blob) {
            const f = new File([blob], 'cover.jpg', { type: 'image/jpeg' });
            await api.books.uploadCover(b.id, f);
            done++;
          } else {
            failed++;
          }
        } catch (e) {
          failed++;
          console.warn('Обложка не создана для книги', b.id, e);
        }
      }
      showToast(`Обложки созданы: ${done}` + (failed ? ` · не удалось: ${failed}` : ''));
      await loadBooksFromApi();
      if (typeof renderAdminPanel === 'function') renderAdminPanel();
    },
  });
}

async function regenerateAllQuizzesUI() {
  showConfirmModal({
    title: 'Перегенерировать все тесты?',
    message: 'Тесты всех книг будут сброшены и пересозданы заново (по 15 вопросов) при следующем открытии теста. Прежние вопросы удаляются, но пройденные попытки сохраняются.',
    confirmText: 'Перегенерировать',
    cancelText: 'Отмена',
    danger: true,
    onConfirm: async () => {
      try {
        const res = await api.library.regenerateAllQuizzes();
        const n = res && typeof res.books_cleared === 'number' ? ` (${res.books_cleared} кн.)` : '';
        showToast('Тесты сброшены' + n + '. Новые соберутся при открытии.');
      } catch (e) {
        showToast(e && e.detail ? e.detail : 'Ошибка перегенерации тестов');
      }
    },
  });
}

async function reindexAllBooksUI() {
  showConfirmModal({
    title: 'Переиндексировать все книги?',    message: 'Будет извлечён текст из всех PDF для полнотекстового поиска. Индексация идёт в фоне — можно продолжать работу.',
    confirmText: 'Запустить',
    cancelText: 'Отмена',
    onConfirm: async () => {
      try {
        const res = await api.library.reindexAllBooks();
        if (res.started === false && res.reason === 'already_running') {
          showToast('Индексация уже идёт');
        } else {
          showToast('Индексация запущена');
        }
        showReindexProgress();
      } catch (e) {
        showToast(e && e.detail ? e.detail : 'Ошибка запуска индексации');
      }
    },
  });
}

function showReindexProgress() {
  const ex = document.getElementById('reindexProgressModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'reindexProgressModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  m.innerHTML = `<div data-static-style="a198">
    <div data-static-style="a126">
      <h3 data-static-style="a127">Индексация поиска</h3>
      <button data-onclick="stopReindexPolling();document.getElementById('reindexProgressModal').remove()" data-static-style="a128">✕</button>
    </div>
    <div id="reindexProgressBody">
      <div data-static-style="a199">Запуск…</div>
      <div data-static-style="a200">
        <div id="reindexBar" data-static-style="a201"></div>
      </div>
    </div>
    <div data-static-style="a202">Можно закрыть это окно — индексация продолжится в фоне.</div>
  </div>`;
  m.onclick = (e) => { if (e.target === m) { stopReindexPolling(); m.remove(); } };
  document.body.appendChild(m);
  startReindexPolling();
}

let _reindexPollTimer = null;
function stopReindexPolling() {
  if (_reindexPollTimer) { clearInterval(_reindexPollTimer); _reindexPollTimer = null; }
}
function startReindexPolling() {
  stopReindexPolling();
  const poll = async () => {
    try {
      const s = await api.library.reindexStatus();
      const body = document.getElementById('reindexProgressBody');
      if (!body) { stopReindexPolling(); return; }
      const bar = document.getElementById('reindexBar');
      if (bar) bar.style.width = (s.percent || 0) + '%';
      if (s.finished) {
        stopReindexPolling();
        body.innerHTML = `<div data-static-style="a203">
          ✓ Готово: ${s.done} книг, ${s.indexed_pages} страниц${s.errors ? `, ошибок: ${s.errors}` : ''}
        </div>`;
      } else if (s.running) {
        body.querySelector('div').textContent = `Обработано ${s.done} из ${s.total} книг (${s.percent}%)`;
      }
    } catch (e) {
      stopReindexPolling();
    }
  };
  poll();
  _reindexPollTimer = setInterval(poll, 1500);
}

// ========== ADD BOOK MODAL ==========
async function openAddModal() {
  document.getElementById('newTitle').value = '';
  document.getElementById('newAuthor').value = '';
  document.getElementById('newCover').value = '';
  document.getElementById('newBookFile').value = '';
  const descEl = document.getElementById('newDescription');
  if (descEl) descEl.value = '';

  initCategoryTags('newCategoriesContainer', []);
  document.getElementById('addModal').classList.remove('hidden');
}

function detectFileFormat(file) {
  if (!file) return 'pdf';
  const name = file.name.toLowerCase();
  if (name.endsWith('.epub')) return 'epub';
  return 'pdf';
}

async function populateNewCategoriesSelect() {
  const sel = document.getElementById('newCategorySelect');
  let categories = [];
  try {
    categories = await api.books.categories();
  } catch (e) {
    categories = [];
  }
  replaceSelectOptions(sel, categories);
  sel.value = []; // снимаем все выделения
}

// Функция для добавления новой категории в модалке добавления книги
function addNewCategoryToAddModal() {
  const input = document.getElementById('newCategoryNew');
  const newCat = input.value.trim();
  
  if (!newCat) {
    showToast('Введите название категории');
    return;
  }
  
  if (newCat.length > 64) {
    showToast('Категория: максимум 64 символа');
    return;
  }
  
  const select = document.getElementById('newCategorySelect');
  
  // Проверяем, нет ли уже такой категории
  const exists = Array.from(select.options).some(opt => opt.value.toLowerCase() === newCat.toLowerCase());
  if (exists) {
    showToast('Такая категория уже существует');
    input.value = '';
    return;
  }
  
  // Добавляем новую опцию
  const option = document.createElement('option');
  option.value = newCat;
  option.textContent = newCat;
  select.appendChild(option);
  
  // Выделяем новую категорию
  option.selected = true;
  
  // Очищаем поле
  input.value = '';
  
  showToast(`Категория "${newCat}" добавлена`);
}

function onNewCategoryChange(value) {
  const newInput = document.getElementById('newCategoryNew');
  newInput.style.display = value === '__new__' ? 'block' : 'none';
  if (value === '__new__') newInput.focus();
}

function closeAddModal() {
  document.getElementById('addModal').classList.add('hidden');
}

// ========== ADMIN BOOK MODAL ==========
let adminBookModalCurrentId = null;

async function openAdminBookModal(bookId) {
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    return showToast('Нужны права администратора');
  }
  adminBookModalCurrentId = bookId;

  let book;
  try {
    book = await api.books.get(bookId);
  } catch (err) {
    return showToast('Не удалось загрузить книгу');
  }

  document.getElementById('adminEditTitle').value = book.title || '';
  document.getElementById('adminEditAuthor').value = book.author || '';
  document.getElementById('adminEditDescription').value = book.description || '';
  document.getElementById('adminEditIcon').value = book.icon || ICONS.bookCover;

initCategoryTags('adminCategoriesContainer', book.categories || []);

  const format = book.file_format || (book.has_epub ? 'epub' : 'pdf');
  document.getElementById('adminFileStatus').textContent = (book.has_pdf || book.has_epub)
    ? `Файл загружен (${format.toUpperCase()})`
    : '— Файл ещё не загружен';
  document.getElementById('adminCoverStatus').textContent = book.has_cover
    ? 'Обложка загружена'
    : '— Обложка ещё не загружена';

  document.getElementById('adminBookFileInput').value = '';
  document.getElementById('adminCoverFile').value = '';

  renderRecommendDepts(book);

  document.getElementById('adminBookModal').classList.remove('hidden');
}

// Вычисляет, каким подразделениям релевантна книга (по совпадению категорий/названия с темами)
function renderRecommendDepts(book) {
  const el = document.getElementById('adminRecommendDepts');
  if (!el) return;
  const hay = ((book.categories || []).join(' ') + ' ' + (book.title || '') + ' ' + (book.description || '')).toLowerCase();
  const matches = [];
  for (const [code, keywords] of Object.entries(DEPARTMENT_TOPICS)) {
    const hits = keywords.filter(k => hay.includes(k.toLowerCase())).length;
    if (hits > 0) matches.push({ code, hits });
  }
  matches.sort((a, b) => b.hits - a.hits);

  if (!matches.length) {
    replaceWithStaticText(el, 'Нет явных совпадений по темам. Книга подходит для общего доступа.', 'a243');
    return;
  }
  el.innerHTML = '<div data-static-style="a347">Книга релевантна подразделениям:</div>' +
    '<div data-static-style="a089">' +
    matches.map(m => `
      <span data-static-style="a528">
        <span data-static-style="a191">${m.code}</span>
        <span data-static-style="a099">${m.hits}</span>
        <button data-onclick="markRequiredForDept(${book.id}, '${m.code}')" data-nonce="${sensitiveNonce()}" data-args="this" title="Сделать обязательной для ${m.code}" data-static-style="a529">★ обязательная</button>
      </span>`).join('') +
    '</div>';
}

async function markRequiredForDept(bookId, deptCode, btn) {
  try {
    await api.library.setRequiredBook(bookId, deptCode);
    if (btn) { btn.textContent = '✓ отмечена'; btn.disabled = true; btn.style.opacity = '0.6'; }
    showToast(`Книга обязательна для ${deptCode}`);
  } catch (e) {
    showToast(e && e.detail ? e.detail : 'Не удалось отметить');
  }
}

function closeAdminBookModal() {
  document.getElementById('adminBookModal').classList.add('hidden');
  adminBookModalCurrentId = null;
}
// ========== КОМПОНЕНТ ТЭГОВ КАТЕГОРИЙ ==========

const categoryTagsInstances = {};

function initCategoryTags(containerId, initialTags = []) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <input type="text" class="cat-tag-input" placeholder="Введи категорию и нажми Enter…" autocomplete="off">
    <div class="cat-tag-suggestions"></div>
  `;

  const input = container.querySelector('.cat-tag-input');
  const suggestionsBox = container.querySelector('.cat-tag-suggestions');

  categoryTagsInstances[containerId] = {
    tags: [...initialTags],
    container,
    input,
    suggestionsBox,
    highlightedIndex: -1,
  };

  renderCategoryChips(containerId);

  input.addEventListener('input', () => {
    const value = input.value.trim();
    if (value.length === 0) {
      hideCategorySuggestions(containerId);
      return;
    }
    showCategorySuggestions(containerId, value);
  });

  input.addEventListener('keydown', (e) => {
    const inst = categoryTagsInstances[containerId];
    const items = suggestionsBox.querySelectorAll('.cat-tag-suggestion-item');

    if (e.key === 'Enter') {
      e.preventDefault();
      if (inst.highlightedIndex >= 0 && items[inst.highlightedIndex]) {
        addCategoryTag(containerId, items[inst.highlightedIndex].dataset.name);
      } else {
        const val = input.value.trim();
        if (val) addCategoryTag(containerId, val);
      }
      input.value = '';
      hideCategorySuggestions(containerId);
    } else if (e.key === 'Backspace' && input.value === '' && inst.tags.length > 0) {
      removeCategoryTag(containerId, inst.tags[inst.tags.length - 1]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length > 0) {
        inst.highlightedIndex = (inst.highlightedIndex + 1) % items.length;
        updateSuggestionHighlight(containerId);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length > 0) {
        inst.highlightedIndex = inst.highlightedIndex <= 0 ? items.length - 1 : inst.highlightedIndex - 1;
        updateSuggestionHighlight(containerId);
      }
    } else if (e.key === 'Escape') {
      hideCategorySuggestions(containerId);
    } else if (e.key === ',') {
      e.preventDefault();
      const val = input.value.trim();
      if (val) addCategoryTag(containerId, val);
      input.value = '';
      hideCategorySuggestions(containerId);
    }
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) hideCategorySuggestions(containerId);
  });

  container.addEventListener('click', (e) => {
    if (e.target === container) input.focus();
  });
}

function renderCategoryChips(containerId) {
  const inst = categoryTagsInstances[containerId];
  if (!inst) return;
  inst.container.querySelectorAll('.cat-tag-chip').forEach(c => c.remove());
  inst.tags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'cat-tag-chip';
    const safeTag = String(tag).replace(/"/g, '&quot;');
    chip.innerHTML = `${eh(tag)}<button type="button" class="cat-tag-chip-x" data-tag="${safeTag}">×</button>`;
    chip.querySelector('.cat-tag-chip-x').addEventListener('click', (e) => {
      e.stopPropagation();
      removeCategoryTag(containerId, tag);
    });
    inst.container.insertBefore(chip, inst.input);
  });
}

function addCategoryTag(containerId, name) {
  const inst = categoryTagsInstances[containerId];
  if (!inst) return;
  const clean = String(name).trim();
  if (!clean || clean.length > 64) {
    if (clean.length > 64) showToast('Категория: максимум 64 символа');
    return;
  }
  const lowerExisting = inst.tags.map(t => t.toLowerCase());
  if (lowerExisting.includes(clean.toLowerCase())) return;
  inst.tags.push(clean);
  renderCategoryChips(containerId);
}

function removeCategoryTag(containerId, name) {
  const inst = categoryTagsInstances[containerId];
  if (!inst) return;
  inst.tags = inst.tags.filter(t => t !== name);
  renderCategoryChips(containerId);
}

async function showCategorySuggestions(containerId, query) {
  const inst = categoryTagsInstances[containerId];
  if (!inst) return;
  let allCats;
  try { allCats = await api.books.categories(); }
  catch (e) { allCats = []; }
  const q = query.toLowerCase();
  const selected = new Set(inst.tags.map(t => t.toLowerCase()));
  const matching = allCats.filter(c => c.toLowerCase().includes(q) && !selected.has(c.toLowerCase()));

  let html = '';
  if (matching.length > 0) {
    html = matching.map(c =>
      `<div class="cat-tag-suggestion-item" data-name="${eh(c)}">${eh(c)}</div>`
    ).join('');
  }
  const exactMatch = allCats.some(c => c.toLowerCase() === q);
  if (!exactMatch && query.length > 0) {
    html += `<div class="cat-tag-suggestion-item" data-name="${eh(query)}" data-static-style="a530">+ Создать: «${eh(query)}»</div>`;
  }
  if (html === '') html = '<div class="cat-tag-suggestion-empty">Нет подходящих категорий</div>';

  inst.suggestionsBox.innerHTML = html;
  inst.suggestionsBox.classList.add('active');
  inst.highlightedIndex = -1;

  // Обработчики клика на пункты подсказок (через делегирование)
  inst.suggestionsBox.querySelectorAll('.cat-tag-suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      addCategoryTag(containerId, item.dataset.name);
      inst.input.value = '';
      inst.input.focus();
      hideCategorySuggestions(containerId);
    });
  });
}

function hideCategorySuggestions(containerId) {
  const inst = categoryTagsInstances[containerId];
  if (!inst) return;
  inst.suggestionsBox.classList.remove('active');
  inst.highlightedIndex = -1;
}

function updateSuggestionHighlight(containerId) {
  const inst = categoryTagsInstances[containerId];
  if (!inst) return;
  const items = inst.suggestionsBox.querySelectorAll('.cat-tag-suggestion-item');
  items.forEach((item, idx) => {
    item.classList.toggle('highlighted', idx === inst.highlightedIndex);
  });
}

function getCategoryTags(containerId) {
  const inst = categoryTagsInstances[containerId];
  return inst ? [...inst.tags] : [];
}
async function populateAdminCategoriesSelect(currentCategories) {
  const sel = document.getElementById('adminEditCategorySelect');
  let categories = [];
  try {
    categories = await api.books.categories();
  } catch (e) {
    categories = currentCategories || [];
  }
  
  const selected = Array.isArray(currentCategories) ? currentCategories : [];
  replaceSelectOptions(sel, categories.map(category => ({
    value: category,
    label: category,
    selected: selected.includes(category),
  })));
}

// Функция для добавления новой категории в админ-модалке
function addNewCategoryToAdminModal() {
  const input = document.getElementById('adminEditCategoryNew');
  const newCat = input.value.trim();
  
  if (!newCat) {
    showToast('Введите название категории');
    return;
  }
  
  if (newCat.length > 64) {
    showToast('Категория: максимум 64 символа');
    return;
  }
  
  const select = document.getElementById('adminEditCategorySelect');
  
  // Проверяем, нет ли уже такой категории
  const exists = Array.from(select.options).some(opt => opt.value.toLowerCase() === newCat.toLowerCase());
  if (exists) {
    showToast('Такая категория уже существует');
    input.value = '';
    return;
  }
  
  // Добавляем новую опцию
  const option = document.createElement('option');
  option.value = newCat;
  option.textContent = newCat;
  select.appendChild(option);
  
  // Выделяем новую категорию
  option.selected = true;
  
  // Очищаем поле
  input.value = '';
  
  showToast(`Категория "${newCat}" добавлена`);
}

function onAdminCategoryChange(value) {
  const newInput = document.getElementById('adminEditCategoryNew');
  newInput.style.display = value === '__new__' ? 'block' : 'none';
  if (value === '__new__') newInput.focus();
}

function getAdminSelectedCategories() {
  const select = document.getElementById('adminEditCategorySelect');
  const cats = getCategoryTags('newCategoriesContainer');
  
  const newCatInput = document.getElementById('adminEditCategoryNew');
  const newCat = newCatInput.value.trim();
  if (newCat) {
    const exists = Array.from(select.options).some(opt => opt.value.toLowerCase() === newCat.toLowerCase());
    if (!exists) {
      selected.push(newCat);
    }
  }
  
  if (selected.length === 0) {
    throw new Error('Выберите или введите хотя бы одну категорию');
  }
  
  return selected;
}
// ========== ADMIN MODAL HANDLERS ==========
document.getElementById('adminSaveFieldsBtn').addEventListener('click', async () => {
  if (!adminBookModalCurrentId) return;

  const title = document.getElementById('adminEditTitle').value.trim();
  const author = document.getElementById('adminEditAuthor').value.trim();
  const description = document.getElementById('adminEditDescription').value.trim();
  const icon = document.getElementById('adminEditIcon').value.trim();

  // Категории из компонента тэгов
  const cats = getCategoryTags('adminCategoriesContainer');

  if (!title || !author) return showToast('Заполните название и автора');
  if (cats.length === 0) return showToast('Добавь хотя бы одну категорию');

  for (const cat of cats) {
    if (cat.length > 64) return showToast(`Категория "${cat}": максимум 64 символа`);
  }

  const btn = document.getElementById('adminSaveFieldsBtn');
  btn.disabled = true;
  btn.textContent = 'Сохранение...';

  try {
    await api.books.update(adminBookModalCurrentId, {
      title,
      author,
      categories: cats,
      description,
      icon: icon || undefined,
    });
    await loadBooksFromApi();
    showToast('Изменения сохранены');
    if (state.currentTab === 'admin') renderAdminScreen();
  } catch (e) {
    console.error(e);
    showToast('Ошибка: ' + (e.detail || e.message));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Сохранить поля';
  }
});

document.getElementById('adminUploadFileBtn').addEventListener('click', async () => {
  if (!adminBookModalCurrentId) return;
  const file = document.getElementById('adminBookFileInput').files[0];
  if (!file) return showToast('Выберите файл книги');
  const MAX_SIZE = 150 * 1024 * 1024;
  if (file.size > MAX_SIZE) return showToast('Файл больше 150 МБ');

  const btn = document.getElementById('adminUploadFileBtn');
  btn.disabled = true;
  btn.textContent = '...';

  try {
    const format = detectFileFormat(file);
    if (format === 'epub') {
      if (typeof api.books.uploadEpub === 'function') {
        await api.books.uploadEpub(adminBookModalCurrentId, file);
      } else {
        await api.books.uploadPdf(adminBookModalCurrentId, file);
      }
    } else {
      await api.books.uploadPdf(adminBookModalCurrentId, file);
    }
    document.getElementById('adminFileStatus').textContent = `Файл загружен (${format.toUpperCase()})`;
    document.getElementById('adminBookFileInput').value = '';
    showToast('Файл загружен');
    await loadBooksFromApi();
    if (state.currentScreen === 'detail' && currentBookId === adminBookModalCurrentId) {
      state.currentBook = state.books.find(b => b.id === adminBookModalCurrentId) || state.currentBook;
      renderBookInfo();
    }
  } catch (err) {
    showToast('Ошибка загрузки: ' + (err.detail || err.message));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Загрузить';
  }
});

document.getElementById('adminDeleteFileBtn').addEventListener('click', async () => {
  if (!adminBookModalCurrentId) return;
  if (!confirm('Удалить файл книги? Файл будет удалён с сервера.')) return;
  try {
    await api.books.deletePdf(adminBookModalCurrentId);
    document.getElementById('adminFileStatus').textContent = '— Файл ещё не загружен';
    showToast('Файл удалён');
    await loadBooksFromApi();
    if (state.currentScreen === 'detail' && currentBookId === adminBookModalCurrentId) {
      state.currentBook = state.books.find(b => b.id === adminBookModalCurrentId) || state.currentBook;
      renderBookInfo();
    }
  } catch (err) {
    showToast('Ошибка: ' + (err.detail || err.message));
  }
});

document.getElementById('adminUploadCoverBtn').addEventListener('click', async () => {
  if (!adminBookModalCurrentId) return;
  const file = document.getElementById('adminCoverFile').files[0];
  if (!file) return showToast('Выберите файл обложки');
  if (file.size > 5 * 1024 * 1024) return showToast('Обложка больше 5 МБ');

  const btn = document.getElementById('adminUploadCoverBtn');
  btn.disabled = true;
  btn.textContent = '...';
  try {
    const result = await api.books.uploadCover(adminBookModalCurrentId, file);
    document.getElementById('adminCoverStatus').textContent = 'Обложка загружена';
    document.getElementById('adminCoverFile').value = '';
    showToast(result.replaced ? 'Обложка заменена' : 'Обложка загружена');
    await loadBooksFromApi();
    if (state.currentScreen === 'detail' && currentBookId === adminBookModalCurrentId) {
      state.currentBook = state.books.find(b => b.id === adminBookModalCurrentId) || state.currentBook;
      renderBookInfo();
    }
  } catch (err) {
    showToast('Ошибка загрузки: ' + (err.detail || err.message));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Загрузить';
  }
});

document.getElementById('adminDeleteCoverBtn').addEventListener('click', async () => {
  if (!adminBookModalCurrentId) return;
  if (!confirm('Удалить обложку у этой книги?')) return;
  try {
    await api.books.deleteCover(adminBookModalCurrentId);
    document.getElementById('adminCoverStatus').textContent = '— Обложка ещё не загружена';
    showToast('Обложка удалена');
    await loadBooksFromApi();
    if (state.currentScreen === 'detail' && currentBookId === adminBookModalCurrentId) {
      state.currentBook = state.books.find(b => b.id === adminBookModalCurrentId) || state.currentBook;
      renderBookInfo();
    }
  } catch (err) {
    showToast('Ошибка: ' + (err.detail || err.message));
  }
});

document.getElementById('adminDeleteBookBtn').addEventListener('click', async () => {
  if (!adminBookModalCurrentId) return;
  const book = state.books.find(b => b.id === adminBookModalCurrentId);
  const title = book ? book.title : `книгу #${adminBookModalCurrentId}`;
  if (!confirm(`Удалить «${title}» полностью? Это действие необратимо.`)) return;

  try {
    await api.books.delete(adminBookModalCurrentId);
    showToast('Книга удалена');
    closeAdminBookModal();
    await loadBooksFromApi();
    if (state.currentScreen === 'detail' && currentBookId === adminBookModalCurrentId) {
      currentBookId = null;
      state.currentBook = null;
      navigateTo('home');
    } else {
      renderHome();
    }
  } catch (err) {
    showToast('Ошибка: ' + (err.detail || err.message));
  }
});

// ========== SAVE BOOK ==========
document.getElementById('saveBookBtn').addEventListener('click', async () => {
  const t = document.getElementById('newTitle').value.trim();
  const a = document.getElementById('newAuthor').value.trim();
  const desc = document.getElementById('newDescription').value.trim();

  // Категории из нового компонента тэгов
  const cats = getCategoryTags('newCategoriesContainer');

  if (!t || !a) return showToast('Заполните название и автора');
  if (cats.length === 0) return showToast('Добавь хотя бы одну категорию');

  for (const cat of cats) {
    if (cat.length > 64) return showToast(`Категория "${cat}": максимум 64 символа`);
  }

  const coverFile = document.getElementById('newCover').files[0];
  const bookFile = document.getElementById('newBookFile').files[0];

  const MAX_FILE_MB = 150, MAX_COVER_MB = 5;
  if (bookFile && bookFile.size > MAX_FILE_MB * 1024 * 1024) return showToast(`Файл книги больше ${MAX_FILE_MB} МБ`);
  if (coverFile && coverFile.size > MAX_COVER_MB * 1024 * 1024) return showToast(`Обложка больше ${MAX_COVER_MB} МБ`);

  const btn = document.getElementById('saveBookBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Создание...';

  try {
    const format = detectFileFormat(bookFile);
    const created = await api.books.create({
      title: t,
      author: a,
      categories: cats,
      description: desc,
      icon: ICONS.bookCover,
      file_format: format,
    });
    const newId = created.id;

    if (bookFile) {
      btn.textContent = 'Загрузка файла...';
      try {
        if (format === 'epub' && typeof api.books.uploadEpub === 'function') {
          await api.books.uploadEpub(newId, bookFile);
        } else {
          await api.books.uploadPdf(newId, bookFile);
        }
      } catch (err) {
        showToast('Не удалось загрузить файл: ' + (err.detail || err.message));
      }
    }

    if (coverFile) {
      btn.textContent = 'Загрузка обложки...';
      try {
        await api.books.uploadCover(newId, coverFile);
      } catch (err) {
        showToast('Не удалось загрузить обложку: ' + (err.detail || err.message));
      }
    } else if (bookFile && format !== 'epub') {
      // Обложка не задана вручную — генерируем из первой страницы PDF
      btn.textContent = 'Создание обложки...';
      try {
        const coverBlob = await generateCoverFromPdf(bookFile);
        if (coverBlob) {
          const coverGenFile = new File([coverBlob], 'cover.jpg', { type: 'image/jpeg' });
          await api.books.uploadCover(newId, coverGenFile);
        }
      } catch (err) {
        console.warn('Не удалось создать обложку из PDF:', err);
      }
    }

    await loadBooksFromApi();
    closeAddModal();

    // Очищаем поля формы
    document.getElementById('newTitle').value = '';
    document.getElementById('newAuthor').value = '';
    document.getElementById('newDescription').value = '';
    document.getElementById('newCover').value = '';
    document.getElementById('newBookFile').value = '';

    // Сбрасываем тэги
    if (categoryTagsInstances['newCategoriesContainer']) {
      categoryTagsInstances['newCategoriesContainer'].tags = [];
      renderCategoryChips('newCategoriesContainer');
    }

    showToast('Книга добавлена');
    if (state.currentTab === 'admin') renderAdminScreen();
  } catch (e) {
    console.error(e);
    showToast('Ошибка создания: ' + (e.detail || e.message));
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});
// ========== ADMIN PANEL ==========
document.querySelectorAll('.admin-tab-btn').forEach(t => t.addEventListener('click', function () {
  document.querySelectorAll('.admin-tab-btn').forEach(x => x.classList.remove('active'));
  this.classList.add('active');
  document.querySelectorAll('.admin-panel-section').forEach(s => s.classList.remove('show'));
  document.getElementById('ad' + this.dataset.atab.charAt(0).toUpperCase() + this.dataset.atab.slice(1)).classList.add('show');
  renderAdminPanel();
}));

function renderAdminPanel() {
  const at = document.querySelector('.admin-tab-btn.active')?.dataset?.atab || 'dashboard';
  if (at === 'dashboard') renderDashboard();
  if (at === 'books') renderAdminBooks();
  if (at === 'users') loadAndRenderAdminUsers();
  if (at === 'reviews') loadAndRenderAdminReviews();
  if (at === 'analytics') renderAnalytics();
  if (at === 'leaderboard') loadAndRenderLeaderboard();
}

async function renderDashboard() {
  const container = document.getElementById('adDashboard');
  replaceWithStaticText(container, 'Загрузка...', 'a449');

  try {
    const stats = await api.library.adminDashboard();
    container.innerHTML = `
      <div class="stat-cards">
        <div class="stat-card">
          <div class="stat-value">${stats.total_books}</div>
          <div class="stat-label">Книг в каталоге</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.total_users}</div>
          <div class="stat-label">Пользователей</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.total_views}</div>
          <div class="stat-label">Просмотров</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.total_downloads}</div>
          <div class="stat-label">Скачиваний</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.total_reviews}</div>
          <div class="stat-label">Отзывов</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.total_quiz_attempts}</div>
          <div class="stat-label">Попыток тестов</div>
        </div>
      </div>`;
  } catch (err) {
    console.error('Ошибка загрузки дашборда:', err);
    replaceWithStaticText(container, 'Не удалось загрузить статистику', 'a150');
  }
}

function renderAdminBooks() {
  document.getElementById('adBooks').innerHTML = `
    <div data-static-style="a541">
      <div data-static-style="a542">
        <div data-static-style="a543">Всего книг:</div>
        <div data-static-style="a544">${state.books.length}</div>
      </div>
      <button data-onclick="openBulkUploadModal()" data-static-style="a545">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/><path d="M12 5v8"/><path d="M8 9l4-4 4 4"/></svg>
        Массовая загрузка
      </button>
      <button data-onclick="reindexAllBooksUI()" data-nonce="${sensitiveNonce()}" title="Переиндексировать текст всех книг для поиска" data-static-style="a546">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
        Индексировать поиск
      </button>
      <button data-onclick="openAdminLogs()" title="Журнал действий администраторов" data-static-style="a547">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        Журнал
      </button>
      <button data-onclick="generateMissingCoversUI()" data-nonce="${sensitiveNonce()}" title="Создать обложки для книг без обложки" data-static-style="a547">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>
        Обложки
      </button>
      <button data-onclick="aiMatchArBooksUI()" data-nonce="${sensitiveNonce()}" title="ИИ подберёт книги к темам AR-схем" data-static-style="a548">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/><circle cx="12" cy="12" r="3"/></svg>
        Подобрать книги для AR
      </button>
      <button data-onclick="regenerateAllQuizzesUI()" data-nonce="${sensitiveNonce()}" title="Сбросить и пересоздать тесты всех книг (по 15 вопросов)" data-static-style="a549">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
        Перегенерировать тесты
      </button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Книга</th>
            <th>Автор</th>
            <th>Категория</th>
            <th>Формат</th>
            <th>Рейтинг</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          ${state.books.map(b => `
            <tr>
              <td>${eh(b.title)}</td>
              <td>${eh(b.author)}</td>
              <td>${bookCategoriesText(b)}</td>
              <td>${(b.file_format || 'pdf').toUpperCase()}</td>
              <td>${ICONS.star}${b.rating}</td>
              <td>
                <button class="btn-sm" data-onclick="openBookAnalyticsModal(${b.id})" title="Аналитика">📊</button>
                <button class="btn-sm" data-onclick="openAdminBookModal(${b.id})">${ICONS.settings}</button>
                <button class="btn-sm danger" data-onclick="deleteBook(${b.id})" data-nonce="${sensitiveNonce()}">${ICONS.trash}</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}
// ========== МАССОВАЯ ЗАГРУЗКА КНИГ ==========

let bulkUploadQueue = []; // [{file, status: 'pending'|'uploading'|'done'|'error', message}]
let bulkUploadInProgress = false;

// Рендер первой страницы PDF в JPEG-обложку (клиентская генерация)
async function generateCoverFromPdf(file) {
  try { await ensurePdfLoaded(); } catch (e) { console.warn('pdf.js не загружен:', e); return null; }
  if (typeof pdfjsLib === 'undefined') { console.warn('pdfjsLib недоступен после ensurePdfLoaded'); return null; }
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    // Масштаб под обложку ~800px по ширине
    const baseViewport = page.getViewport({ scale: 1 });
    const targetWidth = 800;
    const scale = targetWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    // белый фон (PDF может быть с прозрачностью)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    try { pdf.destroy(); } catch (_) {}
    return blob;
  } catch (e) {
    console.warn('generateCoverFromPdf error:', e);
    return null;
  }
}

function openBulkUploadModal() {
  document.getElementById('bulkUploadModal').classList.remove('hidden');
  bulkUploadQueue = [];
  renderBulkUploadList();

  // Привязываем обработчики (один раз)
  const zone = document.getElementById('bulkUploadDropZone');
  const input = document.getElementById('bulkUploadInput');

  if (!zone._handlersAttached) {
    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.style.borderColor = 'var(--accent)';
      zone.style.background = 'rgba(0,212,255,0.08)';
    });
    zone.addEventListener('dragleave', () => {
      zone.style.borderColor = 'var(--border)';
      zone.style.background = 'var(--bg-primary)';
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.style.borderColor = 'var(--border)';
      zone.style.background = 'var(--bg-primary)';
      addFilesToBulkQueue(e.dataTransfer.files);
    });

    input.addEventListener('change', (e) => {
      addFilesToBulkQueue(e.target.files);
      input.value = ''; // чтобы можно было выбрать те же файлы снова
    });

    zone._handlersAttached = true;
  }
}

function closeBulkUploadModal() {
  if (bulkUploadInProgress) {
    if (!confirm('Загрузка ещё идёт. Точно закрыть? Незавершённые книги останутся в БД.')) return;
  }
  document.getElementById('bulkUploadModal').classList.add('hidden');
  bulkUploadQueue = [];
  bulkUploadInProgress = false;
}

function addFilesToBulkQueue(fileList) {
  const allowed = ['pdf', 'epub'];
  const MAX_SIZE = 150 * 1024 * 1024;
  let skipped = 0;
  for (const file of fileList) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) { skipped++; continue; }
    if (file.size > MAX_SIZE) { skipped++; continue; }
    bulkUploadQueue.push({ file, status: 'pending', message: 'В очереди' });
  }
  if (skipped > 0) showToast(`Пропущено файлов: ${skipped} (неверный формат или > 150 МБ)`);
  renderBulkUploadList();
}

function renderBulkUploadList() {
  const listEl = document.getElementById('bulkUploadList');
  const actionsEl = document.getElementById('bulkUploadActions');
  const catPanel = document.getElementById('bulkUploadCategoryPanel');
  if (!listEl) return;

  if (bulkUploadQueue.length === 0) {
    listEl.replaceChildren();
    actionsEl.style.display = 'none';
    catPanel.style.display = 'none';
    return;
  }

  catPanel.style.display = 'block';
  actionsEl.style.display = 'flex';

  const statusIcon = {
    pending: '⏸',
    uploading: '⏳',
    done: '✓',
    error: '✕',
  };
  const statusColor = {
    pending: 'var(--text-muted)',
    uploading: 'var(--accent)',
    done: '#22c55e',
    error: '#ef4444',
  };

  listEl.innerHTML = bulkUploadQueue.map((item, idx) => `
    <div data-static-style="a550">
      <div data-dynamic-style="${dynamicStyleToken`width:20px;text-align:center;color:${statusColor[item.status]};font-weight:700;flex-shrink:0;`}">${statusIcon[item.status]}</div>
      <div data-static-style="a551" title="${eh(item.file.name)}">${eh(item.file.name)}</div>
      <div data-dynamic-style="${dynamicStyleToken`color:${statusColor[item.status]};font-size:10px;flex-shrink:0;`}">${eh(item.message)}</div>
    </div>
  `).join('');

  // Прогресс
  const done = bulkUploadQueue.filter(i => i.status === 'done').length;
  const errors = bulkUploadQueue.filter(i => i.status === 'error').length;
  const progressEl = document.getElementById('bulkUploadProgress');
  if (progressEl) {
    progressEl.textContent = `${done} / ${bulkUploadQueue.length}` + (errors ? ` (ошибок: ${errors})` : '');
  }
}

function clearBulkUploadList() {
  if (bulkUploadInProgress) { showToast('Идёт загрузка, нельзя очистить'); return; }
  bulkUploadQueue = [];
  renderBulkUploadList();
}

async function startBulkUpload() {
  if (bulkUploadInProgress) return;
  const pending = bulkUploadQueue.filter(i => i.status === 'pending');
  if (pending.length === 0) { showToast('Нет файлов для загрузки'); return; }

  bulkUploadInProgress = true;
  document.getElementById('bulkUploadStartBtn').disabled = true;
  document.getElementById('bulkUploadStartBtn').textContent = 'Загрузка...';

  const defaultCategory = (document.getElementById('bulkUploadCategory').value || '').trim();
  const categories = defaultCategory ? [defaultCategory] : ['Без категории'];

  for (let i = 0; i < bulkUploadQueue.length; i++) {
    const item = bulkUploadQueue[i];
    if (item.status !== 'pending') continue;

    item.status = 'uploading';
    item.message = 'Создаётся...';
    renderBulkUploadList();

    try {
      const ext = item.file.name.split('.').pop().toLowerCase();
      const format = (ext === 'epub') ? 'epub' : 'pdf';
      const title = item.file.name.replace(/\.(pdf|epub)$/i, '').replace(/[_-]/g, ' ').trim() || 'Без названия';

      // 1. Создаём книгу
      const created = await api.books.create({
        title: title,
        author: '—',
        categories: categories,
        description: '',
        icon: ICONS.bookCover,
        file_format: format,
      });

      // 2. Загружаем файл
      item.message = 'Загрузка файла...';
      renderBulkUploadList();

      if (format === 'epub' && typeof api.books.uploadEpub === 'function') {
        await api.books.uploadEpub(created.id, item.file);
      } else {
        await api.books.uploadPdf(created.id, item.file);
        // Автообложка из первой страницы PDF
        item.message = 'Создание обложки...';
        renderBulkUploadList();
        try {
          const coverBlob = await generateCoverFromPdf(item.file);
          if (coverBlob) {
            const coverGenFile = new File([coverBlob], 'cover.jpg', { type: 'image/jpeg' });
            await api.books.uploadCover(created.id, coverGenFile);
          }
        } catch (coverErr) {
          console.warn('Автообложка не создана для', item.file.name, coverErr);
        }
      }

      item.status = 'done';
      item.message = 'Создана';
    } catch (e) {
      item.status = 'error';
      item.message = 'Ошибка: ' + ((e.detail || e.message || '').substring(0, 40));
      console.error('Bulk upload error:', e);
    }
    renderBulkUploadList();
  }

  bulkUploadInProgress = false;
  document.getElementById('bulkUploadStartBtn').disabled = false;
  document.getElementById('bulkUploadStartBtn').textContent = 'Загрузить';

  const done = bulkUploadQueue.filter(i => i.status === 'done').length;
  const errors = bulkUploadQueue.filter(i => i.status === 'error').length;
  showToast(`Создано книг: ${done}` + (errors ? ` · Ошибок: ${errors}` : ''));

  // Обновляем каталог
  await loadBooksFromApi();
  if (state.currentScreen === 'admin') renderAdminPanel();
}
async function loadAndRenderAdminReviews() {
  const container = document.getElementById('adReviews');
  if (!container) return;
  replaceWithStaticText(container, 'Загрузка отзывов...', 'a449');

  try {
    const books = state.books;
    let allReviews = [];

    for (const book of books) {
      const reviews = await getReviews(book.id);
      reviews.forEach(r => {
        allReviews.push({
          ...r,
          bookId: book.id,
          bookTitle: book.title
        });
      });
    }

    allReviews.sort((a, b) => new Date(b.date) - new Date(a.date));

    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Книга</th>
              <th>Пользователь</th>
              <th>Оценка</th>
              <th>Текст</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            ${allReviews.map(r => `
              <tr>
                <td>${eh(r.bookTitle)}</td>
                <td>${eh(r.user)}</td>
                <td>${Array(r.rating).fill(ICONS.star).join('')}</td>
                <td>${eh((r.text || '').substring(0, 50))}${r.text && r.text.length > 50 ? '...' : ''}</td>
                <td>
                  <button class="btn-sm danger" data-onclick="deleteReviewAndRefresh(${r.bookId}, ${r.id})" data-nonce="${sensitiveNonce()}">${ICONS.trash}</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    replaceWithStaticText(container, 'Не удалось загрузить отзывы', 'a150');
  }
}

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

function renderAdminUsersWithFilter() {
  const container = document.getElementById('adUsers');
  const users = state._adminUsers || [];
  if (!users.length) {
    replaceWithStaticText(container, 'Нет пользователей', 'a209');
    return;
  }

  const filter = state._adminUsersFilter || 'all';
  const limit = state._adminUsersLimit || 10;

  let sorted = [...users];
  let title = '';
  if (filter === 'top_books') {
    sorted.sort((a, b) => (b.completed_books || 0) - (a.completed_books || 0));
    title = `ТОП-${limit} по прочитанным книгам`;
  } else if (filter === 'top_xp') {
    sorted.sort((a, b) => (b.xp || 0) - (a.xp || 0));
    title = `ТОП-${limit} по XP (активности)`;
  } else if (filter === 'top_perfect') {
    sorted.sort((a, b) => (b.perfect_quizzes || 0) - (a.perfect_quizzes || 0));
    title = `ТОП-${limit} по тестам на 100%`;
  }

  const displayed = filter === 'all' ? sorted : sorted.slice(0, limit);

  // Сводная статистика — по всем юзерам
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.is_active).length;
  const totalCompleted = users.reduce((s, u) => s + (u.completed_books || 0), 0);
  const totalAttempts = users.reduce((s, u) => s + (u.quiz_attempts || 0), 0);

  const miniDash = `
    <div data-static-style="a552">
      <div data-static-style="a553">
        <div data-static-style="a245">${totalUsers}</div>
        <div data-static-style="a192">Всего пользователей</div>
      </div>
      <div data-static-style="a553">
        <div data-static-style="a554">${activeUsers}</div>
        <div data-static-style="a192">Активных</div>
      </div>
      <div data-static-style="a553">
        <div data-static-style="a242">${totalCompleted}</div>
        <div data-static-style="a192">Книг прочитано (всеми)</div>
      </div>
      <div data-static-style="a553">
        <div data-static-style="a555">${totalAttempts}</div>
        <div data-static-style="a192">Попыток тестов</div>
      </div>
    </div>
  `;

  const filterPanel = `
    <div data-static-style="a556">
      <label data-static-style="a192">Показать:</label>
      <select id="adminUsersFilter" data-onchange="onAdminUsersFilterChange()" data-static-style="a557">
        <option value="all"${filter==='all'?' selected':''}>Все</option>
        <option value="top_books"${filter==='top_books'?' selected':''}>ТОП по прочитанным книгам</option>
        <option value="top_xp"${filter==='top_xp'?' selected':''}>ТОП по XP (активности)</option>
        <option value="top_perfect"${filter==='top_perfect'?' selected':''}>ТОП по тестам на 100%</option>
      </select>
      ${filter !== 'all' ? `
        <label data-static-style="a558">Размер ТОП:</label>
        <select id="adminUsersLimit" data-onchange="onAdminUsersLimitChange()" data-static-style="a557">
          <option value="5"${limit===5?' selected':''}>5</option>
          <option value="10"${limit===10?' selected':''}>10</option>
          <option value="25"${limit===25?' selected':''}>25</option>
          <option value="50"${limit===50?' selected':''}>50</option>
        </select>
      ` : ''}
    </div>
    ${title ? `<div data-static-style="a559">${title}</div>` : ''}
  `;

  const tableHtml = `
    <div class="table-wrap"><table>
      <thead><tr>
        ${filter !== 'all' ? '<th>#</th>' : ''}
        <th>ID</th>
        <th>Логин</th>
        <th>ФИО</th>
        <th>Подразделение</th>
        <th>Email</th>
        <th>Роль</th>
        <th>Уровень</th>
        <th>XP</th>
        <th>Стрик</th>
        <th>Книг прочит.</th>
        <th>Тестов</th>
        <th>На 100%</th>
        <th>Страниц</th>
        <th>Активен</th>
        <th>Действия</th>
      </tr></thead>
      <tbody>
        ${displayed.map((u, idx) => {
          const levelInfo = u.cyber_level ? getCyberLevelInfo(u.cyber_level) : null;
          return `<tr>
            ${filter !== 'all' ? `<td data-static-style="a560">${idx + 1}</td>` : ''}
            <td>${u.id}</td>
            <td>${eh(u.username)}</td>
            <td>${eh(u.full_name || '—')}</td>
            <td>${eh(u.department || '—')}</td>
            <td>${eh(u.email || '—')}</td>
            <td>${u.role}</td>
            <td>${levelInfo ? eh(levelInfo.name) : '—'}</td>
            <td>${u.xp}</td>
            <td>${u.streak_count}</td>
            <td>${u.completed_books}</td>
            <td>${u.quiz_attempts}</td>
            <td>${u.perfect_quizzes}</td>
            <td>${u.total_pages_read}</td>
            <td>${u.is_active ? ICONS.check : ICONS.x}</td>
            <td>${u.role !== 'admin'
              ? `<button class="btn-sm danger" data-onclick="deleteAdminUser(${u.id}, '${eh(u.username).replace(/'/g, "\\'")}')" data-nonce="${sensitiveNonce()}">${ICONS.trash}</button>`
              : '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  `;

  const actionsBar = `
    <div class="admin-actions-bar" data-static-style="a561">
      <button data-onclick="openCreateUserModal()" title="Создать пользователя" data-static-style="a562">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="11" x2="19" y2="17"/><line x1="16" y1="14" x2="22" y2="14"/></svg>
        Создать пользователя
      </button>
      <button data-onclick="openPendingUsersModal()" title="Заявки на регистрацию" data-static-style="a563">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        Заявки
        <span id="pendingUsersBadge" data-static-style="a564"></span>
      </button>
      <button data-onclick="openExportModal()" title="Выгрузка прочитанного в Excel" data-static-style="a565">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Excel
      </button>
    </div>`;

  container.innerHTML = actionsBar + miniDash + filterPanel + tableHtml;
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
