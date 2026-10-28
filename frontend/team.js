'use strict';

/* Назначенное чтение отдела.

   Руководитель отдела (роль выдаёт администратор в «Пользователях») видит
   экран «Мой отдел»: назначает книги со сроком и комментарием и смотрит,
   кто из сотрудников их читает. Читатель видит на главной блок
   «Назначено вам». Администратор работает с любым отделом. */

const TEAM_ASSIGNMENTS_CACHE_PREFIX = 'aegis_team_assignments_';
let _teamOverview = null;
let _teamDepartment = null;
let _teamExpanded = new Set();

function isTeamManager(user = state.currentUser) {
  return Boolean(user && (user.role === 'admin' || user.managed_department));
}

function updateTeamEntryPoints() {
  const show = isTeamManager();
  document.getElementById('btnTeamGo')?.classList.toggle('hidden', !show);
  document.getElementById('sidebarTeam')?.classList.toggle('hidden', !show);
  const label = document.querySelector('#btnTeamGo .header-btn-label');
  if (label) label.textContent = 'Мой отдел';
}

// ---------- Общие мелочи ----------

function _teamEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
}

function _teamButton(text, className, onClick, title) {
  const button = _teamEl('button', className, text);
  button.type = 'button';
  if (title) { button.title = title; button.setAttribute('aria-label', title); }
  button.addEventListener('click', onClick);
  return button;
}

function teamFormatDate(value) {
  if (!value) return '';
  const date = new Date(value + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('ru-RU', sameYear
    ? { day: 'numeric', month: 'long' }
    : { day: 'numeric', month: 'long', year: 'numeric' });
}

function teamDaysLeft(value) {
  if (!value) return null;
  const due = new Date(value + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due - today) / 86400000);
}

function teamDueLabel(value, done) {
  if (!value) return { text: 'Без срока', tone: 'neutral' };
  const days = teamDaysLeft(value);
  const date = teamFormatDate(value);
  if (done) return { text: `Срок ${date}`, tone: 'neutral' };
  if (days < 0) return { text: `Просрочено · ${date}`, tone: 'danger' };
  if (days === 0) return { text: 'Срок сегодня', tone: 'warning' };
  if (days <= 3) return { text: `Осталось ${days} дн. · ${date}`, tone: 'warning' };
  return { text: `До ${date}`, tone: 'neutral' };
}

function _teamCover(book) {
  const box = _teamEl('div', 'team-cover');
  if (book.has_cover) {
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.src = api.books.coverUrl(book.id);
    img.addEventListener('error', () => { box.textContent = '📕'; });
    box.appendChild(img);
  } else {
    box.textContent = '📕';
  }
  return box;
}

function _teamTodayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

// ---------- Читатель: «Назначено вам» на главной ----------

function _teamCacheKey() {
  return TEAM_ASSIGNMENTS_CACHE_PREFIX + (state.currentUser?.id || 'anon');
}

