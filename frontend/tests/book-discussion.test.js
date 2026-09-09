'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'book-discussion.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM('<div id="detailTabDiscussion"></div>');
const added = [];
const deleted = [];
const toasts = [];
let confirmation = null;
let vibrations = 0;

const api = {
  library: {
    bookComments: async () => [{
      id: 10,
      text: '<важный комментарий>',
      created_at: new Date().toISOString(),
      can_delete: true,
      author: { id: 3, username: 'alice', full_name: 'Alice', has_avatar: true },
      replies: [{
        id: 11,
        text: 'Ответ',
        created_at: new Date().toISOString(),
        can_delete: false,
        author: { id: 4, username: 'bob', full_name: 'Bob', has_avatar: false },
      }],
    }],
    addBookComment: async (...args) => added.push(args),
    deleteBookComment: async (...args) => deleted.push(args),
  },
  users: { avatarUrl: userId => `/api/users/${userId}/avatar` },
};

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const context = {
  document: dom.window.document,
  dynamicStyleToken: () => 'test-style',
  navigator: { vibrate: () => { vibrations += 1; } },
  api,
  currentBookId: 42,
  eh: escapeHtml,
  sensitiveNonce: () => 'test-nonce',
  showToast: message => toasts.push(message),
  showConfirmModal: options => { confirmation = options; },
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  await context.renderDiscussion();
  await context.loadComments();

  const panel = dom.window.document.getElementById('detailTabDiscussion');
  assert.match(panel.textContent, /Alice/);
  assert.match(panel.textContent, /Bob/);
  assert.match(panel.innerHTML, /&lt;важный комментарий&gt;/);
  assert.doesNotMatch(panel.innerHTML, /<важный комментарий>/);
  assert.match(panel.innerHTML, /data-nonce="test-nonce"/);

  context.startReply(10, 'Alice');
  assert.equal(panel.querySelector('#discussReplyHint').textContent, 'Ответ для Alice');
  assert.equal(panel.querySelector('#discussCancelReply').style.display, 'block');

  const input = panel.querySelector('#discussInput');
  input.value = 'Новый ответ';
  await context.submitComment();
  assert.deepEqual(added, [[42, 'Новый ответ', 10]]);
  assert.equal(vibrations, 1);
  assert.equal(input.value, '');

  context.deleteComment(10);
  assert.equal(confirmation.title, 'Удалить комментарий?');
  assert.equal(confirmation.danger, true);
  await confirmation.onConfirm();
  assert.deepEqual(deleted, [[42, 10]]);

  context.cancelReply();
  assert.equal(panel.querySelector('#discussReplyHint').style.display, 'none');

  assert.doesNotMatch(appSource, /function renderDiscussion|function submitComment|function deleteComment/);
  assert.ok(indexSource.indexOf('book-discussion.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /const CACHE_NAME = 'aegis-cache-v\d+'/);
  assert.match(workerSource, /['"]\/book-discussion\.js['"]/);
  assert.equal(toasts.length, 0);
  console.log('Book discussion tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
