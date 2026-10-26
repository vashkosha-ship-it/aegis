'use strict';

/* Экран выбора оформления при первом входе в аккаунт.
   Показывается один раз на аккаунт (флаг appearance_onboarded на сервере),
   на любом устройстве. Выбор сразу применяется к приложению и сохраняется
   в аккаунт, поэтому на iPad и телефоне оформление будет одинаковым. */

const APPEARANCE_DONE_KEY = 'aegis_appearance_done_';
let appearanceOnboardingOpen = false;
let accountAppearanceAppliedFor = null;

function _appearanceDoneLocally(userId) {
  try { return localStorage.getItem(APPEARANCE_DONE_KEY + userId) === '1'; } catch (_) { return false; }
}

function _rememberAppearanceDone(userId) {
  try { localStorage.setItem(APPEARANCE_DONE_KEY + userId, '1'); } catch (_) { /* хранилище недоступно */ }
}

function isAppearanceOnboardingPending() {
  const user = state.currentUser;
  return Boolean(user && user.id && user.appearance_onboarded === false && !_appearanceDoneLocally(user.id));
}

// Оформление аккаунта применяется на каждом устройстве один раз за вход.
function applyAccountAppearance() {
  const user = state.currentUser;
  if (!user || !user.id || accountAppearanceAppliedFor === user.id) return;
  accountAppearanceAppliedFor = user.id;
  if (user.ui_theme && user.ui_theme !== getAppTheme()) applyAppTheme(user.ui_theme);
  if (user.ui_accent && user.ui_accent !== getAppAccent()) applyAppAccent(user.ui_accent);
}

// Сохранить оформление в аккаунт (из экрана первого входа и из настроек).
function saveAccountAppearance(extra = {}) {
  if (!state.currentUser || typeof api === 'undefined' || !api.updateMe) return Promise.resolve(null);
  const payload = { ui_theme: getAppTheme(), ui_accent: getAppAccent(), ...extra };
  Object.assign(state.currentUser, { ui_theme: payload.ui_theme, ui_accent: payload.ui_accent });
  return api.updateMe(payload).catch(err => {
    console.info('Оформление не сохранилось в аккаунт:', err && err.message);
    return null;
  });
}

function _appearanceNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function _themeCard(theme, title, hint) {
  const button = _appearanceNode('button', 'appearance-theme-card');
  button.type = 'button';
  button.dataset.pickTheme = theme;
  button.setAttribute('aria-pressed', 'false');
  const preview = _appearanceNode('span', `appearance-theme-preview appearance-theme-preview--${theme}`);
  preview.setAttribute('aria-hidden', 'true');
  preview.append(
    _appearanceNode('span', 'appearance-preview-bar'),
    _appearanceNode('span', 'appearance-preview-line'),
    _appearanceNode('span', 'appearance-preview-line appearance-preview-line--short'),
    _appearanceNode('span', 'appearance-preview-accent'),
  );
  const copy = _appearanceNode('span', 'appearance-theme-copy');
  copy.append(_appearanceNode('strong', '', title), _appearanceNode('span', '', hint));
  button.append(preview, copy);
  return button;
}

function maybeShowAppearanceOnboarding() {
  if (appearanceOnboardingOpen || !isAppearanceOnboardingPending()) return false;
  if (state.currentScreen === 'auth') return false;
  showAppearanceOnboarding();
  return true;
}

