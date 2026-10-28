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

function teamEntryLabel(user = state.currentUser) {
  if (!user) return 'Мой отдел';
  if (user.role === 'admin') return 'Отделы';
  const unit = typeof orgUnitByCode === 'function' ? orgUnitByCode(user.managed_department) : null;
  return unit && unit.kind === 'directorate' ? 'Моё управление' : 'Мой отдел';
}

function updateTeamEntryPoints() {
  const show = isTeamManager();
  document.getElementById('btnTeamGo')?.classList.toggle('hidden', !show);
  document.getElementById('sidebarTeam')?.classList.toggle('hidden', !show);
  if (!show) return;
  const apply = () => {
    const text = teamEntryLabel();
    const headerLabel = document.querySelector('#btnTeamGo .header-btn-label');
    if (headerLabel) headerLabel.textContent = text;
    const sideLabel = document.querySelector('#sidebarTeam .item-label');
    if (sideLabel) sideLabel.textContent = text;
    document.getElementById('btnTeamGo')?.setAttribute('aria-label', text);
    const title = document.querySelector('#teamScreen .logo-name');
    if (title) title.textContent = text;
  };
  apply();
  if (typeof loadOrgUnits === 'function' && state.currentUser?.managed_department) loadOrgUnits().then(apply);
}

const TEAM_KIND_LABEL = { directorate: 'Управление', department: 'Отдел' };

// Подразделения из ответа сервера — в виде справочника для fillOrgSelect.
function _teamUnitsAsOrg(overview) {
  return (overview?.units || []).map(unit => ({
    id: unit.code, code: unit.code, name: unit.name, kind: unit.kind, parent_id: unit.parent_code,
  }));
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
  updateTeamEntryPoints();
  if (!isTeamManager()) {
    root.replaceChildren(_teamEl('div', 'team-empty', 'Экран доступен руководителям отделов. Роль назначает администратор.'));
    return;
  }
  if (state.offlineSession) {
    root.replaceChildren(_teamEl('div', 'team-empty', 'Нет подключения к интернету. Данные отдела появятся, когда сеть вернётся.'));
    return;
  }
  if (!_teamOverview) root.replaceChildren(_teamEl('div', 'team-empty', 'Загружаем данные…'));
  try {
    _teamOverview = await api.library.teamOverview(_teamDepartment || null);
    _teamDepartment = _teamOverview.department;
  } catch (err) {
    if (err && (err.status === 403 || err.status === 404) && _teamDepartment) {
      // Подразделение удалили или роль сменилась — начинаем с выбора заново.
      _teamDepartment = null;
      return renderTeamScreen();
    }
    root.replaceChildren(_teamEl('div', 'team-empty', (err && err.detail) || 'Не удалось загрузить данные'));
    return;
  }
  drawTeamScreen();
}

function _teamDepartmentPicker(overview) {
  const wrap = _teamEl('label', 'team-department-picker');
  wrap.appendChild(_teamEl('span', '', 'Подразделение'));
  const select = document.createElement('select');
  const isAdmin = state.currentUser?.role === 'admin';
  fillOrgSelect(select, {
    value: overview.department || '',
    placeholder: isAdmin ? '— Выберите подразделение —' : null,
    units: _teamUnitsAsOrg(overview),
  });
  // Коды из старых данных, которых нет в справочнике.
  const listed = new Set(_teamUnitsAsOrg(overview).map(unit => unit.code));
  (overview.departments || []).filter(code => !listed.has(code)).forEach(code => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = `${code} (нет в справочнике)`;
    select.appendChild(option);
  });
  select.value = overview.department || '';
  select.addEventListener('change', () => {
    _teamDepartment = select.value || null;
    _teamExpanded = new Set();
    renderTeamScreen();
  });
  wrap.appendChild(select);
  return wrap;
}