function _teamReadCache() {
  try {
    const raw = localStorage.getItem(_teamCacheKey());
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function _teamWriteCache(items) {
  try { localStorage.setItem(_teamCacheKey(), JSON.stringify(items)); } catch (_) { /* не критично */ }
}

async function loadMyAssignments() {
  if (!state.currentUser || !state.currentUser.department) {
    state.myAssignments = [];
    return state.myAssignments;
  }
  if (state.offlineSession) {
    state.myAssignments = _teamReadCache() || [];
    return state.myAssignments;
  }
  try {
    state.myAssignments = await api.library.myAssignments();
    _teamWriteCache(state.myAssignments);
  } catch (_) {
    state.myAssignments = _teamReadCache() || [];
  }
  return state.myAssignments;
}

function _assignmentProgress(item) {
  // Свежий прогресс с устройства важнее ответа сервера: человек мог читать
  // офлайн, а синхронизация ещё не дошла.
  const server = item.my_progress || { status: 'not_started', percent: 0 };
  const local = state.readingProgress?.[item.book.id];
  if (server.status === 'completed' || state.mylist?.[item.book.id] === 'completed') {
    return { status: 'completed', percent: 100 };
  }
  if (local && local.started && local.totalPages > 0) {
    const percent = Math.min(100, Math.round((local.currentPage || 0) * 100 / local.totalPages));
    if (percent >= server.percent) return { status: 'reading', percent };
  }
  return server;
}

function renderAssignedForMe() {
  const section = document.getElementById('sectionAssigned');
  const list = document.getElementById('assignedList');
  if (!section || !list) return;
  const searching = (document.getElementById('searchInput')?.value || '').trim().length > 0;
  const items = (state.myAssignments || []).map(item => ({ ...item, progress: _assignmentProgress(item) }));
  const open = items.filter(item => item.progress.status !== 'completed');
  if (searching || !items.length) {
    section.classList.add('hidden');
    list.replaceChildren();
    return;
  }
  section.classList.remove('hidden');
  const counter = document.getElementById('assignedCounter');
  if (counter) counter.textContent = open.length ? `${items.length - open.length} из ${items.length} прочитано` : 'Всё прочитано 🎉';

  // Сначала незавершённые (просроченные и ближайшие сроки), прочитанные в конце.
  const ordered = [...open, ...items.filter(item => item.progress.status === 'completed')];
  list.replaceChildren(...ordered.map(item => {
    const done = item.progress.status === 'completed';
    const card = _teamEl('button', 'assigned-card' + (done ? ' is-done' : ''));
    card.type = 'button';
    card.addEventListener('click', () => openBookDetail(item.book.id));
    const body = _teamEl('div', 'assigned-card-body');
    body.appendChild(_teamEl('div', 'assigned-card-title', item.book.title));
    body.appendChild(_teamEl('div', 'assigned-card-author', item.book.author));
    const due = teamDueLabel(item.due_date, done);
    const meta = _teamEl('div', 'assigned-card-meta');
    meta.appendChild(_teamEl('span', `team-chip team-chip--${due.tone}`, due.text));
    meta.appendChild(_teamEl('span', 'assigned-card-status',
      done ? '✓ Прочитано' : item.progress.status === 'reading' ? `Читаю · ${item.progress.percent}%` : 'Не начато'));
    body.appendChild(meta);
    const bar = _teamEl('div', 'team-progress');
    const fill = _teamEl('span', 'team-progress-fill ' + (done ? 'is-completed' : 'is-reading'));
    fill.style.width = (done ? 100 : item.progress.percent || 0) + '%';
    bar.appendChild(fill);
    body.appendChild(bar);
    if (item.note) body.appendChild(_teamEl('div', 'assigned-card-note', `«${item.note}»${item.assigned_by ? ' — ' + item.assigned_by : ''}`));
    card.append(_teamCover(item.book), body);
    card.setAttribute('aria-label', `${item.book.title}. ${due.text}. ${done ? 'Прочитано' : 'Не прочитано'}`);
    return card;
  }));
}

let _assignedLoadedAt = 0;
function maybeRefreshAssignedForMe() {
  if (!state.currentUser) return;
  if (Date.now() - _assignedLoadedAt < 60000 && state.myAssignments) { renderAssignedForMe(); return; }
  _assignedLoadedAt = Date.now();
  refreshAssignedForMe();
}

async function refreshAssignedForMe() {
  await loadMyAssignments();
  renderAssignedForMe();
}

// Метка «Назначено отделом» в карточке книги.
function assignmentForBook(bookId) {
  return (state.myAssignments || []).find(item => item.book.id === bookId) || null;
}

// ---------- Руководитель: экран «Мой отдел» ----------

async function renderTeamScreen() {
  const root = document.getElementById('teamContent');
  if (!root) return;
  if (!isTeamManager()) {
    root.replaceChildren(_teamEl('div', 'team-empty', 'Экран доступен руководителям отделов. Роль назначает администратор.'));
    return;
  }
  if (state.offlineSession) {
    root.replaceChildren(_teamEl('div', 'team-empty', 'Нет подключения к интернету. Данные отдела появятся, когда сеть вернётся.'));
    return;
  }
  if (!_teamOverview) root.replaceChildren(_teamEl('div', 'team-empty', 'Загружаем данные отдела…'));
  try {
    _teamOverview = await api.library.teamOverview(_teamDepartment);
    _teamDepartment = _teamOverview.department;
  } catch (err) {
    root.replaceChildren(_teamEl('div', 'team-empty', (err && err.detail) || 'Не удалось загрузить данные отдела'));
    return;
  }
  drawTeamScreen();
}

function _teamDepartmentPicker(overview) {
  const wrap = _teamEl('label', 'team-department-picker');
  wrap.appendChild(_teamEl('span', '', 'Отдел'));
  const select = document.createElement('select');
  const options = new Set([...(overview.departments || []), overview.department].filter(Boolean));
  if (!options.size) options.add('');
  [...options].sort().forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value || '—';
    option.selected = value === overview.department;
    select.appendChild(option);
  });
  select.addEventListener('change', () => {
    _teamDepartment = select.value;
    _teamExpanded = new Set();
    renderTeamScreen();
  });
  wrap.appendChild(select);
  return wrap;
}

