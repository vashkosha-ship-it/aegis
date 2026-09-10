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
    const fragment = document.createDocumentFragment();
    logs.forEach(log => {
      const row = document.createElement('div');
      row.setAttribute('data-static-style', 'a131');
      const heading = document.createElement('div');
      heading.setAttribute('data-static-style', 'a132');
      const action = document.createElement('span');
      action.setAttribute('data-static-style', 'a133');
      action.textContent = String(actionLabel[log.action] || log.action || '—');
      const date = document.createElement('span');
      date.setAttribute('data-static-style', 'a134');
      const d = new Date(log.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      date.textContent = d;
      heading.append(action, date);
      const detail = document.createElement('div');
      detail.setAttribute('data-static-style', 'a135');
      detail.textContent = String(log.detail || '');
      const admin = document.createElement('div');
      admin.setAttribute('data-static-style', 'a136');
      admin.textContent = String(log.admin || '—');
      row.append(heading, detail, admin);
      fragment.appendChild(row);
    });
    body.replaceChildren(fragment);
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
      const fragment = document.createDocumentFragment();
      users.forEach(user => {
        const row = document.createElement('div');
        row.setAttribute('data-static-style', 'a189');
        row.setAttribute('data-pending-user-row', '');
        const info = document.createElement('div');
        info.setAttribute('data-static-style', 'a190');
        const name = document.createElement('div');
        name.setAttribute('data-static-style', 'a191');
        name.textContent = String(user.full_name || user.username || '');
        const meta = document.createElement('div');
        meta.setAttribute('data-static-style', 'a192');
        meta.textContent = `@${user.username || ''} · ${user.email || '—'}`;
        info.append(name, meta);
        if (user.department) {
          const department = document.createElement('div');
          department.setAttribute('data-static-style', 'a193');
          department.textContent = String(user.department);
          info.appendChild(department);
        }
        const actions = document.createElement('div');
        actions.setAttribute('data-static-style', 'a194');
        const approve = document.createElement('button');
        approve.type = 'button';
        approve.setAttribute('data-static-style', 'a195');
        approve.textContent = 'Одобрить';
        approve.addEventListener('click', () => approvePendingUser(user.id, approve));
        const reject = document.createElement('button');
        reject.type = 'button';
        reject.setAttribute('data-static-style', 'a196');
        reject.textContent = 'Отклонить';
        reject.addEventListener('click', () => rejectPendingUser(user.id, reject));
        actions.append(approve, reject);
        row.append(info, actions);
        fragment.appendChild(row);
      });
      list.replaceChildren(fragment);
    }
    updatePendingBadge(users.length);
  } catch (err) {
    console.error('Ошибка загрузки заявок:', err, err && err.status, err && err.body);
    const detail = (err && (err.detail || (err.body && err.body.detail))) || (err && err.message) || '';
    const message = document.createElement('div');
    message.setAttribute('data-static-style', 'a197');
    message.textContent = 'Не удалось загрузить заявки';
    if (detail) {
      const detailNode = document.createElement('span');
      detailNode.setAttribute('data-static-style', 'a192');
      detailNode.textContent = String(detail);
      message.append(document.createElement('br'), detailNode);
    }
    document.getElementById('pendingUsersList').replaceChildren(message);
  }
}