function _teamChooser(overview) {
  const section = _teamEl('section', 'team-section');
  section.appendChild(_teamEl('h3', 'team-section-title', 'Подразделения'));
  const units = _teamUnitsAsOrg(overview);
  if (!units.length) {
    section.appendChild(_teamEl('div', 'team-empty', 'Подразделений пока нет. Создайте их в админ-панели на вкладке «Структура».'));
    return section;
  }
  const card = unit => {
    const button = _teamButton('', `team-unit-card${unit.parent_id ? ' is-child' : ''}`, () => {
      _teamDepartment = unit.code;
      renderTeamScreen();
    });
    button.append(
      _teamEl('span', 'team-unit-kind', TEAM_KIND_LABEL[unit.kind] || 'Отдел'),
      _teamEl('strong', 'team-unit-code', unit.code),
    );
    if (unit.name) button.appendChild(_teamEl('span', 'team-unit-name', unit.name));
    return button;
  };
  const { groups, standalone } = orgGroups(units);
  groups.forEach(({ unit, children }) => {
    section.appendChild(_teamEl('h4', 'team-unit-group', `Управление ${unit.code}`));
    const grid = _teamEl('div', 'team-unit-grid');
    [unit, ...children].forEach(item => grid.appendChild(card(item)));
    section.appendChild(grid);
  });
  const grid = _teamEl('div', 'team-unit-grid');
  if (standalone.length) {
    if (groups.length) section.appendChild(_teamEl('h4', 'team-unit-group', 'Самостоятельные отделы'));
    standalone.forEach(item => grid.appendChild(card(item)));
  }
  section.appendChild(grid);
  return section;
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
  const isDirectorate = overview.department_kind === 'directorate';
  const kindLabel = TEAM_KIND_LABEL[overview.department_kind] || 'Отдел';

  const head = _teamEl('section', 'team-head');
  const titleRow = _teamEl('div', 'team-head-row');
  const titles = _teamEl('div', 'team-head-titles');
  let kicker = 'Администратор · назначенное чтение';
  if (!isAdmin) {
    const own = state.currentUser?.managed_department;
    if (overview.department === own) kicker = isDirectorate ? 'Вы начальник управления' : 'Вы руководитель отдела';
    else kicker = `Управление ${own} · отдел`;
  }
  titles.appendChild(_teamEl('div', 'team-kicker', kicker));
  titles.appendChild(_teamEl('h2', 'team-title', overview.department ? `${kindLabel} ${overview.department}` : 'Выберите подразделение'));
  const subtitle = [overview.department_name, overview.parent_code ? `входит в управление ${overview.parent_code}` : '']
    .filter(Boolean).join(' · ');
  if (subtitle) titles.appendChild(_teamEl('div', 'team-subtitle', subtitle));
  titleRow.appendChild(titles);
  if (isAdmin || (overview.departments || []).length > 1) titleRow.appendChild(_teamDepartmentPicker(overview));
  head.appendChild(titleRow);

  if (!overview.department) {
    head.appendChild(_teamEl('p', 'team-hint',
      'Выберите управление или отдел, чтобы назначить книги и посмотреть прогресс сотрудников.'));
    root.replaceChildren(head, _teamChooser(overview));
    return;
  }

  const cells = assignments.reduce((sum, item) => sum + _teamAudience(item, members), 0);
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
  booksSection.appendChild(_teamEl('h3', 'team-section-title', isDirectorate ? 'Книги управления' : 'Книги отдела'));
  if (!assignments.length) {
    booksSection.appendChild(_teamEl('div', 'team-empty',
      'Пока ничего не назначено. Нажмите «Назначить книгу» здесь или на странице книги — сотрудники увидят её на главной со сроком.'));
  } else {
    assignments.forEach(item => booksSection.appendChild(_teamAssignmentCard(item, members, overview.progress?.[item.id] || {})));
  }

  const peopleSection = _teamEl('section', 'team-section');
  peopleSection.appendChild(_teamEl('h3', 'team-section-title', 'Сотрудники'));
  if (!members.length) {
    peopleSection.appendChild(_teamEl('div', 'team-empty', isDirectorate
      ? `В управлении пока никого нет. Сюда попадают сотрудники управления ${overview.department} и всех его отделов.`
      : `В отделе пока никого нет. Сотрудник попадает сюда, когда в профиле указано подразделение ${overview.department}.`));
  } else {
    const list = _teamEl('div', 'team-members');
    members.forEach(member => list.appendChild(_teamMemberRow(member, assignments.length, overview.department)));
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

function _teamAudience(item, members) {
  return typeof item.audience === 'number' ? item.audience : members.length;
}

function _teamAssignmentCard(item, members, progress) {
  const total = _teamAudience(item, members);
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
  if (item.inherited) meta.appendChild(_teamEl('span', 'team-chip team-chip--info', `от управления ${item.department}`));
  else if (_teamOverview && item.department !== _teamOverview.department) {
    meta.appendChild(_teamEl('span', 'team-chip team-chip--info', `отдел ${item.department}`));
  }
  if (item.assigned_by) meta.appendChild(_teamEl('span', 'team-card-by', `назначил(а) ${item.assigned_by}`));
  body.appendChild(meta);
  if (item.note) body.appendChild(_teamEl('div', 'team-card-note', item.note));
  top.append(cover, body);
  card.appendChild(top);

  const stats = _teamEl('div', 'team-card-stats');
  stats.appendChild(_teamStackedBar(item, total));
  stats.appendChild(_teamEl('div', 'team-card-counts',
    total ? `Прочитали ${item.completed} из ${total} · читают ${item.reading} · не начали ${item.not_started}` : 'Пока нет сотрудников, которым это назначено'));
  card.appendChild(stats);

  const actions = _teamEl('div', 'team-card-actions');
  const expanded = _teamExpanded.has(item.id);
  const who = _teamButton(expanded ? 'Скрыть' : 'Кто читает', 'team-secondary', () => {
    if (_teamExpanded.has(item.id)) _teamExpanded.delete(item.id); else _teamExpanded.add(item.id);
    drawTeamScreen();
  });
  who.setAttribute('aria-expanded', String(expanded));
  if (total) actions.appendChild(who);
  if (item.editable !== false) {
    actions.appendChild(_teamButton('Изменить', 'team-secondary', () => openAssignBookModal({ assignment: item })));
    actions.appendChild(_teamButton('Снять', 'team-secondary is-danger', () => confirmRemoveAssignment(item)));
  }
  card.appendChild(actions);

  if (expanded && total) {
    const list = _teamEl('ul', 'team-who');
    const order = { completed: 0, reading: 1, not_started: 2 };
    members.filter(member => progress[member.id])
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

function _teamMemberRow(member, assignedCount, viewedDepartment) {
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
  if (member.department && member.department !== viewedDepartment) {
    body.appendChild(_teamEl('div', 'team-member-dept', `отдел ${member.department}`));
  }
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
    message: `«${item.book.title}» пропадёт из блока «Назначено вам» у сотрудников подразделения ${item.department}. Их прогресс чтения сохранится.`,
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

async function openAssignBookModal({ bookId = null, assignment = null } = {}) {
  if (!isTeamManager()) return;
  const editing = Boolean(assignment);
  // Со страницы книги экран отдела мог ещё не открываться — узнаём, какими
  // подразделениями пользователь управляет.
  if (!editing && !_teamOverview) {
    try { _teamOverview = await api.library.teamOverview(_teamDepartment || null); } catch (_) { /* ниже покажем, что есть */ }
  }
  const choices = _teamOverview?.departments || [];
  const department = editing
    ? assignment.department
    : (_teamDepartment || _teamOverview?.department || (choices.length === 1 ? choices[0] : '') || state.currentUser.managed_department || '');
  const { overlay, panel } = createDialogShell('assignBookModal', editing ? 'Изменить назначение' : 'Назначить книгу');
  panel.classList.add('team-dialog');

  let selected = editing ? assignment.book : (bookId ? (state.books || []).find(book => book.id === bookId) : null);
  const form = _teamEl('form', 'team-form');
  form.noValidate = true;

  // Подразделение: выбор, если их несколько (администратор, начальник управления).
  let departmentSelect = null;
  if (!editing && choices.length > 1) {
    const field = _teamEl('label', 'team-field');
    field.appendChild(_teamEl('span', 'team-field-label', 'Кому назначить'));
    departmentSelect = document.createElement('select');
    departmentSelect.className = 'app-dialog-input';
    fillOrgSelect(departmentSelect, {
      value: department,
      placeholder: department ? null : '— Выберите подразделение —',
      units: _teamUnitsAsOrg(_teamOverview),
    });
    field.appendChild(departmentSelect);
    field.appendChild(_teamEl('span', 'team-hint', 'Назначение управлению получают сотрудники всех его отделов.'));
    form.appendChild(field);
  } else {
    const unit = (_teamOverview?.units || []).find(item => item.code === department);
    const label = `${TEAM_KIND_LABEL[unit?.kind] || 'Подразделение'} ${department || '—'}`;
    form.appendChild(_teamEl('p', 'team-dialog-lead', `${label}: книга появится у сотрудников на главной в блоке «Назначено вам».`));
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
    if (!targetDepartment) { error.textContent = 'Выберите подразделение'; return; }
    submit.disabled = true;
    try {
      if (editing) {
        await api.library.updateAssignment(assignment.id, { due_date: due.value || null, note: note.value.trim() || null });
        showToast('Назначение обновлено');
      } else {
        const payload = {
          book_id: selected.id, due_date: due.value || null, note: note.value.trim() || null, department: targetDepartment,
        };
        await api.library.createAssignment(payload);
        _teamDepartment = targetDepartment;
        showToast(`Книга назначена: ${targetDepartment}`);
      }
      close();
      if (state.currentScreen === 'team') renderTeamScreen();
      refreshAssignedForMe();
    } catch (err) {
      submit.disabled = false;
      error.textContent = (err && err.detail && typeof err.detail === 'string') ? err.detail : 'Не удалось сохранить';
    }
  });

  drawChosen();
  (selected ? due : search).focus();
}

// ---------- Администратор: подразделение и роль сотрудника ----------

function buildUserDepartmentSelect(user, { onChanged = null } = {}) {
  const select = document.createElement('select');
  select.className = 'team-role-select';
  select.setAttribute('aria-label', `Подразделение пользователя ${user.username}`);
  fillOrgSelect(select, { value: user.department || '', placeholder: '—' });
  select.addEventListener('change', async () => {
    const value = select.value;
    select.disabled = true;
    try {
      const updated = await api.library.setUserDepartment(user.id, value || null);
      user.department = updated.department || null;
      showToast(value ? `${user.full_name || user.username} → ${value}` : 'Подразделение убрано');
      if (typeof onChanged === 'function') onChanged(user);
    } catch (err) {
      select.value = user.department || '';
      showToast((err && err.detail) || 'Не удалось перевести');
    } finally {
      select.disabled = false;
    }
  });
  return select;
}

function buildManagerRoleSelect(user) {
  const select = document.createElement('select');
  select.className = 'team-role-select';
  select.setAttribute('aria-label', `Роль пользователя ${user.username}`);
  const current = user.managed_department || '';
  const add = (parent, value, label) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = current === value;
    parent.appendChild(option);
  };
  add(select, '', 'Читатель');
  const { groups, standalone } = orgGroups();
  groups.forEach(({ unit, children }) => {
    const group = document.createElement('optgroup');
    group.label = `Управление ${unit.code}`;
    add(group, unit.code, `Начальник управления ${unit.code}`);
    children.forEach(child => add(group, child.code, `Руководитель отдела ${child.code}`));
    select.appendChild(group);
  });
  if (standalone.length) {
    const group = document.createElement('optgroup');
    group.label = groups.length ? 'Самостоятельные отделы' : 'Отделы';
    standalone.forEach(unit => add(group, unit.code, `Руководитель отдела ${unit.code}`));
    select.appendChild(group);
  }
  if (current && !orgUnitByCode(current)) add(select, current, `Руководитель ${current}`);
  select.value = current;
  select.addEventListener('change', async () => {
    const value = select.value;
    select.disabled = true;
    try {
      const updated = await api.library.setManagedDepartment(user.id, value || null);
      user.managed_department = updated.managed_department || null;
      const label = select.selectedOptions[0]?.textContent || value;
      showToast(value ? `${user.full_name || user.username}: ${label.toLowerCase()}` : 'Роль руководителя снята');
    } catch (err) {
      select.value = user.managed_department || '';
      showToast((err && err.detail) || 'Не удалось изменить роль');
    } finally {
      select.disabled = false;
    }
  });
  return select;
}