function _teamMetric(value, label, tone) {
  const box = _teamEl('div', 'team-metric' + (tone ? ` team-metric--${tone}` : ''));
  box.append(_teamEl('strong', '', value), _teamEl('span', '', label));
  return box;
}

function drawTeamScreen() {
  const root = document.getElementById('teamContent');
  const overview = _teamOverview;
  if (!root || !overview) return;
  const members = overview.members || [];
  const assignments = overview.assignments || [];
  const isAdmin = state.currentUser?.role === 'admin';

  const head = _teamEl('section', 'team-head');
  const titleRow = _teamEl('div', 'team-head-row');
  const titles = _teamEl('div', 'team-head-titles');
  titles.appendChild(_teamEl('div', 'team-kicker', isAdmin ? 'Назначенное чтение' : 'Вы руководитель отдела'));
  titles.appendChild(_teamEl('h2', 'team-title', overview.department ? `Отдел ${overview.department}` : 'Отдел не выбран'));
  titleRow.appendChild(titles);
  if (isAdmin) titleRow.appendChild(_teamDepartmentPicker(overview));
  head.appendChild(titleRow);

  const cells = assignments.length * members.length;
  const completed = assignments.reduce((sum, item) => sum + item.completed, 0);
  const overdue = assignments.filter(item => item.overdue).length;
  const metrics = _teamEl('div', 'team-metrics');
  metrics.append(
    _teamMetric(members.length, 'сотрудников'),
    _teamMetric(assignments.length, 'книг назначено'),
    _teamMetric(cells ? Math.round(completed * 100 / cells) + '%' : '—', 'прочитано'),
    _teamMetric(overdue, 'с просрочкой', overdue ? 'danger' : ''),
  );
  head.appendChild(metrics);
  if (overview.department) {
    head.appendChild(_teamButton('+ Назначить книгу', 'team-primary', () => openAssignBookModal()));
  }

  const booksSection = _teamEl('section', 'team-section');
  booksSection.appendChild(_teamEl('h3', 'team-section-title', 'Книги отдела'));
  if (!assignments.length) {
    booksSection.appendChild(_teamEl('div', 'team-empty',
      'Пока ничего не назначено. Нажмите «Назначить книгу» здесь или на странице книги — сотрудники увидят её на главной со сроком.'));
  } else {
    assignments.forEach(item => booksSection.appendChild(_teamAssignmentCard(item, members, overview.progress?.[item.id] || {})));
  }

  const peopleSection = _teamEl('section', 'team-section');
  peopleSection.appendChild(_teamEl('h3', 'team-section-title', 'Сотрудники'));
  if (!members.length) {
    peopleSection.appendChild(_teamEl('div', 'team-empty',
      `В отделе пока никого нет. Сотрудник попадает сюда, когда в профиле указано подразделение ${overview.department || ''}.`));
  } else {
    const list = _teamEl('div', 'team-members');
    members.forEach(member => list.appendChild(_teamMemberRow(member, assignments.length)));
    peopleSection.appendChild(list);
  }
  peopleSection.appendChild(_teamEl('p', 'team-hint',
    'Вы видите только прогресс по назначенным книгам. Что ещё читают сотрудники и их заметки руководителю не показываются.'));

  root.replaceChildren(head, booksSection, peopleSection);
}

function _teamStackedBar(item, total) {
  const bar = _teamEl('div', 'team-progress');
  if (!total) return bar;
  [['completed', item.completed], ['reading', item.reading]].forEach(([status, count]) => {
    if (!count) return;
    const fill = _teamEl('span', `team-progress-fill is-${status}`);
    fill.style.width = (count * 100 / total) + '%';
    bar.appendChild(fill);
  });
  return bar;
}

