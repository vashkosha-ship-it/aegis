'use strict';

// Назначенное чтение: кто видит «Мой отдел», подписи сроков, блок
// «Назначено вам», окно назначения и выбор роли в админке.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');
const source = read('team.js');
const index = read('index.html');

function setup(user, extra = {}) {
  const dom = new JSDOM(`<!doctype html><body>
    <button id="btnTeamGo" class="hidden"><span class="header-btn-label"></span></button>
    <button id="sidebarTeam" class="hidden"></button>
    <input id="searchInput" value="">
    <div id="sectionAssigned" class="hidden"><span id="assignedCounter"></span><div id="assignedList"></div></div>
    <div id="teamContent"></div>
  </body>`, { runScripts: 'outside-only', url: 'https://aegis.test/' });
  const { window } = dom;
  const calls = [];
  window.state = { currentUser: user, readingProgress: {}, mylist: {}, books: [], ...extra };
  window.api = {
    books: { coverUrl: id => `/api/books/${id}/cover` },
    library: {
      myAssignments: async () => extra.assignments || [],
      teamOverview: async department => { calls.push(['overview', department]); return extra.overview; },
      createAssignment: async payload => { calls.push(['create', payload]); return {}; },
      setManagedDepartment: async (id, department) => { calls.push(['manager', id, department]); return { managed_department: department }; },
      setUserDepartment: async (id, department) => { calls.push(['move', id, department]); return { department }; },
      orgUnits: async () => extra.orgUnits || [],
    },
  };
  window.showToast = message => calls.push(['toast', message]);
  window.openBookDetail = id => calls.push(['open', id]);
  window.showConfirmModal = () => {};
  // 'use strict' в начале файла сделал бы eval локальным — функции не
  // попали бы в window, как в браузере у обычных <script>.
  const asScript = code => code.replace(/^'use strict';/m, '');
  window.eval(asScript(read('dialogs.js')));
  window.eval(asScript(read('org-structure.js')));
  window.eval(asScript(source));
  return { window, calls };
}

const iso = days => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

