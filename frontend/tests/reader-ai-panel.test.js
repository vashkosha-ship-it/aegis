'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'reader-ai-panel.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const assistantSource = fs.readFileSync(path.join(FRONTEND, 'assistant-chat.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM(`
  <div id="aiPanel"></div>
  <div id="aiOverlay"></div>
  <input id="aiInput" value="">
`);
const state = { aiOpen: false, pendingAiAction: 'summary' };
const messages = [];
const renders = [];
const sends = [];
const quickActions = [];
const timers = [];
const surface = {
  messages,
  inputEl: () => dom.window.document.getElementById('aiInput'),
};
const context = {
  document: dom.window.document,
  state,
  assistantSurface: kind => {
    assert.equal(kind, 'reader');
    return surface;
  },
  assistantRender: value => renders.push(value),
  assistantSend: (...args) => sends.push(args),
  assistantHandleQuick: (...args) => quickActions.push(args),
  setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
};
vm.createContext(context);
vm.runInContext(source, context);

context.toggleAIPanel();
assert.equal(state.aiOpen, true);
assert.ok(dom.window.document.getElementById('aiPanel').classList.contains('show'));
assert.ok(dom.window.document.getElementById('aiOverlay').classList.contains('show'));
assert.equal(messages.length, 1);
assert.match(messages[0].content, /AI-ассистент Aegis/);
assert.deepEqual(renders, [surface]);
assert.equal(timers[0].delay, 100);
timers[0].fn();
assert.equal(dom.window.document.activeElement.id, 'aiInput');

context.toggleAIPanel();
assert.equal(state.aiOpen, false);
assert.equal(messages.length, 1);
assert.equal(renders.length, 1);

state.aiOpen = true;
context.closeAIPanel();
assert.equal(state.aiOpen, false);
assert.equal(state.pendingAiAction, null);
assert.ok(!dom.window.document.getElementById('aiPanel').classList.contains('show'));

const input = dom.window.document.getElementById('aiInput');
input.value = 'Объясни главу';
context.sendAIMessage();
assert.equal(input.value, '');
assert.deepEqual(sends, [[surface, 'Объясни главу']]);

context.aiQuick('quiz');
assert.deepEqual(quickActions, [[surface, 'quiz']]);

assert.doesNotMatch(appSource, /let readerAiMessages|let readerAiBusy|function toggleAIPanel|function closeAIPanel|function sendAIMessage|function aiQuick/);
assert.match(assistantSource, /return readerAiMessages/);
assert.doesNotMatch(appSource, /return readerAiMessages/);
assert.ok(indexSource.indexOf('reader-ai-panel.js') < indexSource.indexOf('app.js'));
assert.match(workerSource, /['"]\/reader-ai-panel\.js['"]/);
assert.match(workerSource, /aegis-cache-v[0-9]+/);
console.log('Reader AI panel tests passed');
