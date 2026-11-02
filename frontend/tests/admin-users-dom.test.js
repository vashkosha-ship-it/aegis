'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { readGroup } = require('./helpers/module-source');
const source = readGroup('admin');
const dom = new JSDOM('<div id="adUsers"></div><button id="adminSaveFieldsBtn"></button><button id="adminUploadFileBtn"></button><button id="adminReindexBookBtn"></button><button id="adminDeleteFileBtn"></button><button id="adminUploadCoverBtn"></button><button id="adminDeleteCoverBtn"></button><button id="adminDeleteBookBtn"></button><button id="saveBookBtn"></button>');
const calls = [];
const context = {
  document: dom.window.document, console,
  state: { _adminUsers: [{ id: '<img>', username: '<script>x</script>', email: 'x@example.test', role: 'user', cyber_level: null, xp: 1, streak_count: 2, completed_books: 3, quiz_attempts: 4, perfect_quizzes: 5, total_pages_read: 6, is_active: true }] },
  ICONS: { check: '<svg data-icon="check"></svg>', x: '<svg></svg>', trash: '<svg data-icon="trash"></svg>' },
  appendTrustedIcon: (node, markup) => { const parsed = new dom.window.DOMParser().parseFromString(markup, 'image/svg+xml'); node.appendChild(dom.window.document.importNode(parsed.documentElement, true)); },
  replaceSelectOptions: (select, items) => items.forEach(item => { const option=dom.window.document.createElement('option'); option.value=String(item.value); option.textContent=String(item.label); option.selected=Boolean(item.selected); select.appendChild(option); }),
  replaceWithStaticText: () => {}, getCyberLevelInfo: () => null,
  openCreateUserModal: () => {}, openPendingUsersModal: () => {}, openExportModal: () => {},
  refreshPendingBadge: () => {}, onAdminUsersFilterChange: () => {}, onAdminUsersLimitChange: () => {},
};
vm.createContext(context); vm.runInContext(source, context);
context.deleteAdminUser = (...args) => calls.push(args);
context.renderAdminUsersWithFilter();
const container = dom.window.document.getElementById('adUsers');
assert.equal(container.querySelector('img, script'), null);
assert.match(container.textContent, /<script>x<\/script>/);
assert.doesNotMatch(container.textContent, /ФИО/);
assert.equal(container.querySelectorAll('tbody tr').length, 1);
assert.equal(container.querySelectorAll('button').length, 5); // + «Временный пароль»
assert.ok(container.querySelector('button[title="Выдать временный пароль"]'));
// Поиск по логину скрывает остальные строки.
const search = container.querySelector('#adminUsersSearch');
search.value = 'nobody';
search.dispatchEvent(new dom.window.Event('input'));
assert.equal(container.querySelector('tbody tr').hidden, true);
assert.equal(container.querySelector('.admin-user-lookup-empty').hidden, false);
search.value = 'SCRIPT';
search.dispatchEvent(new dom.window.Event('input'));
assert.equal(container.querySelector('tbody tr').hidden, false);
container.querySelector('tbody button.danger').click();
assert.deepEqual(calls[0], ['<img>', '<script>x</script>']);
assert.doesNotMatch(source, /container\.innerHTML = actionsBar/);
assert.doesNotMatch(source, /displayed\.map\(\(u, idx\)/);
console.log('admin users DOM tests passed');
