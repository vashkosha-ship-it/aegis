const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'reading-goals.js'), 'utf8');
const storage = new Map();
const dom = new JSDOM('<input id="booksGoalCount" value="4"><div id="settingsContent"></div>');
let widgetRenders = 0;
const context = {
  document: dom.window.document,
  window: dom.window,
  state: { mylist: { 1: 'completed', 2: 'reading', 3: 'completed' } },
  lsGet: key => storage.get(key) || null,
  lsSet: (key, value) => storage.set(key, value),
  lsRemove: key => storage.delete(key),
  renderBooksGoalWidget: () => { widgetRenders += 1; },
  renderSettingsPersonalizationTab: () => {},
  showToast: () => {},
};
vm.createContext(context);
vm.runInContext(source, context);

assert.strictEqual(context.getReadingGoal(), 20);
context.setReadingGoal(35);
assert.strictEqual(context.getReadingGoal(), 35);
context.setBooksGoal(4, 'month');
assert.strictEqual(context.getBooksGoal().count, 4);
assert.strictEqual(context.getBooksGoal().period, 'month');
assert.strictEqual(context.booksCompletedInPeriod(), 2);
assert.strictEqual(widgetRenders, 1);
context.setBooksGoal(0, 'month');
assert.strictEqual(context.getBooksGoal(), null);

const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert.ok(!app.includes('function getBooksGoal()'));
assert.ok(!app.includes("const READING_GOAL_KEY = 'aegis_reading_goal'"));
console.log('reading-goals: ok');
