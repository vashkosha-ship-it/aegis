'use strict';

// Администратор выключил ИИ-ассистента — у пользователей пропадают все
// входы в него, а переход на экран ассистента не срабатывает.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FRONTEND = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(FRONTEND, file), 'utf8');
const navigation = read('navigation.js');
const index = read('index.html');
const styles = read('styles.css');
const api = read('api.js');

const classes = new Set();
const storage = new Map();
const listeners = {};
const toasts = [];
let settings = { assistant_enabled: true };
const context = {
  document: {
    documentElement: { classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) } },
    addEventListener: (name, fn) => { listeners[name] = fn; },
    getElementById: () => null,
    visibilityState: 'visible',
  },
  window: { addEventListener: (name, fn) => { listeners[name] = fn; } },
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  showToast: message => toasts.push(message),
  api: { settings: async () => settings },
  Date,
};
vm.createContext(context);
vm.runInContext(navigation, context);
// state объявляется позже (app-state.js) — как на странице.
vm.runInContext("var state = { currentUser: { id: 1 }, currentScreen: 'assistant', aiOpen: false };", context);
const navigated = [];
context.navigateToOriginal = context.navigateTo;

(async () => {
  assert.equal(context.isAssistantEnabled(), true);

  settings = { assistant_enabled: false };
  vm.runInContext("navigateTo = (s) => navigatedTo.push(s)", Object.assign(context, { navigatedTo: navigated }));
  await context.refreshAssistantAvailability(true);
  assert.equal(context.isAssistantEnabled(), false);
  assert.ok(classes.has('ai-off'));
  assert.equal(storage.get('aegis_assistant_enabled'), '0');
  // Пользователь был на экране ассистента — уводим на главную.
  assert.deepEqual(navigated, ['home']);

  // Переход на экран ассистента не срабатывает.
  vm.runInContext('navigateTo = navigateToOriginal', context);
  context.state.currentScreen = 'home';
  context.navigateTo('assistant');
  assert.equal(context.state.currentScreen, 'home');
  assert.match(toasts.at(-1), /отключён администратором/);

  // Включили обратно.
  settings = { assistant_enabled: true };
  await context.refreshAssistantAvailability(true);
  assert.equal(context.isAssistantEnabled(), true);
  assert.equal(classes.has('ai-off'), false);

  // Ответ 403 от ассистента выключает интерфейс сразу.
  listeners['aegis:assistant-disabled']();
  assert.equal(context.isAssistantEnabled(), false);
  assert.match(api, /status === 403 && path\.startsWith\('\/me\/assistant'\)/);

  // Все входы в ИИ помечены и прячутся одним правилом.
  for (const marker of [
    'data-screen="assistant" data-ai-entry',
    'id="btnOpenAssistant" data-ai-entry',
    'data-ai-entry data-onclick="toggleAIPanel()"',
    'id="btnChapterSummary" data-ai-entry',
    'data-ai-entry data-onclick="lookupSelectionWord()"',
    'data-ai-entry data-onclick="explainSelectionTerm()"',
  ]) assert.ok(index.includes(marker), marker);
  assert.match(styles, /html\.ai-off \[data-ai-entry\] \{ display: none !important; \}/);
  assert.match(read('reader-ai-panel.js'), /isAssistantEnabled\(\)/);
  assert.match(read('reader-selection-ai.js'), /isAssistantEnabled\(\)/);
  assert.match(read('user-features.js'), /askAi\.setAttribute\('data-ai-entry', ''\)/);

  console.log('Assistant availability tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
