// Account settings, privacy, profile editing and personal statistics.
// Loaded as a classic script before app.js; public handlers intentionally remain global.

// ========== ЭКРАН НАСТРОЕК ==========

const SETTINGS_TABS = [
  { id: 'info',            label: 'Информация',     icon: 'iconUser' },
  { id: 'security',        label: 'Безопасность',   icon: 'iconLock' },
  { id: 'privacy',         label: 'Приватность',    icon: 'iconEye' },
  { id: 'storage',         label: 'Данные и память', icon: 'iconDatabase' },
  { id: 'personalization', label: 'Персонализация', icon: 'iconPalette' },
  { id: 'help',            label: 'Помощь',          icon: 'iconHelp' },
];

let settingsCurrentTab = 'info';

function _accountNode(tagName, staticStyle, text) {
  const node = document.createElement(tagName);
  if (staticStyle) node.setAttribute('data-static-style', staticStyle);
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function renderSettingsScreen() {
  // Заполнить навигацию (один раз)
  document.querySelectorAll('.settings-tab').forEach(btn => {
    const tabId = btn.dataset.stab;
    const tab = SETTINGS_TABS.find(t => t.id === tabId);
    if (!tab) return;
    if (!btn.hasChildNodes()) {
      const label = document.createElement('span');
      label.textContent = tab.label;
      appendTrustedIcon(btn, ICONS[tab.icon]);
      btn.appendChild(label);
    }
    btn.classList.toggle('active', tabId === settingsCurrentTab);
  });

  // Иконка для кнопки выхода
  const logoutIc = document.getElementById('logoutIcon');
  if (logoutIc && !logoutIc.hasChildNodes()) appendTrustedIcon(logoutIc, ICONS.iconLogout);

  renderSettingsTabContent();
}

function openSettingsTab(tabId) {
  settingsCurrentTab = tabId;
  document.querySelectorAll('.settings-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.stab === tabId);
  });
  renderSettingsTabContent();
}

function _accountToggleRow(title, subtitle, id, checked, onChange) {
  const row = _accountNode('div', 'a363');
  row.className = 'set-row';
  const layout = _accountNode('div', 'a364');
  const copy = _accountNode('div', 'a004');
  copy.append(
    _accountNode('div', 'a365', title),
    _accountNode('div', 'a099', subtitle),
  );

  const label = _accountNode('label', 'a366');
  label.className = 'toggle-switch';
  const input = _accountNode('input', 'a367');
  input.type = 'checkbox';
  input.id = id;
  input.checked = checked;
  input.addEventListener('change', () => onChange(input));

  const slider = document.createElement('span');
  slider.className = 'toggle-slider';
  slider.setAttribute(
    'data-dynamic-style',
    dynamicStyleToken`position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${checked ? 'var(--accent)' : 'var(--bg-card-hover)'};transition:0.2s;border-radius:24px;pointer-events:none;`,
  );
  const thumb = document.createElement('span');
  thumb.setAttribute(
    'data-dynamic-style',
    dynamicStyleToken`position:absolute;height:18px;width:18px;left:${checked ? '21px' : '3px'};bottom:3px;background:#fff;transition:0.2s;border-radius:50%;`,
  );
  slider.appendChild(thumb);
  label.append(input, slider);
  layout.append(copy, label);
  row.appendChild(layout);
  return row;
}

function _accountStorageAction(text, staticStyle, onClick) {
  const button = _accountNode('button', staticStyle);
  button.className = 'set-save-btn';
  button.type = 'button';
  button.appendChild(document.createElement('span')).textContent = text;
  button.addEventListener('click', onClick);
  return button;
}