function _teamAssignmentCard(item, members, progress) {
  const total = members.length;
  const allDone = total > 0 && item.completed === total;
  const card = _teamEl('article', 'team-card');
  const top = _teamEl('div', 'team-card-top');
  const cover = _teamCover(item.book);
  cover.classList.add('is-clickable');
  cover.addEventListener('click', () => openBookDetail(item.book.id));
  const body = _teamEl('div', 'team-card-body');
  const title = _teamButton(item.book.title, 'team-card-title', () => openBookDetail(item.book.id), 'Открыть книгу');
  body.append(title, _teamEl('div', 'team-card-author', item.book.author));
  const meta = _teamEl('div', 'team-card-meta');
  const due = teamDueLabel(item.due_date, allDone);
  meta.appendChild(_teamEl('span', `team-chip team-chip--${due.tone}`, due.text));
  if (item.assigned_by) meta.appendChild(_teamEl('span', 'team-card-by', `назначил(а) ${item.assigned_by}`));
  body.appendChild(meta);
  if (item.note) body.appendChild(_teamEl('div', 'team-card-note', item.note));
  top.append(cover, body);
  card.appendChild(top);

  const stats = _teamEl('div', 'team-card-stats');
  stats.appendChild(_teamStackedBar(item, total));
  stats.appendChild(_teamEl('div', 'team-card-counts',
    total ? `Прочитали ${item.completed} из ${total} · читают ${item.reading} · не начали ${item.not_started}` : 'В отделе пока нет сотрудников'));
  card.appendChild(stats);

  const actions = _teamEl('div', 'team-card-actions');
  const expanded = _teamExpanded.has(item.id);
  const who = _teamButton(expanded ? 'Скрыть' : 'Кто читает', 'team-secondary', () => {
    if (_teamExpanded.has(item.id)) _teamExpanded.delete(item.id); else _teamExpanded.add(item.id);
    drawTeamScreen();
  });
  who.setAttribute('aria-expanded', String(expanded));
  if (total) actions.appendChild(who);
  actions.appendChild(_teamButton('Изменить', 'team-secondary', () => openAssignBookModal({ assignment: item })));
  actions.appendChild(_teamButton('Снять', 'team-secondary is-danger', () => confirmRemoveAssignment(item)));
  card.appendChild(actions);

  if (expanded && total) {
    const list = _teamEl('ul', 'team-who');
    const order = { completed: 0, reading: 1, not_started: 2 };
    [...members]
      .sort((a, b) => order[(progress[a.id] || {}).status || 'not_started'] - order[(progress[b.id] || {}).status || 'not_started'])
      .forEach(member => {
        const cell = progress[member.id] || { status: 'not_started', percent: 0 };
        const row = _teamEl('li', `team-who-row is-${cell.status}`);
        row.appendChild(_teamEl('span', 'team-who-name', member.name));
        row.appendChild(_teamEl('span', 'team-who-status',
          cell.status === 'completed' ? '✓ Прочитал(а)' : cell.status === 'reading' ? `Читает · ${cell.percent}%` : 'Не начинал(а)'));
        list.appendChild(row);
      });
    card.appendChild(list);
  }
  return card;
}

function _teamMemberRow(member, assignedCount) {
  const row = _teamEl('div', 'team-member');
  const avatar = _teamEl('div', 'team-avatar');
  const url = typeof avatarPresetUrl === 'function' ? avatarPresetUrl(member.avatar_preset) : '';
  if (url) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = url;
    avatar.appendChild(img);
  } else {
    avatar.textContent = (member.name || '?').charAt(0).toUpperCase();
  }
  const body = _teamEl('div', 'team-member-body');
  body.appendChild(_teamEl('div', 'team-member-name', member.name));
  body.appendChild(_teamEl('div', 'team-member-stats', assignedCount
    ? `Прочитано ${member.completed} из ${assignedCount}${member.reading ? ` · читает ${member.reading}` : ''}`
    : 'Книги ещё не назначены'));
  row.append(avatar, body);
  if (member.overdue) row.appendChild(_teamEl('span', 'team-chip team-chip--danger', `Просрочено: ${member.overdue}`));
  else if (assignedCount && member.completed === assignedCount) row.appendChild(_teamEl('span', 'team-chip team-chip--success', 'Всё прочитано'));
  return row;
}

