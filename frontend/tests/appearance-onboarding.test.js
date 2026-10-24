'use strict';

// Экран выбора оформления: один раз на аккаунт, оформление аккаунта
// применяется на новом устройстве, тур ждёт закрытия экрана.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontend = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(frontend, 'appearance-onboarding.js'), 'utf8');
const index = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(frontend, 'sw.js'), 'utf8');
const navigation = fs.readFileSync(path.join(frontend, 'navigation.js'), 'utf8');
const tour = fs.readFileSync(path.join(frontend, 'onboarding-tour.js'), 'utf8');
const auth = fs.readFileSync(path.join(frontend, 'auth-ui.js'), 'utf8');

function setup(user, stored = {}) {
  const storage = { ...stored };
  const patches = [];
  const applied = { theme: 'dark', accent: 'orange' };
  const context = {
    state: { currentUser: user, currentScreen: 'home' },
    localStorage: {
      getItem: key => (key in storage ? storage[key] : null),
      setItem: (key, value) => { storage[key] = String(value); },
    },
    api: { updateMe: payload => { patches.push(payload); return Promise.resolve({}); } },
    getAppTheme: () => applied.theme,
    getAppAccent: () => applied.accent,
    applyAppTheme: theme => { applied.theme = theme; },
    applyAppAccent: accent => { applied.accent = accent; },
    console,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, patches, applied, storage };
}

(async () => {
  // Новый аккаунт — экран нужен; старый или уже закрытый на устройстве — нет.
  assert.equal(setup({ id: 1, appearance_onboarded: false }).context.isAppearanceOnboardingPending(), true);
  assert.equal(setup({ id: 1, appearance_onboarded: true }).context.isAppearanceOnboardingPending(), false);
  assert.equal(
    setup({ id: 1, appearance_onboarded: false }, { aegis_appearance_done_1: '1' }).context.isAppearanceOnboardingPending(),
    false,
  );
  assert.equal(setup(null).context.isAppearanceOnboardingPending(), false);

  // Оформление аккаунта применяется на новом устройстве, один раз за вход.
  const device = setup({ id: 7, appearance_onboarded: true, ui_theme: 'light', ui_accent: 'violet' });
  device.context.applyAccountAppearance();
  assert.deepEqual({ ...device.applied }, { theme: 'light', accent: 'violet' });
  device.applied.theme = 'dark';
  device.context.applyAccountAppearance();
  assert.equal(device.applied.theme, 'dark', 'повторный вызов не перетирает выбор, сделанный после входа');

  // Сохранение в аккаунт отправляет текущие тему и цвет.
  await device.context.saveAccountAppearance({ appearance_onboarded: true });
  assert.deepEqual({ ...device.patches.at(-1) }, { ui_theme: 'dark', ui_accent: 'violet', appearance_onboarded: true });

  // Закрыли на устройстве, а сервер флаг не получил — досылаем.
  const offline = setup({ id: 3, appearance_onboarded: false }, { aegis_appearance_done_3: '1' });
  offline.context.onAppScreenShown();
  assert.deepEqual({ ...offline.patches[0] }, { appearance_onboarded: true });

  // Подключение: скрипт в оболочке и кэше, вызов из навигации, тур ждёт экран.
  assert.match(index, /<script defer src="appearance-onboarding\.js"><\/script>/);
  assert.ok(worker.includes("'/appearance-onboarding.js'"));
  assert.ok(worker.includes("'/css/components/appearance-onboarding.css'"));
  assert.match(navigation, /onAppScreenShown\(\)/);
  assert.match(tour, /isAppearanceOnboardingPending\(\)/);
  assert.equal((auth.match(/appearance_onboarded: user\.appearance_onboarded !== false/g) || []).length, 3);

  console.log('appearance onboarding tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
