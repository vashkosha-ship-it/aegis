'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'recommendations.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const context = {
  state: {
    currentUser: { department: 'ЦКЗ — Центр', cyber_level: 'gate_guardian' },
    mylist: { 1: 'completed' },
    books: [
      { id: 1, title: 'Прочитанная', author: 'Автор A', categories: ['SOC'], popularity: 100 },
      { id: 2, title: 'Мониторинг SIEM', author: 'Автор B', categories: ['Blue Team'], popularity: 10 },
      { id: 3, title: 'Основы безопасности', author: 'Автор C', categories: ['Для начинающих'], popularity: 500 },
      { id: 4, title: 'Другая книга', author: 'Автор A', categories: ['Менеджмент'], popularity: 20 },
    ],
  },
};
vm.createContext(context);
vm.runInContext(source, context);

assert.ok(Array.isArray(context.departmentTopicKeywords()));
assert.equal(context.bookMatchesDepartment(context.state.books[1], context.departmentTopicKeywords()), true);
assert.deepEqual(Array.from(context.getRecommendations(2), b => b.id), [2, 4]);
assert.ok(!context.getRecommendations(5).some(b => b.id === 1));

context.state.currentUser.department = 'Другое';
assert.ok(Array.isArray(context.levelTopicKeywords()));
assert.equal(context.getRecommendations(1)[0].id, 3);

context.state.currentUser.cyber_level = 'unknown';
assert.equal(context.levelTopicKeywords(), null);
// Без подразделения и уровня книга по безопасности (Blue Team) идёт первой,
// затем — книга знакомого автора.
assert.deepEqual(Array.from(context.getRecommendations(2), b => b.id), [2, 4]);
assert.equal(context.isSecurityBook({ categories: ['Сетевая архитектура и защита периметра (Defensive Blue Team)'] }), true);
assert.equal(context.isSecurityBook({ categories: ['Квантовые вычисления'] }), false);
assert.equal(context.isSecurityBook({ categories: ['Программирование'] }), false);

context.state.currentUser = null;
assert.deepEqual(Array.from(context.getRecommendations()), []);

assert.doesNotMatch(appSource, /const DEPARTMENT_TOPICS|function getRecommendations/);
assert.ok(indexSource.indexOf('recommendations.js') < indexSource.indexOf('ai-responses.js'));
assert.ok(indexSource.indexOf('recommendations.js') < indexSource.indexOf('app.js'));
assert.match(workerSource, /['"]\/recommendations\.js['"]/);
console.log('Recommendations tests passed');