async function renderSettingsStorageTab(c) {
  const title = _accountNode('h3', 'a350', 'Данные и память');
  const loading = _accountNode('div', 'a351');
  loading.id = 'storageStatsContent';
  appendTrustedIcon(loading, ICONS.iconDatabase);
  loading.appendChild(_accountNode('div', 'a352', 'Подсчёт...'));
  c.replaceChildren(title, loading);

  const stats = await getStorageStats();
  const cont = document.getElementById('storageStatsContent');
  if (!cont) return;

  const usedPct = stats.quota > 0 ? Math.round((stats.used / stats.quota) * 100) : 0;
  const wifiOnly = isWifiOnlyEnabled();
  const autoPreload = isAutoPreloadEnabled();

  cont.style.textAlign = 'left';
  cont.style.padding = '0';

  const usage = _accountNode('div', 'a353');
  const usageHeader = _accountNode('div', 'a354');
  usageHeader.append(
    _accountNode('div', 'a355', 'ИСПОЛЬЗОВАНО'),
    _accountNode('div', 'a356', formatBytes(stats.used)),
  );
  const usageTrack = _accountNode('div', 'a357');
  const usageFill = document.createElement('div');
  usageFill.setAttribute(
    'data-dynamic-style',
    dynamicStyleToken`height:100%;width:${usedPct}%;background:var(--accent-gradient);transition:width 0.3s;`,
  );
  usageTrack.appendChild(usageFill);
  const usageLegend = _accountNode('div', 'a358');
  usageLegend.append(
    _accountNode('span', null, `${usedPct}% от доступного`),
    _accountNode('span', null, `из ${formatBytes(stats.quota)}`),
  );
  usage.append(usageHeader, usageTrack, usageLegend);

  const cacheSummary = _accountNode('div', 'a359');
  const cacheSize = _accountNode('div', 'a360');
  cacheSize.append(
    _accountNode('div', 'a361', formatBytes(stats.cacheSize)),
    _accountNode('div', 'a344', 'Кэш приложения'),
  );
  const cacheCount = _accountNode('div', 'a360');
  cacheCount.append(
    _accountNode('div', 'a362', stats.cacheCount),
    _accountNode('div', 'a344', 'Файлов в кэше'),
  );
  cacheSummary.append(cacheSize, cacheCount);

  const exportButton = _accountStorageAction(
    'Скачать все мои данные',
    'a368',
    () => exportAllUserData(),
  );
  const exportHint = _accountNode(
    'div',
    'a369',
    'Выгрузка всех ваших данных (профиль, списки, заметки, прогресс, результаты тестов) одним JSON-файлом.',
  );
  const clearButton = _accountStorageAction(
    'Очистить кэш',
    'a370',
    () => confirmClearCache(),
  );
  const clearHint = _accountNode(
    'div',
    'a371',
    'После очистки книги придётся скачать заново при следующем чтении. Прогресс чтения, заметки и достижения сохранятся.',
  );

  cont.replaceChildren(
    usage,
    cacheSummary,
    _accountToggleRow(
      'Скачивать только по Wi-Fi',
      'Экономия мобильного трафика',
      'wifiOnlyToggle',
      wifiOnly,
      onWifiOnlyToggle,
    ),
    _accountToggleRow(
      'Автосохранение книг офлайн',
      'Начатые книги автоматически скачиваются по Wi-Fi',
      'autoPreloadToggle',
      autoPreload,
      onAutoPreloadToggle,
    ),
    exportButton,
    exportHint,
    clearButton,
    clearHint,
  );
}

function confirmClearCache() {
  showConfirmModal({
    title: 'Очистить кэш приложения?',
    message: 'Все скачанные книги будут удалены из кэша. Прогресс, заметки и достижения сохранятся.',
    confirmText: 'Очистить',
    cancelText: 'Отмена',
    danger: true,
    onConfirm: async () => {
      try {
        await clearAllAppCache();
        showToast('Кэш очищен');
        // Перерисуем вкладку
        renderSettingsStorageTab(document.getElementById('settingsContent'));
      } catch (e) {
        showToast('Не удалось очистить кэш');
        console.error(e);
      }
    },
  });
}

function renderSettingsTabContent() {
  const c = document.getElementById('settingsContent');
  if (!c || !state.currentUser) return;

  if (settingsCurrentTab === 'info') {
    renderSettingsInfoTab(c);
  } else if (settingsCurrentTab === 'security') {
    renderSettingsSecurityTab(c);
  } else if (settingsCurrentTab === 'personalization') {
    renderSettingsPersonalizationTab(c); 
  } else if (settingsCurrentTab === 'privacy') {
    renderSettingsPrivacyTab(c);
  } else if (settingsCurrentTab === 'storage') {
    renderSettingsStorageTab(c);
  } else if (settingsCurrentTab === 'help') {
    renderSettingsHelpTab(c);
  }else {
    const tab = SETTINGS_TABS.find(t => t.id === settingsCurrentTab);
    const placeholder = _accountNode('div', 'a372');
    placeholder.append(
      _accountNode('div', 'a373', tab ? tab.label : ''),
      _accountNode('div', 'a253', 'Раздел будет доступен в ближайшее время'),
    );
    c.replaceChildren(placeholder);
  }
}
