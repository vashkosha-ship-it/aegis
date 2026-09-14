// ========== NAVIGATION ==========
// Ленивая инициализация: запоминаем элементы при первом обращении,
// чтобы избежать гонки если app.js загружается до конца DOM
const _screensCache = {};
const _screenScrollPositions = Object.create(null);
const SCREENS_WITH_RESTORED_SCROLL = new Set(['home', 'mylist', 'training']);
const SCREEN_IDS = {
  auth: 'authScreen',
  home: 'homeScreen',
  detail: 'detailScreen',
  reader: 'readerScreen',
  mylist: 'mylistScreen',
  profile: 'profileScreen',
  assistant: 'assistantScreen',
  settings: 'settingsScreen',
  admin: 'adminScreen',
  training: 'trainingScreen',
  onboarding: 'onboardingScreen',
};

const screens = new Proxy({}, {
  get(_t, key) {
    if (_screensCache[key]) return _screensCache[key];
    const id = SCREEN_IDS[key];
    if (!id) return null;
    const el = document.getElementById(id);
    if (el) _screensCache[key] = el;
    return el;
  },
  ownKeys() {
    return Object.keys(SCREEN_IDS);
  },
  getOwnPropertyDescriptor(_t, key) {
    return { enumerable: true, configurable: true };
  },
});

function _currentPageScroll() {
  return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
}

function _applyScreenScroll(screenName) {
  const top = SCREENS_WITH_RESTORED_SCROLL.has(screenName)
    ? (_screenScrollPositions[screenName] || 0)
    : 0;
  const target = screens[screenName];
  if (target) target.scrollTop = 0;
  window.scrollTo({ top, left: 0, behavior: 'auto' });
}

function _scheduleScreenScroll(screenName) {
  const apply = () => _applyScreenScroll(screenName);
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(apply);
  else setTimeout(apply, 0);
}

function navigateTo(s) {
  // Привратник: неодобрённый пользователь не попадает в библиотеку.
  // Разрешены только онбординг (тест уровня) и экран авторизации.
  if (state.currentUser && state.currentUser.is_approved === false
      && s !== 'onboarding' && s !== 'auth') {
    showPendingApprovalScreen();
    return;
  }
  const previousScreen = state.currentScreen;
  if (SCREENS_WITH_RESTORED_SCROLL.has(previousScreen)) {
    _screenScrollPositions[previousScreen] = _currentPageScroll();
  }
  // Снимаем active со всех известных экранов
  Object.keys(SCREEN_IDS).forEach(key => {
    const el = screens[key];
    if (el) el.classList.remove('active');
  });
  const target = screens[s];
  if (!target) {
    console.error(`Screen "${s}" not found, fallback to home`);
    s = 'home';
  }
  const isAuthScreen = s === 'auth' || s === 'onboarding';
  if (isAuthScreen) {
    screens[s].classList.add('active');
    document.getElementById('bottomNav')?.classList.add('hidden');
    document.getElementById('sidebarNav')?.classList.add('hidden-on-auth');
  } else {
    screens[s].classList.add('active');
    document.getElementById('bottomNav')?.classList.remove('hidden');
    document.getElementById('sidebarNav')?.classList.remove('hidden-on-auth');
  }
  state.currentScreen = s;
  document.body.classList.toggle('reader-active', s === 'reader');
  document.querySelectorAll('.nav-item, .sidebar-item').forEach(item => {
    const active = item.dataset.screen === s;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  closeAIPanel();
  if (s === 'home') { renderHome(); renderRecommendations(); maybeStartOnboardingTour(); }
  if (s === 'mylist') { renderMyList(); initDragAndDrop(); }
  if (s === 'training') renderTrainingScreen();
  if (s === 'profile') { renderProfile(); updateProfileXpDisplay(); renderAchievementsInProfile(); renderHeatmap(); renderSkillsRadar(); renderMyCertificates(); }
  if (s === 'settings') { renderSettingsScreen(); }
  if (s === 'assistant') { renderAssistantScreen(); }
  if (s === 'admin') { renderAdminPanel(); refreshPendingBadge(); }
  if (s === 'reader') { ensureReaderHasBook(); }
  updateFabVisibility();
  _scheduleScreenScroll(s);
}

// Если пользователь зашёл в «Читаю», но ещё не открыл ни одной книги —
// показываем заглушку с кнопкой перехода в каталог, чтобы он не застрял.
function ensureReaderHasBook() {
  if (currentBookId) return; // книга открыта — ничего не делаем
  const screen = document.getElementById('readerScreen');
  if (!screen) return;
  // убираем режим читалки, чтобы было видно меню и можно было выйти
  document.body.classList.remove('reader-active');
  let stub = document.getElementById('readerEmptyStub');
  if (!stub) {
    stub = document.createElement('div');
    stub.id = 'readerEmptyStub';
    stub.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:32px;text-align:center;background:var(--bg-primary);z-index:5;';
    screen.appendChild(stub);
  }
  stub.style.display = 'flex';
  replaceWithAppMarkup(stub, `
    <div data-static-style="a269">📖</div>
    <div data-static-style="a270">
      Вы ещё не начали читать ни одну книгу.
    </div>
    <button data-onclick="navigateTo('home')" data-static-style="a271">
      Выбрать книгу
    </button>`);
}

// Прячем заглушку, когда книга открывается
function hideReaderEmptyStub() {
  const stub = document.getElementById('readerEmptyStub');
  if (stub) stub.style.display = 'none';
}

function updateFabVisibility() {
  document.getElementById('fabSuperContainer')?.classList.toggle('visible', state.currentUser?.role === 'admin' && state.currentScreen === 'home');
}
