'use strict';

/* Структура подразделений: управления и отделы.

   * Выпадающие списки «Подразделение» (регистрация, профиль, админка)
     заполняются из справочника: управления с их отделами, затем
     самостоятельные отделы.
   * Вкладка «Структура» в админ-панели: создать, переименовать, перенести и
     удалить управление или отдел. */

const ORG_CACHE_KEY = 'aegis_org_units';
const ORG_KIND_LABEL = { directorate: 'Управление', department: 'Отдел' };

function _orgReadCache() {
  try {
    const raw = localStorage.getItem(ORG_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

async function loadOrgUnits({ force = false } = {}) {
  if (!force && Array.isArray(state.orgUnits) && state.orgUnits.length) return state.orgUnits;
  try {
    const units = await api.library.orgUnits();
    state.orgUnits = Array.isArray(units) ? units : [];
    try { localStorage.setItem(ORG_CACHE_KEY, JSON.stringify(state.orgUnits)); } catch (_) { /* не критично */ }
  } catch (_) {
    state.orgUnits = _orgReadCache() || state.orgUnits || [];
  }
  return state.orgUnits;
}

function orgUnitByCode(code) {
  return (state.orgUnits || []).find(unit => unit.code === code) || null;
}

function orgUnitLabel(code, { withKind = false } = {}) {
  const unit = orgUnitByCode(code);
  if (!unit) return code || '';
  const kind = withKind ? `${ORG_KIND_LABEL[unit.kind] || 'Отдел'} ` : '';
  return unit.name ? `${kind}${unit.code} — ${unit.name}` : `${kind}${unit.code}`;
}

// Группы для <select>: управление (само и его отделы), потом самостоятельные.
function orgGroups(units = state.orgUnits || []) {
  const byId = new Map(units.map(unit => [unit.id, unit]));
  const groups = [];
  const standalone = [];
  units.forEach(unit => {
    if (unit.parent_id && byId.has(unit.parent_id)) return;
    if (unit.kind === 'directorate') {
      groups.push({ unit, children: units.filter(child => child.parent_id === unit.id) });
    } else {
      standalone.push(unit);
    }
  });
  return { groups, standalone };
}

function _orgOption(value, label, selected) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  if (selected) option.selected = true;
  return option;
}

/* Заполнить <select> подразделениями. `allow` — ограничить списком кодов
   (руководитель видит только свои). Текущее значение, которого нет в
   справочнике (старые данные), остаётся выбранным отдельной строкой. */
function fillOrgSelect(select, { value = '', placeholder = '— Выберите подразделение —', allow = null, units = null } = {}) {
  if (!select) return;
  const list = units || state.orgUnits || [];
  const allowed = allow ? new Set(allow) : null;
  const ok = code => !allowed || allowed.has(code);
  const { groups, standalone } = orgGroups(list);
  const nodes = [];
  if (placeholder !== null) nodes.push(_orgOption('', placeholder, !value));
  groups.forEach(({ unit, children }) => {
    const visibleChildren = children.filter(child => ok(child.code));
    if (!ok(unit.code) && !visibleChildren.length) return;
    const group = document.createElement('optgroup');
    group.label = `Управление ${unit.code}${unit.name ? ' — ' + unit.name : ''}`;
    if (ok(unit.code)) group.appendChild(_orgOption(unit.code, `${unit.code} (всё управление)`, value === unit.code));
    visibleChildren.forEach(child => {
      group.appendChild(_orgOption(child.code, child.name ? `${child.code} — ${child.name}` : child.code, value === child.code));
    });
    nodes.push(group);
  });
  const visibleStandalone = standalone.filter(unit => ok(unit.code));
  if (visibleStandalone.length) {
    const group = document.createElement('optgroup');
    group.label = groups.length ? 'Самостоятельные отделы' : 'Отделы';
    visibleStandalone.forEach(unit => {
      group.appendChild(_orgOption(unit.code, unit.name ? `${unit.code} — ${unit.name}` : unit.code, value === unit.code));
    });
    nodes.push(group);
  }
  const known = new Set(list.map(unit => unit.code));
  if (value && !known.has(value) && ok(value)) nodes.push(_orgOption(value, `${value} (нет в справочнике)`, true));
  select.replaceChildren(...nodes);
  select.value = value || '';
}

// Форма регистрации: подразделение только из справочника.
async function initRegistrationDepartments() {
  const select = document.getElementById('authDepartment');
  if (!select) return;
  const units = await loadOrgUnits();
  if (!units.length) return; // нет связи — остаётся список из разметки
  fillOrgSelect(select, { value: '', placeholder: '— Выберите —' });
  document.getElementById('authDepartmentOther')?.classList.add('hidden');
}

// ---------- Админка: вкладка «Структура» ----------

function _orgEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
}

function _orgButton(text, className, onClick) {
  const button = _orgEl('button', className, text);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

async function renderAdminOrg() {
  const container = document.getElementById('adOrg');
  if (!container) return;
  container.replaceChildren(_orgEl('div', 'org-empty', 'Загрузка…'));
  let units;
  try {
    units = await api.library.adminOrgUnits();
  } catch (err) {
    container.replaceChildren(_orgEl('div', 'org-empty', (err && err.detail) || 'Не удалось загрузить структуру'));
    return;
  }
  state.orgUnits = units.map(({ id, code, name, kind, parent_id }) => ({ id, code, name, kind, parent_id }));

  const toolbar = _orgEl('div', 'org-toolbar');
  toolbar.append(
    _orgButton('+ Управление', 'org-primary', () => openOrgUnitModal({ kind: 'directorate' })),
    _orgButton('+ Отдел', 'org-secondary', () => openOrgUnitModal({ kind: 'department' })),
  );
  const hint = _orgEl('p', 'org-hint',
    'Отдел может входить в управление или быть самостоятельным. Начальник управления видит все его отделы и может назначать книги как всему управлению, так и отдельному отделу. Руководителей назначают на вкладке «Пользователи», в колонке «Роль».');

  const { groups, standalone } = orgGroups(units);
  const sections = [];
  groups.forEach(({ unit, children }) => {
    const block = _orgEl('section', 'org-directorate');
    block.appendChild(_orgUnitRow(unit, units));
    const list = _orgEl('div', 'org-children');
    if (children.length) children.forEach(child => list.appendChild(_orgUnitRow(child, units)));
    else list.appendChild(_orgEl('div', 'org-empty org-empty--small', 'В управлении пока нет отделов'));
    list.appendChild(_orgButton(`+ Отдел в ${unit.code}`, 'org-link', () => openOrgUnitModal({ kind: 'department', parentId: unit.id })));
    block.appendChild(list);
    sections.push(block);
  });
  if (standalone.length) {
    const block = _orgEl('section', 'org-standalone');
    block.appendChild(_orgEl('h4', 'org-group-title', groups.length ? 'Самостоятельные отделы' : 'Отделы'));
    standalone.forEach(unit => block.appendChild(_orgUnitRow(unit, units)));
    sections.push(block);
  }
  if (!sections.length) sections.push(_orgEl('div', 'org-empty', 'Подразделений пока нет. Создайте управление или отдел.'));
  container.replaceChildren(toolbar, hint, ...sections);
}

function _orgUnitRow(unit, units) {
  const row = _orgEl('div', `org-unit org-unit--${unit.kind}`);
  const body = _orgEl('div', 'org-unit-body');
  const title = _orgEl('div', 'org-unit-title');
  title.append(
    _orgEl('span', `org-kind org-kind--${unit.kind}`, ORG_KIND_LABEL[unit.kind] || 'Отдел'),
    _orgEl('strong', 'org-code', unit.code),
  );
  if (unit.name) title.appendChild(_orgEl('span', 'org-name', unit.name));
  body.appendChild(title);
  const facts = [];
  facts.push(`сотрудников: ${unit.members || 0}`);
  if (unit.kind === 'directorate') {
    const childCodes = units.filter(child => child.parent_id === unit.id);
    const inside = childCodes.reduce((sum, child) => sum + (child.members || 0), 0);
    if (childCodes.length) facts.push(`в отделах: ${inside}`);
  }
  facts.push(`назначено книг: ${unit.assignments || 0}`);
  const managers = (unit.managers || []).map(manager => manager.name).join(', ');
  facts.push(unit.kind === 'directorate'
    ? `начальник: ${managers || 'не назначен'}`
    : `руководитель: ${managers || 'не назначен'}`);
  body.appendChild(_orgEl('div', 'org-unit-facts', facts.join(' · ')));
  const actions = _orgEl('div', 'org-unit-actions');
  actions.append(
    _orgButton('Изменить', 'org-secondary', () => openOrgUnitModal({ unit })),
    _orgButton('Удалить', 'org-secondary is-danger', () => confirmDeleteOrgUnit(unit)),
  );
  row.append(body, actions);
  return row;
}

function confirmDeleteOrgUnit(unit) {
  showConfirmModal({
    title: `Удалить ${(ORG_KIND_LABEL[unit.kind] || 'подразделение').toLowerCase()} ${unit.code}?`,
    message: 'Назначенные ему книги снимутся, руководитель потеряет роль. Подразделение с сотрудниками или отделами удалить нельзя — сначала переведите их.',
    confirmText: 'Удалить',
    danger: true,
    onConfirm: async () => {
      try {
        await api.library.deleteOrgUnit(unit.id);
        showToast(`${unit.code} удалено`);
        renderAdminOrg();
      } catch (err) {
        showToast((err && err.detail) || 'Не удалось удалить');
      }
    },
  });
}

function openOrgUnitModal({ unit = null, kind = 'department', parentId = null } = {}) {
  const editing = Boolean(unit);
  const currentKind = editing ? unit.kind : kind;
  const { overlay, panel } = createDialogShell('orgUnitModal', editing
    ? `Изменить: ${unit.code}`
    : (currentKind === 'directorate' ? 'Новое управление' : 'Новый отдел'));
  panel.classList.add('org-dialog');
  const form = _orgEl('form', 'org-form');
  form.noValidate = true;

  const field = (label, input) => {
    const wrap = _orgEl('label', 'org-field');
    wrap.append(_orgEl('span', 'org-field-label', label), input);
    form.appendChild(wrap);
    return input;
  };

  const code = document.createElement('input');
  code.className = 'app-dialog-input';
  code.maxLength = 64;
  code.placeholder = 'Например, УЭК';
  code.value = editing ? unit.code : '';
  field('Код (короткое название)', code);

  const name = document.createElement('input');
  name.className = 'app-dialog-input';
  name.maxLength = 200;
  name.placeholder = 'Полное название (необязательно)';
  name.value = editing && unit.name ? unit.name : '';
  field('Полное название', name);

  const kindSelect = document.createElement('select');
  kindSelect.className = 'app-dialog-input';
  kindSelect.append(_orgOption('department', 'Отдел', currentKind === 'department'), _orgOption('directorate', 'Управление', currentKind === 'directorate'));
  field('Тип', kindSelect);

  const parent = document.createElement('select');
  parent.className = 'app-dialog-input';
  const parentField = field('Входит в управление', parent);
  const directorates = (state.orgUnits || []).filter(item => item.kind === 'directorate' && (!unit || item.id !== unit.id));
  parent.append(_orgOption('', '— Самостоятельный отдел —', !(editing ? unit.parent_id : parentId)));
  directorates.forEach(item => parent.appendChild(_orgOption(String(item.id), item.name ? `${item.code} — ${item.name}` : item.code, String(editing ? unit.parent_id : parentId) === String(item.id))));
  const syncParent = () => {
    const isDirectorate = kindSelect.value === 'directorate';
    parentField.closest('.org-field').classList.toggle('hidden', isDirectorate);
    if (isDirectorate) parent.value = '';
  };
  kindSelect.addEventListener('change', syncParent);
  syncParent();

  if (editing) {
    form.appendChild(_orgEl('p', 'org-hint', 'Если сменить код, он поменяется у всех сотрудников, руководителей и назначений этого подразделения.'));
  }
  const error = _orgEl('div', 'org-form-error');
  error.setAttribute('role', 'alert');
  form.appendChild(error);

  const actions = _orgEl('div', 'app-dialog-actions');
  const cancel = createDialogButton('orgCancelBtn', 'Отмена', 'app-dialog-button app-dialog-button--cancel');
  const save = createDialogButton('orgSaveBtn', editing ? 'Сохранить' : 'Создать', 'app-dialog-button app-dialog-button--confirm');
  save.type = 'submit';
  actions.append(cancel, save);
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
    const payload = {
      code: code.value.trim(),
      name: name.value.trim() || null,
      kind: kindSelect.value,
      parent_id: kindSelect.value === 'directorate' || !parent.value ? null : Number(parent.value),
    };
    if (!payload.code) { error.textContent = 'Укажите код'; code.focus(); return; }
    save.disabled = true;
    try {
      if (editing) await api.library.updateOrgUnit(unit.id, payload);
      else await api.library.createOrgUnit(payload);
      close();
      showToast(editing ? 'Сохранено' : `${payload.kind === 'directorate' ? 'Управление' : 'Отдел'} ${payload.code} создан${payload.kind === 'directorate' ? 'о' : ''}`);
      await loadOrgUnits({ force: true });
      renderAdminOrg();
    } catch (err) {
      save.disabled = false;
      const detail = err && err.detail;
      error.textContent = typeof detail === 'string' ? detail : 'Не удалось сохранить';
    }
  });
  code.focus();
}