async function approvePendingUser(userId, btn) {
  btn.disabled = true; btn.textContent = '…';
  try {
    await api.library.adminApproveUser(userId);
    btn.closest('[data-pending-user-row]')?.remove();
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
    btn.closest('[data-pending-user-row]')?.remove();
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
function renderReindexResult(container, status) {
  const result = document.createElement('div');
  result.setAttribute('data-static-style', 'a203');
  const errors = status.errors ? `, ошибок: ${status.errors}` : '';
  result.textContent = `✓ Готово: ${status.done} книг, ${status.indexed_pages} страниц${errors}`;
  container.replaceChildren(result);
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
        renderReindexResult(body, s);
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
    const hits = keywords.filter(keyword => hay.includes(keyword.toLowerCase())).length;
    if (hits > 0) matches.push({ code, hits });
  }
  matches.sort((a, b) => b.hits - a.hits);

  if (!matches.length) {
    replaceWithStaticText(el, 'Нет явных совпадений по темам. Книга подходит для общего доступа.', 'a243');
    return;
  }

  const title = document.createElement('div');
  title.setAttribute('data-static-style', 'a347');
  title.textContent = 'Книга релевантна подразделениям:';
  const list = document.createElement('div');
  list.setAttribute('data-static-style', 'a089');
  matches.forEach(match => {
    const item = document.createElement('span');
    item.setAttribute('data-static-style', 'a528');
    const code = document.createElement('span');
    code.setAttribute('data-static-style', 'a191');
    code.textContent = String(match.code);
    const hits = document.createElement('span');
    hits.setAttribute('data-static-style', 'a099');
    hits.textContent = String(match.hits);
    const button = document.createElement('button');
    button.type = 'button';
    button.title = `Сделать обязательной для ${match.code}`;
    button.setAttribute('data-static-style', 'a529');
    button.textContent = '★ обязательная';
    button.addEventListener('click', () => markRequiredForDept(book.id, match.code, button));
    item.append(code, hits, button);
    list.appendChild(item);
  });
  el.replaceChildren(title, list);
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

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cat-tag-input';
  input.placeholder = 'Введи категорию и нажми Enter…';
  input.autocomplete = 'off';
  const suggestionsBox = document.createElement('div');
  suggestionsBox.className = 'cat-tag-suggestions';
  container.replaceChildren(input, suggestionsBox);

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

  input.addEventListener('keydown', (event) => {
    const inst = categoryTagsInstances[containerId];
    const items = suggestionsBox.querySelectorAll('.cat-tag-suggestion-item');

    if (event.key === 'Enter') {
      event.preventDefault();
      if (inst.highlightedIndex >= 0 && items[inst.highlightedIndex]) {
        addCategoryTag(containerId, items[inst.highlightedIndex].dataset.name);
      } else {
        const value = input.value.trim();
        if (value) addCategoryTag(containerId, value);
      }
      input.value = '';
      hideCategorySuggestions(containerId);
    } else if (event.key === 'Backspace' && input.value === '' && inst.tags.length > 0) {
      removeCategoryTag(containerId, inst.tags[inst.tags.length - 1]);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (items.length > 0) inst.highlightedIndex = (inst.highlightedIndex + 1) % items.length;
      updateSuggestionHighlight(containerId);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (items.length > 0) inst.highlightedIndex = inst.highlightedIndex <= 0 ? items.length - 1 : inst.highlightedIndex - 1;
      updateSuggestionHighlight(containerId);
    } else if (event.key === 'Escape') {
      hideCategorySuggestions(containerId);
    } else if (event.key === ',') {
      event.preventDefault();
      const value = input.value.trim();
      if (value) addCategoryTag(containerId, value);
      input.value = '';
      hideCategorySuggestions(containerId);
    }
  });

  document.addEventListener('click', (event) => {
    if (!container.contains(event.target)) hideCategorySuggestions(containerId);
  });
  container.addEventListener('click', (event) => {
    if (event.target === container) input.focus();
  });
}

function renderCategoryChips(containerId) {
  const inst = categoryTagsInstances[containerId];
  if (!inst) return;
  inst.container.querySelectorAll('.cat-tag-chip').forEach(chip => chip.remove());
  inst.tags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'cat-tag-chip';
    chip.appendChild(document.createTextNode(String(tag)));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'cat-tag-chip-x';
    remove.dataset.tag = String(tag);
    remove.textContent = '×';
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      removeCategoryTag(containerId, tag);
    });
    chip.appendChild(remove);
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
  let allCategories;
  try { allCategories = await api.books.categories(); }
  catch (error) { allCategories = []; }
  const normalizedQuery = query.toLowerCase();
  const selected = new Set(inst.tags.map(tag => tag.toLowerCase()));
  const matching = allCategories.filter(category =>
    category.toLowerCase().includes(normalizedQuery) && !selected.has(category.toLowerCase())
  );
  const fragment = document.createDocumentFragment();
  const appendSuggestion = (name, label, isNew = false) => {
    const item = document.createElement('div');
    item.className = 'cat-tag-suggestion-item';
    item.dataset.name = String(name);
    if (isNew) item.setAttribute('data-static-style', 'a530');
    item.textContent = label;
    item.addEventListener('click', () => {
      addCategoryTag(containerId, item.dataset.name);
      inst.input.value = '';
      inst.input.focus();
      hideCategorySuggestions(containerId);
    });
    fragment.appendChild(item);
  };
  matching.forEach(category => appendSuggestion(category, category));
  const exactMatch = allCategories.some(category => category.toLowerCase() === normalizedQuery);
  if (!exactMatch && query.length > 0) appendSuggestion(query, `+ Создать: «${query}»`, true);
  if (!fragment.childNodes.length) {
    const empty = document.createElement('div');
    empty.className = 'cat-tag-suggestion-empty';
    empty.textContent = 'Нет подходящих категорий';
    fragment.appendChild(empty);
  }
  inst.suggestionsBox.replaceChildren(fragment);
  inst.suggestionsBox.classList.add('active');
  inst.highlightedIndex = -1;
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

