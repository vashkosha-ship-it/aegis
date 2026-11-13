'use strict';

// Админка → «Активность»: список пользователей и хронология сеансов.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const dom = new JSDOM('<div id="adActivity"></div>');
const opened = [];
const context = {
  window: dom.window, document: dom.window.document, console, Date,
  state: { books: [{ id: 7, title: 'Сети' }] },
  openBookDetail: id => opened.push(id),
  api: { library: {
    adminActivity: async days => [
      { user_id: 3, username: 'maria', last_seen: '2026-11-13T11:02:00Z', sessions: 4, events: 52, books_opened: 2, device: 'Android · приложение', days },
    ],
    adminActivityUser: async () => ({
      user_id: 3, username: 'maria', days: 30, truncated: false,
      sessions: [{
        session_id: 'abc', started_at: '2026-11-13T10:30:00Z', ended_at: '2026-11-13T11:02:00Z',
        device: 'Android · приложение',
        events: [
          { at: '2026-11-13T10:30:05Z', kind: 'screen', name: 'home' },
          { at: '2026-11-13T10:31:00Z', kind: 'book', name: 'detail', book_id: 7, book_title: 'Сети' },
          { at: '2026-11-13T10:31:00Z', kind: 'screen', name: 'detail' },
          { at: '2026-11-13T10:32:00Z', kind: 'book', name: 'read', book_id: 7, book_title: 'Сети' },
          { at: '2026-11-13T10:32:00Z', kind: 'screen', name: 'reader' },
          { at: '2026-11-13T10:40:00Z', kind: 'action', name: 'openTOC' },
          { at: '2026-11-13T10:41:00Z', kind: 'action', name: 'someNewButton' },
          { at: '2026-11-13T10:42:00Z', kind: 'action', name: 'scheme:killchain' },
          { at: '2026-11-13T10:43:00Z', kind: 'book', name: 'read', book_id: null, book_title: null },
        ],
      }],
    }),
  } },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(frontend, 'admin-activity.js'), 'utf8'), context);

(async () => {
  const doc = dom.window.document;
  await context.renderAdminActivity();
  const row = doc.querySelector('.activity-user-row');
  assert.ok(row, 'есть строка пользователя');
  assert.equal(row.cells[0].textContent, 'maria');
  assert.equal(row.cells[2].textContent, '4');
  assert.equal(row.cells[5].textContent, 'Android · приложение');

  row.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(doc.querySelector('.activity-detail-title').textContent, 'maria');
  const session = doc.querySelector('.activity-session');
  assert.equal(session.open, true);
  assert.match(session.querySelector('.activity-session-meta').textContent, /Android · приложение · действий: 7/);
  assert.match(session.querySelector('.activity-session-when').textContent, /32 мин/);
  const texts = [...doc.querySelectorAll('.activity-event span')].map(el => el.textContent);
  assert.deepEqual(texts, [
    'Экран: Главная',
    'Открыл карточку «Сети»',
    'Читал «Сети»',
    'Открыл оглавление',
    'Нажал: someNewButton',
    'Открыл схему: killchain',
    'Читал книгу (удалена из каталога)',
  ]);
  doc.querySelector('.activity-book-link').click();
  assert.deepEqual(opened, [7]);

  // Назад к списку.
  doc.querySelector('.activity-detail-header button').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(doc.querySelector('.activity-user-row'));

  const index = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
  assert.match(index, /data-atab="activity">Активность</);
  assert.match(index, /id="adActivity"/);
  assert.match(fs.readFileSync(path.join(frontend, 'sw.js'), 'utf8'), /'\/admin-activity\.js'/);
  console.log('Admin activity tests passed');
})().catch(error => { console.error(error); process.exit(1); });
