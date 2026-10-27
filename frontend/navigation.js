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

// ========== ДОСТУПНОСТЬ ИИ-АССИСТЕНТА ==========
// Администратор может выключить ассистента для всех. Тогда сервер отвечает
// на запросы к нему 403, а интерфейс прячет все входы в ИИ: пункт меню,
// кнопку в шапке, ИИ в читалке, «Объяснить»/«Словарь» у выделения.
// Прятанием занимается CSS: html.ai-off [data-ai-entry] { display: none }.
const ASSISTANT_ENABLED_KEY = 'aegis_assistant_enabled';
const ASSISTANT_REFRESH_MS = 60 * 1000;
let _assistantCheckedAt = 0;
// Своя переменная, а не state: navigation.js подключается раньше app-state.js,
// а состояние нужно уже при загрузке страницы.
let _assistantEnabled = true;
// Последние настройки сервиса (/settings): лимиты размера книг и т. п.
let _serviceSettings = null;
const DEFAULT_MAX_BOOK_SIZE_MB = 500;

// Лимит на файл книги в МБ — из настроек сервера, чтобы админка не
// отказывала в файле, который сервер принял бы (и наоборот).
function getMaxBookSizeMb(format) {
  const key = format === 'epub' ? 'max_epub_size_mb' : 'max_pdf_size_mb';
  const value = Number(_serviceSettings && _serviceSettings[key]);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_BOOK_SIZE_MB;
}

function isAssistantEnabled() {
  return _assistantEnabled;
}

function applyAssistantAvailability(enabled) {
  const on = enabled !== false;
  _assistantEnabled = on;
  document.documentElement.classList.toggle('ai-off', !on);
  // Запоминаем, чтобы после перезагрузки кнопка не мелькала до ответа сервера.
  try { localStorage.setItem(ASSISTANT_ENABLED_KEY, on ? '1' : '0'); } catch (_) { /* хранилище недоступно */ }
  if (on || typeof state === 'undefined') return;
  if (state.aiOpen && typeof closeAIPanel === 'function') closeAIPanel();
  document.getElementById('readerAiPopup')?.remove();
  if (state.currentScreen === 'assistant') navigateTo('home');
}

// force — сразу после входа; иначе не чаще раза в минуту (при переходах
// по экранам и возвращении во вкладку), чтобы выключение доезжало до
// открытого приложения без перезагрузки.
async function refreshAssistantAvailability(force = false) {
  if (typeof state === 'undefined' || !state.currentUser || state.offlineSession) return;
  if (typeof api === 'undefined' || !api.settings) return;
  if (!force && Date.now() - _assistantCheckedAt < ASSISTANT_REFRESH_MS) return;
  _assistantCheckedAt = Date.now();
  try {
    const settings = await api.settings();
    if (settings) _serviceSettings = settings;
    applyAssistantAvailability(settings && settings.assistant_enabled === true);
  } catch (_) {
    // Нет сети или сервер недоступен — оставляем последнее известное состояние.
  }
}

function showAssistantDisabledToast() {
  showToast('ИИ-ассистент отключён администратором');
}

(function initAssistantAvailability() {
  let saved = null;
  try { saved = localStorage.getItem(ASSISTANT_ENABLED_KEY); } catch (_) { /* хранилище недоступно */ }
  if (saved === '0') applyAssistantAvailability(false);
  // Сервер ответил 403 на запрос к ассистенту — значит, его выключили.
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('aegis:assistant-disabled', () => {
      if (isAssistantEnabled()) {
        applyAssistantAvailability(false);
        showAssistantDisabledToast();
      }
    });
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshAssistantAvailability();
    });
  }
})();

function navigateTo(s) {
  if (s === 'assistant' && !isAssistantEnabled()) {
    showAssistantDisabledToast();
    return;
  }
  if (s !== 'auth') refreshAssistantAvailability();
  // Привратник: неодобрённый пользователь не попадает в библиотеку.
  // Разрешены только онбординг (тест уровня) и экран авторизации.
  if (state.currentUser && state.currentUser.is_approved === false
      && s !== 'onboarding' && s !== 'auth') {
    showPendingApprovalScreen();
    return;
  }
  const previousScreen = state.currentScreen;
  if (s !== previousScreen && typeof trackUsage === 'function') trackUsage('screen', s);
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
  // Экран уровня: карточки выбора и «Хочу узнать (тест)» рисуются при каждом
  // показе. Раньше это делал не каждый вход (профиль, после регистрации),
  // и человек видел пустой экран с одним «Пропустить».
  if (s === 'onboarding' && typeof renderLevelChoices === 'function') renderLevelChoices();
  if (s === 'profile') { renderProfile(); updateProfileXpDisplay(); renderAchievementsInProfile(); renderHeatmap(); renderSkillsRadar(); renderMyCertificates(); }
  if (s === 'settings') { renderSettingsScreen(); }
  if (s === 'assistant') { renderAssistantScreen(); }
  if (s === 'admin') { renderAdminPanel(); refreshPendingBadge(); }
  if (s === 'reader') { ensureReaderHasBook(); }
  updateFabVisibility();
  _scheduleScreenScroll(s);
  if (typeof onAppScreenShown === 'function') onAppScreenShown();
}

// Если пользователь зашёл в «Читаю», но ещё не открыл ни одной книги —
// показываем заглушку с кнопкой перехода в каталог, чтобы он не застрял.
// Последняя начатая и недочитанная книга — та же логика, что у блока
// «Продолжить» на главной.
function lastStartedBookId() {
  const hidden = typeof getResumeHidden === 'function' ? getResumeHidden() : [];
  let best = null;
  let bestTime = -1;
  (state.books || []).forEach(book => {
    const progress = state.readingProgress[book.id];
    if (!progress || !progress.started || hidden.includes(book.id)) return;
    const total = progress.totalPages || 0;
    if (total > 1 && (progress.currentPage || 0) >= total) return;
    const time = progress.lastReadAt ? new Date(progress.lastReadAt).getTime() : 0;
    if (time > bestTime) { best = book.id; bestTime = time; }
  });
  return best;
}

function ensureReaderHasBook() {
  if (currentBookId) return; // книга открыта — ничего не делаем
  // После перезагрузки страницы открытой книги нет, но начатые есть —
  // открываем последнюю вместо «Вы ещё не начали читать».
  const resumeId = lastStartedBookId();
  if (resumeId !== null) { openReader(resumeId); return; }
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
  // Стрелки листания и «1 / 1» поверх пустого экрана только путают.
  screen.classList.add('reader-empty');
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
  document.getElementById('readerScreen')?.classList.remove('reader-empty');
}

function updateFabVisibility() {
  document.getElementById('fabSuperContainer')?.classList.toggle('visible', state.currentUser?.role === 'admin' && state.currentScreen === 'home');
}
