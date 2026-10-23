'use strict';

// Экран ассистента должен жить внутри #app: снаружи он ложился под пустой
// #app, страница становилась в два экрана высотой и прокручивалась вверх.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(frontend, 'css/components/detail-assistant.css'), 'utf8');
const { document } = new JSDOM(html).window;

const screen = document.getElementById('assistantScreen');
assert.ok(screen, 'assistantScreen exists');
assert.ok(document.getElementById('app').contains(screen), 'assistantScreen must be inside #app');
assert.ok(screen.querySelector('.assistant-title'), 'desktop title is present');
for (const id of ['btnNewChat', 'btnChatHistory', 'btnClearAssistant']) {
  assert.ok(document.getElementById(id).getAttribute('aria-label'), `${id} has aria-label`);
}
assert.match(css, /body:has\(#assistantScreen\.active\) \{ padding-bottom: 0; overflow: hidden; \}/);
assert.match(css, /#assistantInputBar:focus-within/);
console.log('Assistant screen layout tests passed');
