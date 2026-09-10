'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(frontend, 'admin-screens.js'), 'utf8');
const dom = new JSDOM('<div id="dashboard"></div><div id="progress"></div>');
const context = {
  document: dom.window.document,
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

const payload = '<img src=x onerror=alert(1)>';
const dashboard = dom.window.document.getElementById('dashboard');
context.renderAdminDashboardStats(dashboard, {
  total_books: payload,
  total_users: 2,
  total_views: 3,
  total_downloads: 4,
  total_reviews: 5,
  total_quiz_attempts: 6,
});

assert.equal(dashboard.querySelectorAll('.stat-card').length, 6);
assert.equal(dashboard.querySelector('.stat-value').textContent, payload);
assert.equal(dashboard.querySelector('img'), null);
assert.deepEqual(
  Array.from(dashboard.querySelectorAll('.stat-label'), node => node.textContent),
  ['Книг в каталоге', 'Пользователей', 'Просмотров', 'Скачиваний', 'Отзывов', 'Попыток тестов'],
);

const progress = dom.window.document.getElementById('progress');
context.renderReindexResult(progress, {
  done: payload,
  indexed_pages: '<script>alert(1)</script>',
  errors: '<svg onload=alert(1)>',
});
assert.match(progress.textContent, /<img src=x/);
assert.match(progress.textContent, /<script>alert\(1\)<\/script>/);
assert.match(progress.textContent, /ошибок: <svg onload=alert\(1\)>/);
assert.equal(progress.querySelector('img, script, svg'), null);
assert.equal(progress.firstElementChild.getAttribute('data-static-style'), 'a203');

assert.doesNotMatch(source, /body\.innerHTML = `<div data-static-style="a203"/);
assert.doesNotMatch(source, /container\.innerHTML = `\s*<div class="stat-cards"/);

console.log('admin status DOM tests passed');
