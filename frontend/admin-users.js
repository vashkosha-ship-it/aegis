// Administrative user lifecycle, approvals, exports and audit log.

async function openAdminLogs() {
  const ex = document.getElementById('adminLogsModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'adminLogsModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  replaceAdminStaticMarkup(m, `<div data-static-style="a125">
    <div data-static-style="a126">
      <h3 data-static-style="a127">Журнал действий</h3>
      <button data-onclick="closeModal('adminLogsModal')" data-static-style="a128">✕</button>
    </div>
    <div id="adminLogsBody" data-static-style="a129">Загрузка…</div>
  </div>`);
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
  replaceAdminStaticMarkup(modal, `
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
    </div>`);

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
  replaceAdminStaticMarkup(modal, `
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
    </div>`);

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
  replaceAdminStaticMarkup(modal, `
    <div data-static-style="a185">
      <div data-static-style="a126">
        <h3 data-static-style="a145">Заявки на регистрацию</h3>
        <button data-onclick="closeModal('pendingUsersModal')" data-static-style="a186">✕</button>
      </div>
      <div id="pendingUsersList" data-static-style="a187">Загрузка…</div>
    </div>`);

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
