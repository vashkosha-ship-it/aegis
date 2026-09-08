'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'ai-responses.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const combined = [];
const context = {
  state: {
    currentBook: { title: 'Безопасный код', desc: 'Практическое руководство' },
    mylist: { 1: 'completed', 2: 'reading', 3: 'completed' },
    gamification: { xp: 125 },
    pendingAiAction: null,
  },
  getRecommendations: () => [
    { title: 'Книга A', rating: 4.8 },
    { title: 'Книга B', rating: 4.5 },
  ],
  startCombinedQuiz: ids => combined.push(Array.from(ids)),
  calculateLevel: xp => ({ level: xp >= 100 ? 2 : 1 }),
  getStreak: () => 7,
};
vm.createContext(context);
vm.runInContext(source, context);

assert.match(context.generateAIResponse('Что почитать?'), /1\. Книга A \(4\.8\)/);
assert.equal(
  context.generateAIResponse('Опиши книгу'),
  'Книга: Безопасный код\n\nПрактическое руководство'
);
assert.match(context.generateAIResponse('Сделай тест'), /По текущей книге/);
assert.equal(context.state.pendingAiAction, 'quiz_context');
assert.match(context.generateAIResponse('2'), /Комбинированный тест по 2 книгам готов/);
assert.deepEqual(combined, [[1, 3]]);
assert.equal(context.state.pendingAiAction, null);
assert.equal(context.generateAIResponse('Покажи прогресс'), 'Уровень: 2 | XP: 125 | Стрик: 7');

context.state.currentBook = null;
assert.match(context.generateAIResponse('quiz'), /2 прочитанных книг/);
assert.equal(context.state.pendingAiAction, 'quiz_all');
assert.match(context.generateAIResponse('да'), /Комбинированный тест готов/);
assert.deepEqual(combined, [[1, 3], [1, 3]]);

context.state.mylist = {};
context.state.pendingAiAction = null;
assert.match(context.generateAIResponse('тест'), /прочитайте хотя бы одну/);
assert.equal(context.generateAIResponse('неизвестная команда'), 'Я могу: Саммари | Тесты | Рекомендации | Прогресс');

assert.doesNotMatch(appSource, /function generateAIResponse/);
assert.ok(indexSource.indexOf('ai-responses.js') < indexSource.indexOf('app.js'));
assert.match(workerSource, /['"]\/ai-responses\.js['"]/);
console.log('AI responses tests passed');