(async () => {
  // Кому виден вход в «Мой отдел».
  {
    const reader = setup({ id: 1, role: 'reader', department: 'ЦВВ' });
    assert.equal(reader.window.isTeamManager(), false);
    reader.window.updateTeamEntryPoints();
    assert.ok(reader.window.document.getElementById('btnTeamGo').classList.contains('hidden'));

    const boss = setup({ id: 2, role: 'reader', managed_department: 'ЦВВ' });
    boss.window.updateTeamEntryPoints();
    assert.ok(!boss.window.document.getElementById('btnTeamGo').classList.contains('hidden'));
    assert.ok(!boss.window.document.getElementById('sidebarTeam').classList.contains('hidden'));
    assert.equal(setup({ id: 3, role: 'admin' }).window.isTeamManager(), true);
  }

  // Подписи сроков.
  {
    const { window } = setup({ id: 1, role: 'reader' });
    assert.equal(window.teamDueLabel(null).text, 'Без срока');
    assert.equal(window.teamDueLabel(iso(-2)).tone, 'danger');
    assert.match(window.teamDueLabel(iso(-2)).text, /^Просрочено/);
    assert.equal(window.teamDueLabel(iso(0)).text, 'Срок сегодня');
    assert.equal(window.teamDueLabel(iso(2)).tone, 'warning');
    assert.equal(window.teamDueLabel(iso(20)).tone, 'neutral');
    // Прочитанное не «просрочено».
    assert.equal(window.teamDueLabel(iso(-2), true).tone, 'neutral');
  }

  // «Назначено вам»: незавершённые сверху, локальный прогресс учитывается.
  {
    const assignments = [
      { id: 1, department: 'ЦВВ', book: { id: 10, title: 'Готово', author: 'А' }, due_date: null, my_progress: { status: 'completed', percent: 100 } },
      { id: 2, department: 'ЦВВ', book: { id: 11, title: 'Сети', author: 'Б' }, due_date: iso(5), note: 'Главы 1–3', assigned_by: 'Петров', my_progress: { status: 'not_started', percent: 0 } },
    ];
    const { window, calls } = setup({ id: 5, role: 'reader', department: 'ЦВВ' }, {
      assignments,
      readingProgress: { 11: { started: true, currentPage: 30, totalPages: 100 } },
    });
    await window.refreshAssignedForMe();
    const doc = window.document;
    assert.ok(!doc.getElementById('sectionAssigned').classList.contains('hidden'));
    const cards = [...doc.querySelectorAll('.assigned-card')];
    assert.equal(cards.length, 2);
    assert.match(cards[0].textContent, /Сети/);
    assert.match(cards[0].textContent, /Читаю · 30%/);
    assert.match(cards[0].textContent, /Главы 1–3/);
    assert.match(cards[1].textContent, /Прочитано/);
    assert.equal(doc.getElementById('assignedCounter').textContent, '1 из 2 прочитано');
    cards[0].click();
    assert.deepEqual(calls.at(-1), ['open', 11]);
    assert.equal(window.assignmentForBook(11).id, 2);

    // Во время поиска блок прячется.
    doc.getElementById('searchInput').value = 'xss';
    window.renderAssignedForMe();
    assert.ok(doc.getElementById('sectionAssigned').classList.contains('hidden'));
  }

  // Без подразделения назначений нет и блок не показывается.
  {
    const { window } = setup({ id: 6, role: 'reader', department: null }, { assignments: [{}] });
    await window.refreshAssignedForMe();
    assert.deepEqual([...window.state.myAssignments], []);
    assert.ok(window.document.getElementById('sectionAssigned').classList.contains('hidden'));
  }

  // Экран руководителя: сводка, «Кто читает», текст — только через textContent.
  {
    const overview = {
      department: 'ЦВВ', departments: [],
      members: [
        { id: 7, name: '<img src=x onerror=alert(1)>', completed: 1, reading: 0, not_started: 0, overdue: 0 },
        { id: 8, name: 'Мария', completed: 0, reading: 1, not_started: 0, overdue: 1 },
      ],
      assignments: [{
        id: 3, department: 'ЦВВ', book: { id: 12, title: 'Крипто', author: 'В' }, due_date: iso(-1),
        note: null, assigned_by: 'Петров', overdue: true, completed: 1, reading: 1, not_started: 0,
      }],
      progress: { 3: { 7: { status: 'completed', percent: 100 }, 8: { status: 'reading', percent: 40 } } },
    };
    const { window } = setup({ id: 2, role: 'reader', managed_department: 'ЦВВ' }, { overview });
    await window.renderTeamScreen();
    const root = window.document.getElementById('teamContent');
    assert.match(root.textContent, /Отдел ЦВВ/);
    assert.match(root.textContent, /Прочитали 1 из 2/);
    assert.match(root.textContent, /Просрочено: 1/);
    assert.equal(root.querySelector('img[src="x"]'), null, 'имя сотрудника не превращается в разметку');
    const who = [...root.querySelectorAll('button')].find(button => button.textContent === 'Кто читает');
    who.click();
    assert.match(root.textContent, /Мария/);
    assert.match(root.textContent, /Читает · 40%/);
    assert.match(root.textContent, /только прогресс по назначенным книгам/);
  }

  // Обычный читатель экран не видит.
  {
    const { window } = setup({ id: 1, role: 'reader', department: 'ЦВВ' });
    await window.renderTeamScreen();
    assert.match(window.document.getElementById('teamContent').textContent, /руководителям отделов/);
  }

  // Окно назначения: выбор книги поиском, срок и комментарий уходят на сервер.
  {
    const books = [{ id: 21, title: 'Сетевая безопасность', author: 'Иванов' }, { id: 22, title: 'Кулинария', author: 'Х' }];
    const { window, calls } = setup({ id: 2, role: 'reader', managed_department: 'ЦВВ' }, { books, currentScreen: 'home' });
    await window.openAssignBookModal();
    const doc = window.document;
    const modal = doc.getElementById('assignBookModal');
    assert.ok(modal);
    const form = modal.querySelector('form');
    form.dispatchEvent(new window.Event('submit', { cancelable: true }));
    assert.equal(modal.querySelector('.team-form-error').textContent, 'Выберите книгу');
    const search = modal.querySelector('input[type="search"]');
    search.value = 'сетев';
    search.dispatchEvent(new window.Event('input'));
    const options = modal.querySelectorAll('.team-book-option');
    assert.equal(options.length, 1);
    options[0].click();
    modal.querySelector('input[type="date"]').value = iso(7);
    modal.querySelector('textarea').value = '  к планёрке ';
    form.dispatchEvent(new window.Event('submit', { cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    const create = calls.find(call => call[0] === 'create');
    assert.deepEqual({ ...create[1] }, { book_id: 21, due_date: iso(7), note: 'к планёрке', department: 'ЦВВ' });
    assert.equal(doc.getElementById('assignBookModal'), null, 'окно закрывается после сохранения');
  }

  // Админка: выбор роли «Руководитель отдела».
  {
    const { window, calls } = setup({ id: 1, role: 'admin' });
    const user = { id: 9, username: 'petrov', department: 'УЭК', managed_department: null };
    window.state.orgUnits = [
      { id: 1, code: 'УЭК', name: 'Экспертиза', kind: 'directorate', parent_id: null },
      { id: 2, code: 'ОЭ-1', name: null, kind: 'department', parent_id: 1 },
      { id: 3, code: 'ЦВВ', name: null, kind: 'department', parent_id: null },
    ];
    const select = window.buildManagerRoleSelect(user);
    assert.deepEqual([...select.options].map(option => option.textContent),
      ['Читатель', 'Начальник управления УЭК', 'Руководитель отдела ОЭ-1', 'Руководитель отдела ЦВВ']);
    select.value = 'УЭК';
    select.dispatchEvent(new window.Event('change'));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(calls.find(call => call[0] === 'manager'), ['manager', 9, 'УЭК']);
    assert.equal(user.managed_department, 'УЭК');

    // Перевод сотрудника в другое подразделение — тем же выбором из справочника.
    const move = window.buildUserDepartmentSelect(user);
    assert.equal(move.value, 'УЭК');
    assert.deepEqual([...move.querySelectorAll('optgroup')].map(group => group.label), ['Управление УЭК — Экспертиза', 'Самостоятельные отделы']);
    move.value = 'ОЭ-1';
    move.dispatchEvent(new window.Event('change'));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(calls.find(call => call[0] === 'move'), ['move', 9, 'ОЭ-1']);

    // Перевод из списка сотрудников подразделения сообщает, что пора обновить «Структуру».
    let changed = null;
    const move2 = window.buildUserDepartmentSelect(user, { onChanged: who => { changed = who.department; } });
    move2.value = 'ЦВВ';
    move2.dispatchEvent(new window.Event('change'));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(changed, 'ЦВВ');
  }

  // Администратор без выбора видит список подразделений, а не «свой» отдел.
  {
    const overview = {
      department: '', departments: ['УЭК', 'ОЭ-1', 'ЦВВ'], members: [], assignments: [], progress: {},
      units: [
        { code: 'УЭК', name: 'Экспертиза', kind: 'directorate', parent_code: null },
        { code: 'ОЭ-1', name: null, kind: 'department', parent_code: 'УЭК' },
        { code: 'ЦВВ', name: null, kind: 'department', parent_code: null },
      ],
    };
    const { window, calls } = setup({ id: 1, role: 'admin' }, { overview });
    window.updateTeamEntryPoints();
    assert.equal(window.document.querySelector('#btnTeamGo .header-btn-label').textContent, 'Отделы');
    await window.renderTeamScreen();
    const root = window.document.getElementById('teamContent');
    assert.match(root.textContent, /Выберите подразделение/);
    assert.doesNotMatch(root.textContent, /Отдел УЭК/);
    const cards = [...root.querySelectorAll('.team-unit-card')];
    assert.deepEqual(cards.map(card => card.querySelector('.team-unit-code').textContent), ['УЭК', 'ОЭ-1', 'ЦВВ']);
    cards[1].click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(calls.filter(call => call[0] === 'overview').map(call => call[1]), [null, 'ОЭ-1']);
  }

  // Начальник управления: выбор отдела, назначение управления в отделе — без кнопок изменения.
  {
    const overview = {
      department: 'ОЭ-1', department_kind: 'department', parent_code: 'УЭК', departments: ['УЭК', 'ОЭ-1'],
      units: [
        { code: 'УЭК', name: null, kind: 'directorate', parent_code: null },
        { code: 'ОЭ-1', name: null, kind: 'department', parent_code: 'УЭК' },
      ],
      members: [{ id: 5, name: 'Аня', department: 'ОЭ-1', completed: 0, reading: 0, not_started: 1, overdue: 0 }],
      assignments: [{
        id: 7, department: 'УЭК', inherited: true, editable: false, book: { id: 1, title: 'Общая', author: 'А' },
        due_date: null, completed: 0, reading: 0, not_started: 1,
      }],
      progress: { 7: { 5: { status: 'not_started', percent: 0 } } },
    };
    const { window } = setup({ id: 2, role: 'reader', managed_department: 'УЭК' }, { overview });
    await window.renderTeamScreen();
    const root = window.document.getElementById('teamContent');
    assert.match(root.textContent, /Отдел ОЭ-1/);
    assert.match(root.textContent, /входит в управление УЭК/);
    assert.match(root.textContent, /от управления УЭК/);
    assert.ok(root.querySelector('.team-department-picker select'));
    const buttons = [...root.querySelectorAll('.team-card button')].map(button => button.textContent);
    assert.ok(!buttons.includes('Снять') && !buttons.includes('Изменить'));
  }

  // Светлая тема и подпись логотипа.
  const light = read('css/components/theme-light.css');
  assert.match(light, /:root\[data-theme="light"\] \{ --on-accent: #ffffff; \}/);
  assert.match(read('desktop-stability.css'), /theme-light\.css/);
  assert.ok(read('sw.js').includes("'/css/components/theme-light.css'"));
  assert.match(index, /class="sidebar-logo-tagline brand-tagline">Центр знаний по кибербезопасности</);
  assert.match(index, /class="home-logo-tagline brand-tagline">Центр знаний по кибербезопасности</);
  assert.match(source, /setAttribute\('data-title', text\)/);

  // Подключение.
  assert.match(index, /<script defer src="team\.js"><\/script>/);
  assert.match(index, /id="teamScreen"/);
  assert.match(index, /id="btnTeamGo"[^>]*data-onclick="navigateTo\('team'\)"/);
  assert.match(index, /id="sectionAssigned"/);
  assert.ok(read('sw.js').includes("'/team.js'"));
  assert.match(read('navigation.js'), /team: 'teamScreen'/);
  assert.match(read('library-home.js'), /openAssignBookModal\(\{ bookId: book\.id \}\)/);
  assert.match(read('admin-screens.js'), /buildManagerRoleSelect\(user\)/);
  assert.match(read('admin-screens.js'), /buildUserDepartmentSelect\(user\)/);
  assert.match(index, /data-atab="org">Структура</);
  assert.ok(read('sw.js').includes("'/org-structure.js'"));
  // Создание пользователя и «Структура»: подразделение — выбором, у подразделения — список сотрудников.
  assert.match(read('admin-users.js'), /<select id="cuDepartment"/);
  assert.match(read('org-structure.js'), /async function toggleOrgPeople/);

  console.log('team assignments tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