function showAppearanceOnboarding() {
  document.getElementById('appearanceOnboarding')?.remove();
  appearanceOnboardingOpen = true;
  const initial = { theme: getAppTheme(), accent: getAppAccent() };
  const userId = state.currentUser && state.currentUser.id;

  const overlay = _appearanceNode('div', 'appearance-onboarding');
  overlay.id = 'appearanceOnboarding';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'appearanceOnboardingTitle');

  const panel = _appearanceNode('div', 'appearance-onboarding-panel');
  const kicker = _appearanceNode('div', 'appearance-onboarding-kicker', 'Добро пожаловать в Aegis');
  const title = _appearanceNode('h2', 'appearance-onboarding-title', 'Выберите оформление');
  title.id = 'appearanceOnboardingTitle';
  const lead = _appearanceNode('p', 'appearance-onboarding-lead',
    'Тема и цвет сразу применятся ко всему приложению. Поменять их можно в любой момент в профиле → «Настройки».');

  const themeLabel = _appearanceNode('div', 'appearance-onboarding-label', 'Тема');
  const themes = _appearanceNode('div', 'appearance-theme-grid');
  themes.append(
    _themeCard('dark', 'Тёмная', 'Бережёт глаза вечером'),
    _themeCard('light', 'Светлая', 'Лучше читается днём'),
  );

  const accentLabel = _appearanceNode('div', 'appearance-onboarding-label', 'Цвет');
  const accents = _appearanceNode('div', 'appearance-accent-row');
  accents.setAttribute('role', 'radiogroup');
  accents.setAttribute('aria-label', 'Цвет оформления');
  APP_ACCENTS.forEach(item => {
    const button = _appearanceNode('button', 'appearance-accent');
    button.type = 'button';
    button.dataset.accent = item.id;
    button.setAttribute('role', 'radio');
    const swatch = _appearanceNode('span', 'appearance-accent-swatch');
    swatch.style.background = item.swatch;
    button.append(swatch, _appearanceNode('span', 'appearance-accent-name', item.label));
    accents.appendChild(button);
  });

  const actions = _appearanceNode('div', 'appearance-onboarding-actions');
  const skip = _appearanceNode('button', 'appearance-onboarding-skip', 'Пропустить');
  skip.type = 'button';
  skip.dataset.appearanceSkip = '';
  const done = _appearanceNode('button', 'appearance-onboarding-done', 'Готово');
  done.type = 'button';
  done.dataset.appearanceDone = '';
  actions.append(skip, done);

  panel.append(kicker, title, lead, themeLabel, themes, accentLabel, accents, actions);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const sync = () => {
    const theme = getAppTheme();
    const accent = getAppAccent();
    themes.querySelectorAll('[data-pick-theme]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.pickTheme === theme));
    });
    accents.querySelectorAll('[data-accent]').forEach(button => {
      button.setAttribute('aria-checked', String(button.dataset.accent === accent));
    });
  };

  themes.addEventListener('click', event => {
    const button = event.target.closest('[data-pick-theme]');
    if (!button) return;
    applyAppTheme(button.dataset.pickTheme);
    sync();
  });
  accents.addEventListener('click', event => {
    const button = event.target.closest('[data-accent]');
    if (!button) return;
    applyAppAccent(button.dataset.accent);
    sync();
  });

  const close = (chosen) => {
    if (!chosen) {
      // «Пропустить» — оставляем оформление, которое было до экрана.
      applyAppTheme(initial.theme);
      applyAppAccent(initial.accent);
    }
    if (userId) _rememberAppearanceDone(userId);
    if (state.currentUser) state.currentUser.appearance_onboarded = true;
    if (typeof trackUsage === 'function') trackUsage('action', chosen ? 'appearance:chosen' : 'appearance:skipped');
    const request = chosen
      ? saveAccountAppearance({ appearance_onboarded: true })
      : api.updateMe({ appearance_onboarded: true }).catch(() => null);
    request.catch(() => null);
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    appearanceOnboardingOpen = false;
    if (state.currentScreen === 'home' && typeof maybeStartOnboardingTour === 'function') maybeStartOnboardingTour();
  };
  const onKey = event => { if (event.key === 'Escape') close(false); };
  skip.addEventListener('click', () => close(false));
  done.addEventListener('click', () => close(true));
  document.addEventListener('keydown', onKey);

  sync();
  done.focus({ preventScroll: true });
}

// Вызывается из navigateTo после смены экрана.
let appearanceFlagResent = false;
function onAppScreenShown() {
  const user = state.currentUser;
  if (!user || state.currentScreen === 'auth') return;
  applyAccountAppearance();
  // Сначала — согласие с текущей редакцией документов: пока оно не дано,
  // остальные приветственные окна не показываем.
  if (typeof maybeShowLegalConsent === 'function' && maybeShowLegalConsent()) return;
  // Экран уже закрыли на этом устройстве, но сервер флаг не получил
  // (не было сети) — досылаем, чтобы он не появился на другом устройстве.
  if (user.appearance_onboarded === false && user.id && _appearanceDoneLocally(user.id) && !appearanceFlagResent) {
    appearanceFlagResent = true;
    api.updateMe({ appearance_onboarded: true })
      .then(() => { user.appearance_onboarded = true; })
      .catch(() => { appearanceFlagResent = false; });
  }
  maybeShowAppearanceOnboarding();
}
