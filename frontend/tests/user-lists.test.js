'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const adminSource = fs.readFileSync(path.join(frontend, 'admin-screens.js'), 'utf8');
const assistantSource = fs.readFileSync(path.join(frontend, 'assistant-chat.js'), 'utf8');

function replaceWithStaticText(document, container, text, style) {
  if (!container) return;
  const node = document.createElement('div');
  node.setAttribute('data-static-style', style);
  node.textContent = text;
  container.replaceChildren(node);
}

(async () => {
  const adminDom = new JSDOM(`
    <button id="adminSaveFieldsBtn"></button>
    <button id="adminUploadFileBtn"></button>
    <button id="adminDeleteFileBtn"></button>
    <button id="adminUploadCoverBtn"></button>
    <button id="adminDeleteCoverBtn"></button>
    <button id="adminDeleteBookBtn"></button>
    <button id="saveBookBtn"></button>
    <span id="pendingUsersBadge"></span>
  `);
  const approvals = [];
  const pendingUser = {
    id: 7,
    username: '<img src=x>',
    full_name: '<Admin>',
    email: 'mail@example.test"><script>',
    department: '<SOC>',
  };
  const adminContext = {
    document: adminDom.window.document,
    api: { library: {
      adminLogs: async () => [{
        action: '<img src=x>', detail: '<script>alert(1)</script>',
        admin: '<root>', created_at: '2026-09-10T00:00:00Z',
      }],
      adminPendingUsers: async () => [pendingUser],
      adminApproveUser: async id => approvals.push(id),
    } },
    state: { currentUser: { role: 'admin' } },
    replaceWithStaticText: (container, text, style) => replaceWithStaticText(adminDom.window.document, container, text, style),
    showToast: () => {},
    console,
    confirm: () => true,
  };
  vm.createContext(adminContext);
  vm.runInContext(adminSource, adminContext);

  await adminContext.openAdminLogs();
  const logs = adminDom.window.document.getElementById('adminLogsBody');
  assert.match(logs.textContent, /<script>alert\(1\)<\/script>/);
  assert.equal(logs.querySelector('script, img'), null);

  await adminContext.openPendingUsersModal();
  const pending = adminDom.window.document.getElementById('pendingUsersList');
  assert.match(pending.textContent, /<Admin>/);
  assert.match(pending.textContent, /<SOC>/);
  assert.equal(pending.querySelector('script, img'), null);
  assert.equal(pending.querySelector('[data-onclick]'), null);
  const approve = pending.querySelector('[data-static-style="a195"]');
  await adminContext.approvePendingUser(pendingUser.id, approve);
  assert.deepEqual(approvals, [7]);
  assert.equal(pending.querySelector('[data-pending-user-row]'), null);

  const assistantDom = new JSDOM('');
  const loaded = [];
  const deleted = [];
  const assistantContext = {
    document: assistantDom.window.document,
    api: { library: {
      chats: async () => [{ id: 9, title: '<img src=x>', message_count: '<script>' }],
      chat: async id => { loaded.push(id); return { messages: [] }; },
      deleteChat: async id => deleted.push(id),
    } },
    state: { currentScreen: 'assistant' },
    replaceWithStaticText: (container, text, style) => replaceWithStaticText(assistantDom.window.document, container, text, style),
    renderAssistantScreen: () => {},
    showToast: () => {},
    console,
  };
  vm.createContext(assistantContext);
  vm.runInContext(assistantSource, assistantContext);

  await assistantContext.openChatHistory();
  const history = assistantDom.window.document.getElementById('chatHistoryBody');
  assert.match(history.textContent, /<img src=x>/);
  assert.equal(history.querySelector('img, script'), null);
  assert.equal(history.querySelector('[data-onclick]'), null);
  const buttons = history.querySelectorAll('button');
  history.querySelector('[data-static-style="a306"]').click();
  buttons[0].click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(loaded, [9]);
  assert.deepEqual(deleted, [9]);

  console.log('User list DOM tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