function renderAdminBookRows(tbody, books) {
  const fragment = document.createDocumentFragment();
  books.forEach(book => {
    const row = document.createElement('tr');
    appendAdminCell(row, book.title);
    appendAdminCell(row, book.author);
    appendAdminCell(row, bookCategoriesText(book));
    appendAdminCell(row, String(book.file_format || 'pdf').toUpperCase());
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
    settings.className = 'btn-sm';
    appendTrustedIcon(settings, ICONS.settings);
    settings.addEventListener('click', () => openAdminBookModal(book.id));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn-sm danger';
    appendTrustedIcon(remove, ICONS.trash);
    remove.addEventListener('click', () => deleteBook(book.id));
    actions.append(analytics, settings, remove);
    row.appendChild(actions);
    fragment.appendChild(row);
  });
  tbody.replaceChildren(fragment);
}

function renderAdminBooks() {
  const container = document.getElementById('adBooks');
  container.innerHTML = `
    <div data-static-style="a541">
      <div data-static-style="a542">
        <div data-static-style="a543">Всего книг:</div>
        <div id="adminBooksCount" data-static-style="a544"></div>
      </div>
      <button data-onclick="openBulkUploadModal()" data-static-style="a545">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/><path d="M12 5v8"/><path d="M8 9l4-4 4 4"/></svg>
        Массовая загрузка
      </button>
      <button data-onclick="reindexAllBooksUI()" data-nonce="${sensitiveNonce()}" title="Переиндексировать текст всех книг для поиска" data-static-style="a546">Индексировать поиск</button>
      <button data-onclick="openAdminLogs()" title="Журнал действий администраторов" data-static-style="a547">Журнал</button>
      <button data-onclick="generateMissingCoversUI()" data-nonce="${sensitiveNonce()}" title="Создать обложки для книг без обложки" data-static-style="a547">Обложки</button>
      <button data-onclick="aiMatchArBooksUI()" data-nonce="${sensitiveNonce()}" title="ИИ подберёт книги к темам AR-схем" data-static-style="a548">Подобрать книги для AR</button>
      <button data-onclick="regenerateAllQuizzesUI()" data-nonce="${sensitiveNonce()}" title="Сбросить и пересоздать тесты всех книг (по 15 вопросов)" data-static-style="a549">Перегенерировать тесты</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Книга</th><th>Автор</th><th>Категория</th><th>Формат</th><th>Рейтинг</th><th>Действия</th></tr></thead>
        <tbody id="adminBooksTableBody"></tbody>
      </table>
    </div>`;
  document.getElementById('adminBooksCount').textContent = String(state.books.length);
  renderAdminBookRows(document.getElementById('adminBooksTableBody'), state.books);
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

  const statusIcon = { pending: '⏸', uploading: '⏳', done: '✓', error: '✕' };
  const statusColor = {
    pending: 'var(--text-muted)',
    uploading: 'var(--accent)',
    done: '#22c55e',
    error: '#ef4444',
  };
  const fragment = document.createDocumentFragment();
  bulkUploadQueue.forEach(item => {
    const row = document.createElement('div');
    row.setAttribute('data-static-style', 'a550');
    const icon = document.createElement('div');
    icon.setAttribute('data-dynamic-style', dynamicStyleToken`width:20px;text-align:center;color:${statusColor[item.status]};font-weight:700;flex-shrink:0;`);
    icon.textContent = statusIcon[item.status] || '';
    const filename = document.createElement('div');
    filename.setAttribute('data-static-style', 'a551');
    filename.title = String(item.file.name);
    filename.textContent = String(item.file.name);
    const message = document.createElement('div');
    message.setAttribute('data-dynamic-style', dynamicStyleToken`color:${statusColor[item.status]};font-size:10px;flex-shrink:0;`);
    message.textContent = String(item.message);
    row.append(icon, filename, message);
    fragment.appendChild(row);
  });
  listEl.replaceChildren(fragment);

  const done = bulkUploadQueue.filter(item => item.status === 'done').length;
  const errors = bulkUploadQueue.filter(item => item.status === 'error').length;
  const progressEl = document.getElementById('bulkUploadProgress');
  if (progressEl) progressEl.textContent = `${done} / ${bulkUploadQueue.length}` + (errors ? ` (ошибок: ${errors})` : '');
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
function renderAdminReviewsTable(container, reviews) {
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const header = document.createElement('tr');
  ['Книга', 'Пользователь', 'Оценка', 'Текст', 'Действия'].forEach(label => {
    const th = document.createElement('th');
    th.textContent = label;
    header.appendChild(th);
  });
  thead.appendChild(header);
  const tbody = document.createElement('tbody');
  reviews.forEach(review => {
    const row = document.createElement('tr');
    appendAdminCell(row, review.bookTitle);
    appendAdminCell(row, review.user);
    const rating = document.createElement('td');
    const ratingCount = Math.max(0, Math.min(5, Number(review.rating) || 0));
    for (let index = 0; index < ratingCount; index += 1) appendTrustedIcon(rating, ICONS.star);
    row.appendChild(rating);
    const reviewText = String(review.text || '');
    appendAdminCell(row, reviewText.substring(0, 50) + (reviewText.length > 50 ? '...' : ''));
    const actions = document.createElement('td');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn-sm danger';
    appendTrustedIcon(remove, ICONS.trash);
    remove.addEventListener('click', () => deleteReviewAndRefresh(review.bookId, review.id));
    actions.appendChild(remove);
    row.appendChild(actions);
    tbody.appendChild(row);
  });
  table.append(thead, tbody);
  wrap.appendChild(table);
  container.replaceChildren(wrap);
}

async function loadAndRenderAdminReviews() {
  const container = document.getElementById('adReviews');
  if (!container) return;
  replaceWithStaticText(container, 'Загрузка отзывов...', 'a449');

  try {
    const books = state.books;
    const allReviews = [];

    for (const book of books) {
      const reviews = await getReviews(book.id);
      reviews.forEach(review => {
        allReviews.push({
          ...review,
          bookId: book.id,
          bookTitle: book.title,
        });
      });
    }

    allReviews.sort((a, b) => new Date(b.date) - new Date(a.date));
    renderAdminReviewsTable(container, allReviews);
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