function confirmRemoveAssignment(item) {
  showConfirmModal({
    title: 'Снять назначение?',
    message: `«${item.book.title}» пропадёт из блока «Назначено вам» у сотрудников отдела ${item.department}. Их прогресс чтения сохранится.`,
    confirmText: 'Снять',
    danger: true,
    onConfirm: async () => {
      try {
        await api.library.deleteAssignment(item.id);
        showToast('Назначение снято');
        renderTeamScreen();
      } catch (err) {
        showToast((err && err.detail) || 'Не удалось снять назначение');
      }
    },
  });
}

// ---------- Окно «Назначить книгу» ----------

function _teamBookMatches(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return (state.books || [])
    .filter(book => (book.title || '').toLowerCase().includes(q) || (book.author || '').toLowerCase().includes(q))
    .slice(0, 8);
}

function openAssignBookModal({ bookId = null, assignment = null } = {}) {
  if (!isTeamManager()) return;
  const editing = Boolean(assignment);
  const isAdmin = state.currentUser?.role === 'admin';
  const department = editing
    ? assignment.department
    : (isAdmin ? (_teamDepartment || state.currentUser.managed_department || state.currentUser.department) : state.currentUser.managed_department);
  const { overlay, panel } = createDialogShell('assignBookModal', editing ? 'Изменить назначение' : 'Назначить книгу отделу');
  panel.classList.add('team-dialog');

  let selected = editing ? assignment.book : (bookId ? (state.books || []).find(book => book.id === bookId) : null);
  const form = _teamEl('form', 'team-form');
  form.noValidate = true;

  // Отдел
  let departmentSelect = null;
  if (isAdmin && !editing) {
    const known = new Set([..._teamOverview?.departments || [], department].filter(Boolean));
    const field = _teamEl('label', 'team-field');
    field.appendChild(_teamEl('span', 'team-field-label', 'Отдел'));
    departmentSelect = document.createElement('select');
    departmentSelect.className = 'app-dialog-input';
    if (!known.size) known.add('');
    [...known].sort().forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value || 'Выберите отдел';
      option.selected = value === department;
      departmentSelect.appendChild(option);
    });
    field.appendChild(departmentSelect);
    form.appendChild(field);
  } else {
    form.appendChild(_teamEl('p', 'team-dialog-lead', `Отдел ${department || '—'}: книга появится у сотрудников на главной в блоке «Назначено вам».`));
  }

  // Книга
  const bookField = _teamEl('div', 'team-field');
  bookField.appendChild(_teamEl('span', 'team-field-label', 'Книга'));
  const chosen = _teamEl('div', 'team-chosen-book');
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'app-dialog-input';
  search.placeholder = 'Название или автор';
  search.setAttribute('aria-label', 'Найти книгу');
  const results = _teamEl('div', 'team-book-results');
  results.setAttribute('role', 'listbox');
  const drawChosen = () => {
    if (selected) {
      const change = editing ? null : _teamButton('Другая', 'team-link', () => {
        selected = null; drawChosen(); search.focus();
      });
      chosen.replaceChildren(_teamCover(selected), _teamEl('div', 'team-chosen-text', `${selected.title} — ${selected.author || ''}`));
      if (change) chosen.appendChild(change);
      chosen.classList.remove('hidden');
      search.classList.add('hidden');
      results.replaceChildren();
    } else {
      chosen.classList.add('hidden');
      search.classList.remove('hidden');
    }
  };
  search.addEventListener('input', () => {
    const matches = _teamBookMatches(search.value);
    results.replaceChildren(...matches.map(book => {
      const option = _teamButton('', 'team-book-option', () => { selected = book; drawChosen(); });
      option.setAttribute('role', 'option');
      option.append(_teamEl('span', 'team-book-option-title', book.title), _teamEl('span', 'team-book-option-author', book.author || ''));
      return option;
    }));
    if (search.value.trim().length >= 2 && !matches.length) results.appendChild(_teamEl('div', 'team-hint', 'Ничего не найдено'));
  });
  bookField.append(chosen, search, results);
  form.appendChild(bookField);

  // Срок
  const dueField = _teamEl('label', 'team-field');
  dueField.appendChild(_teamEl('span', 'team-field-label', 'Прочитать до (необязательно)'));
  const due = document.createElement('input');
  due.type = 'date';
  due.className = 'app-dialog-input';
  due.min = _teamTodayIso();
  due.value = editing && assignment.due_date ? assignment.due_date : '';
  dueField.appendChild(due);
  form.appendChild(dueField);

  // Комментарий
  const noteField = _teamEl('label', 'team-field');
  noteField.appendChild(_teamEl('span', 'team-field-label', 'Комментарий для сотрудников (необязательно)'));
  const note = document.createElement('textarea');
  note.className = 'app-dialog-input';
  note.rows = 3;
  note.maxLength = 500;
  note.placeholder = 'Например: главы 1–4 к планёрке';
  note.value = editing && assignment.note ? assignment.note : '';
  noteField.appendChild(note);
  form.appendChild(noteField);

  const error = _teamEl('div', 'team-form-error');
  error.setAttribute('role', 'alert');
  form.appendChild(error);

  const actions = _teamEl('div', 'app-dialog-actions');
  const cancel = createDialogButton('assignCancelBtn', 'Отмена', 'app-dialog-button app-dialog-button--cancel');
  const submit = createDialogButton('assignOkBtn', editing ? 'Сохранить' : 'Назначить', 'app-dialog-button app-dialog-button--confirm');
  submit.type = 'submit';
  actions.append(cancel, submit);
  form.appendChild(actions);
  panel.appendChild(form);

  let keyHandler;
  const close = () => { overlay.remove(); document.removeEventListener('keydown', keyHandler); };
  keyHandler = event => { if (event.key === 'Escape') close(); };
  document.addEventListener('keydown', keyHandler);
  cancel.addEventListener('click', close);
  bindDialogClose(overlay, close);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    error.textContent = '';
    if (!selected) { error.textContent = 'Выберите книгу'; search.focus(); return; }
    if (due.value && due.value < due.min && !(editing && due.value === assignment.due_date)) {
      error.textContent = 'Срок не может быть в прошлом'; due.focus(); return;
    }
    const targetDepartment = departmentSelect ? departmentSelect.value : department;
    if (!targetDepartment) { error.textContent = 'Выберите отдел'; return; }
    submit.disabled = true;
    try {
      if (editing) {
        await api.library.updateAssignment(assignment.id, { due_date: due.value || null, note: note.value.trim() || null });
        showToast('Назначение обновлено');
      } else {
        const payload = { book_id: selected.id, due_date: due.value || null, note: note.value.trim() || null };
        if (isAdmin) payload.department = targetDepartment;
        await api.library.createAssignment(payload);
        _teamDepartment = targetDepartment;
        showToast(`Книга назначена отделу ${targetDepartment}`);
      }
      close();
      if (state.currentScreen === 'team') renderTeamScreen();
      if (targetDepartment === state.currentUser?.department) refreshAssignedForMe();
    } catch (err) {
      submit.disabled = false;
      error.textContent = (err && err.detail && typeof err.detail === 'string') ? err.detail : 'Не удалось сохранить';
    }
  });

  drawChosen();
  (selected ? due : search).focus();
}

// ---------- Администратор: выдать роль руководителя ----------

function buildManagerRoleSelect(user, knownDepartments) {
  const select = document.createElement('select');
  select.className = 'team-role-select';
  select.setAttribute('aria-label', `Роль пользователя ${user.username}`);
  const departments = new Set([...(knownDepartments || []), user.department, user.managed_department].filter(Boolean));
  const add = (value, label) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = (user.managed_department || '') === value;
    select.appendChild(option);
  };
  add('', 'Читатель');
  [...departments].sort().forEach(dep => add(dep, `Руководитель ${dep}`));
  select.addEventListener('change', async () => {
    const value = select.value;
    select.disabled = true;
    try {
      const updated = await api.library.setManagedDepartment(user.id, value || null);
      user.managed_department = updated.managed_department || null;
      showToast(value ? `${user.full_name || user.username} — руководитель ${value}` : 'Роль руководителя снята');
    } catch (err) {
      select.value = user.managed_department || '';
      showToast((err && err.detail) || 'Не удалось изменить роль');
    } finally {
      select.disabled = false;
    }
  });
  return select;
}
