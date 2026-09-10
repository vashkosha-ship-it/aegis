// Account settings, privacy, profile editing and personal statistics.
// Loaded as a classic script before app.js; public handlers intentionally remain global.

// ========== ЭКРАН НАСТРОЕК ==========

const USER_AGREEMENT_HTML = `
  <h2 data-static-style="a345">Пользовательское соглашение (EULA)</h2>
  <p data-static-style="a204">Пользовательское соглашение (далее — «Соглашение») регулирует отношения между Владельцем сервиса (далее — «Администрация») и физическим лицом (далее — «Пользователь») по использованию прогрессивного веб-приложения «Aegis» (далее — «Сервис»), представляющего собой библиотеку материалов по кибербезопасности.</p>

  <h3 data-static-style="a346">1. Общие положения</h3>
  <p data-static-style="a347">1.1. <strong>Aegis</strong> — это PWA-сервис, предоставляющий доступ к структурированной библиотеке книг, статей, гайдов и исследовательских материалов в области информационной безопасности.</p>
  <p data-static-style="a347">1.2. Использование Сервиса регулируется настоящим Соглашением, а также Политикой конфиденциальности.</p>
  <p data-static-style="a347">1.3. Начиная использовать Сервис (установка PWA на устройство, авторизация или просмотр контента), Пользователь считается безоговорочно принявшим условия настоящего Соглашения. Если вы не согласны с условиями, вы обязаны прекратить использование Сервиса.</p>

  <h3 data-static-style="a346">2. Предмет соглашения и статус контента</h3>
  <p data-static-style="a347">2.1. <strong>Образовательная цель:</strong> Сервис предоставляет материалы исключительно в образовательных, исследовательских и ознакомительных целях для специалистов и энтузиастов сферы кибербезопасности.</p>
  <p data-static-style="a347">2.2. <strong>Авторские права:</strong> Весь контент, размещенный в библиотеке (тексты, обложки, дизайн, программный код PWA), является объектом интеллектуальной собственности Администрации или используется на основании лицензионных договоров с правообладателями.</p>
  <p data-static-style="a347">2.3. <strong>Ограничения использования контента:</strong></p>
  <p data-static-style="a348">— Пользователь вправе читать и цитировать материалы в личных образовательных целях в объемах, оправданных целью цитирования.<br>— <strong>Строго запрещается:</strong> воспроизведение, копирование, распространение, сдача в прокат, публичное воспроизведение материалов Сервиса или их фрагментов без письменного разрешения Администрации.</p>
  <p data-static-style="a347">2.4. <strong>Пользовательский контент:</strong> Если функционал Сервиса позволяет оставлять комментарии или заметки (Пользовательский контент), Пользователь гарантирует, что этот контент не нарушает законодательство и права третьих лиц.</p>

  <h3 data-static-style="a346">3. Функциональность PWA и офлайн-доступ</h3>
  <p data-static-style="a347">3.1. Сервис использует технологии Progressive Web App (Service Workers, Cache API) для обеспечения офлайн-доступа к ранее открытым материалам.</p>
  <p data-static-style="a347">3.2. Пользователь уведомлен, что:</p>
  <p data-static-style="a348">— Офлайн-режим работает исключительно с кэшированными данными.<br>— Для синхронизации прогресса чтения и получения обновлений библиотеки требуется активное подключение к сети Интернет.<br>— Администрация не несет ответственности за потерю кэшированных данных при очистке памяти браузера Пользователем или сбое файловой системы устройства.</p>

  <h3 data-static-style="a346">4. Права и обязанности сторон</h3>
  <p data-static-style="a347"><strong>Пользователь обязуется:</strong></p>
  <p data-static-style="a347">4.1. Использовать полученные знания исключительно в законных целях. <strong>Пользователь осознает, что применение техник и инструментов, описанных в материалах библиотеки, для несанкционированного доступа к чужим информационным системам является уголовно наказуемым деянием.</strong></p>
  <p data-static-style="a347">4.2. Не предпринимать действий, направленных на взлом, реверс-инжиниринг кода Сервиса, обход ограничений доступа (DRM/Tests) или нарушение нормальной работы PWA.</p>
  <p data-static-style="a347">4.3. Не использовать автоматизированные скрипты (парсинг, граббинг) для массовой загрузки материалов библиотеки.</p>
  <p data-static-style="a347"><strong>Администрация имеет право:</strong></p>
  <p data-static-style="a347">4.4. Модерировать и удалять Пользовательский контент без объяснения причин.</p>
  <p data-static-style="a347">4.5. Вносить изменения в каталог библиотеки, удалять или добавлять книги без предварительного уведомления Пользователя.</p>
  <p data-static-style="a347">4.6. Ограничить доступ к Сервису для Пользователя в случае нарушения условий настоящего Соглашения.</p>

  <h3 data-static-style="a346">5. Отказ от ответственности</h3>
  <p data-static-style="a347">5.1. <strong>«Как есть»:</strong> Сервис предоставляется на условиях «как есть» (as is). Администрация не предоставляет гарантий безошибочной и бесперебойной работы PWA.</p>
  <p data-static-style="a347">5.2. <strong>Не гарантируется:</strong> Администрация не гарантирует, что материалы библиотеки подходят для достижения конкретных практических целей Пользователя. Техническая информация может устаревать ввиду быстрого развития технологий.</p>
  <p data-static-style="a347">5.3. <strong>Ограничение ответственности:</strong> Администрация ни при каких обстоятельствах не несет ответственности за прямой или косвенный ущерб, причиненный Пользователю или третьим лицам в результате:</p>
  <p data-static-style="a348">— Незаконного использования Пользователем информации, полученной в Сервисе (включая уголовное преследование за хакерскую деятельность);<br>— Ошибок и уязвимостей в программном обеспечении, описанном в книгах библиотеки.</p>

  <h3 data-static-style="a346">6. Заключительные положения</h3>
  <p data-static-style="a347">6.1. Администрация оставляет за собой право в одностороннем порядке изменять текст настоящего Соглашения. Изменения вступают в силу с момента их публикации в Сервисе.</p>
  <p data-static-style="a349">6.2. Продолжение использования Сервиса после внесения изменений означает согласие Пользователя с новой редакцией Соглашения.</p>
`;

const PRIVACY_POLICY_HTML = `
  <h2 data-static-style="a345">Политика конфиденциальности</h2>
  <p data-static-style="a347"><strong>Прогрессивное веб-приложение «Aegis»</strong></p>
  <p data-static-style="a347">Настоящая Политика конфиденциальности (далее — «Политика») определяет, какие данные собирает и обрабатывает сервис «Aegis» (далее — «Сервис» или «PWA»), как они используются и защищаются.</p>
  <p data-static-style="a204">Мы серьезно относимся к конфиденциальности, особенно с учетом образовательной направленности нашего продукта в сфере кибербезопасности.</p>

  <h3 data-static-style="a346">1. Основные понятия</h3>
  <p data-static-style="a347">1.1. <strong>PWA (Progressive Web App)</strong> — веб-приложение, которое работает в браузере Пользователя и может быть установлено на устройство для офлайн-доступа.</p>
  <p data-static-style="a347">1.2. <strong>Персональные данные</strong> — любая информация, относящаяся к прямо или косвенно определенному или определяемому физическому лицу.</p>
  <p data-static-style="a347">1.3. <strong>Обезличенные данные</strong> — данные, которые не могут быть использованы для идентификации конкретного Пользователя без дополнительной информации.</p>
  <p data-static-style="a347">1.4. <strong>Service Worker</strong> — программный скрипт, работающий в фоновом режиме браузера и отвечающий за кэширование контента для офлайн-доступа.</p>

  <h3 data-static-style="a346">2. Какие данные мы собираем и зачем</h3>
  <p data-static-style="a347">2.1. <strong>Данные для работы аккаунта (опционально):</strong> адрес электронной почты, никнейм, хэшированный пароль. Цель — идентификация Пользователя, синхронизация прогресса чтения и закладок между устройствами. Основание — исполнение договора.</p>
  <p data-static-style="a347">2.2. <strong>Данные о прогрессе чтения:</strong> список прочитанных книг, страницы, закладки и текстовые заметки. Цель — продолжить чтение с того же места. Хранение — локально на устройстве (IndexedDB / LocalStorage); при использовании аккаунта — на сервере в зашифрованном виде.</p>
  <p data-static-style="a347">2.3. <strong>Данные, собираемые автоматически (обезличенные):</strong> логи сервера (IP-адрес, тип браузера, дата и время запроса, HTTP-статус, объем данных) хранятся до 14 дней; данные PWA-кэша (манифест, иконки, шрифты). Аналитика: мы не используем Google Analytics или Яндекс.Метрику, не используем cookie слежения и не создаём цифровой отпечаток.</p>
  <p data-static-style="a347">2.4. <strong>Данные для офлайн-доступа:</strong> текст, разметка и изображения открытых книг сохраняются в Cache API. Это техническая основа работы PWA. Вы можете очистить кэш через настройки браузера.</p>

  <h3 data-static-style="a346">3. Правовые основания обработки (GDPR / 152-ФЗ)</h3>
  <p data-static-style="a348">— <strong>Согласие:</strong> при первой установке PWA или первом открытии книги.<br>— <strong>Исполнение договора:</strong> для сохранения закладок и прогресса.<br>— <strong>Законный интерес:</strong> базовая безопасность и обезличенная статистика.</p>

  <h3 data-static-style="a346">4. Cookie и Web Storage</h3>
  <p data-static-style="a347">4.1. Сервис использует технические сессионные данные, необходимые для работы интерфейса.</p>
  <p data-static-style="a347">4.2. <strong>Мы принципиально не используем:</strong> сторонние рекламные и трекинговые cookie; скрытый майнинг; сбор данных из буфера обмена без вашего действия.</p>
  <p data-static-style="a347">4.3. Вы можете запретить Local Storage в настройках браузера, но это нарушит работу приложения (офлайн-чтение и сохранение прогресса).</p>

  <h3 data-static-style="a346">5. Передача данных третьим лицам</h3>
  <p data-static-style="a347">5.1. Мы не продаем, не передаем и не раскрываем информацию о том, какие книги вы читаете и какие заметки оставляете.</p>
  <p data-static-style="a347">5.2. <strong>Исключения:</strong> по законному запросу государственных органов РФ; хостинг- и CDN-провайдеру (исключительно для доставки файлов на ваше устройство).</p>

  <h3 data-static-style="a346">6. Безопасность данных</h3>
  <p data-static-style="a347">6.1. Обмен данными по HTTPS (TLS 1.3); внедрены заголовки безопасности (CSP, HSTS); инфраструктура регулярно сканируется на уязвимости.</p>
  <p data-static-style="a347">6.2. 100% безопасности в сети не существует. Рекомендуем использовать сложные пароли и не хранить чувствительную информацию в публичных заметках.</p>

  <h3 data-static-style="a346">7. Права Пользователя</h3>
  <p data-static-style="a348">1. <strong>На доступ:</strong> запросить перечень хранимых данных.<br>2. <strong>На удаление:</strong> потребовать удалить аккаунт и связанные данные.<br>3. <strong>На возражение:</strong> отказаться от уведомлений.<br>4. <strong>На локальное удаление:</strong> стереть данные PWA через «Очистить историю» → «Данные сайтов».</p>
  <p data-static-style="a347">Для реализации прав напишите на <strong>support@aegis-sec-library.ru</strong> с темой «Запрос конфиденциальности». Мы ответим в течение 10 рабочих дней. Возможно, потребуется подтвердить вашу личность.</p>

  <h3 data-static-style="a346">8. Изменения Политики</h3>
  <p data-static-style="a347">8.1. Мы можем вносить изменения. При существенных изменениях уведомим через интерфейс приложения.</p>
  <p data-static-style="a349">8.2. Новая редакция вступает в силу с момента публикации.</p>
`;

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

function renderSettingsHelpTab(c) {
  const content = _accountNode('div', 'a374');
  const helpCard = (title, description, style = 'a375') => {
    const card = _accountNode('div', style);
    card.append(_accountNode('div', title === 'Связь с поддержкой' ? 'a380' : 'a376', title));
    card.append(_accountNode('p', 'a377', description));
    return card;
  };

  const tour = helpCard('Знакомство с приложением', 'Короткий тур по основным разделам: библиотека, тестирование, AI-ассистент и схемы атак.');
  const tourButton = _accountNode('button', 'a378', 'Пройти обучение заново');
  tourButton.type = 'button';
  tourButton.addEventListener('click', replayOnboardingTour);
  tour.appendChild(tourButton);

  const install = helpCard('Установка приложения', 'Установите Aegis на телефон или планшет для быстрого доступа с домашнего экрана.');
  const installButton = _accountNode('button', 'a379', 'Установить приложение');
  installButton.type = 'button';
  installButton.addEventListener('click', triggerInstall);
  install.appendChild(installButton);

  const support = helpCard('Связь с поддержкой', 'При возникновении вопросов или проблем пишите на почту:');
  const email = _accountNode('a', 'a381', 'support@aegis-sec-library.ru');
  email.href = 'mailto:support@aegis-sec-library.ru';
  support.appendChild(email);

  const legal = helpCard('Правовые документы', 'Условия использования платформы Aegis и порядок обработки данных.', 'a382');
  const legalActions = _accountNode('div', 'a093');
  const agreement = _accountNode('button', 'a383', 'Пользовательское соглашение');
  agreement.type = 'button';
  agreement.addEventListener('click', openUserAgreement);
  const privacy = _accountNode('button', 'a383', 'Политика конфиденциальности');
  privacy.type = 'button';
  privacy.addEventListener('click', openPrivacyPolicy);
  legalActions.append(agreement, privacy);
  legal.appendChild(legalActions);

  content.append(tour, install, support, legal);
  c.replaceChildren(content);
}

function _openLegalModal(titleText, html) {
  let modal = document.getElementById('legalDocModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'legalDocModal';
    modal.style.cssText = 'position:fixed;inset:0;background:var(--bg-primary);z-index:4000;display:flex;flex-direction:column;';
    document.body.appendChild(modal);
  }

  const closeLegalModal = () => modal.remove();
  const header = _accountNode('div', 'a384');
  const closeButton = _accountNode('button', 'a386', '✕');
  closeButton.type = 'button';
  closeButton.addEventListener('click', closeLegalModal);
  header.append(_accountNode('div', 'a385', titleText), closeButton);

  const content = _accountNode('div', 'a387');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  [...parsed.body.childNodes].forEach(node => {
    content.appendChild(document.importNode(node, true));
  });

  const footer = _accountNode('div', 'a388');
  const doneButton = _accountNode('button', 'a389', 'Закрыть');
  doneButton.type = 'button';
  doneButton.addEventListener('click', closeLegalModal);
  footer.appendChild(doneButton);

  modal.replaceChildren(header, content, footer);
}

function openUserAgreement() {
  _openLegalModal('Пользовательское соглашение', USER_AGREEMENT_HTML);
}

function openPrivacyPolicy() {
  _openLegalModal('Политика конфиденциальности', PRIVACY_POLICY_HTML);
}

function renderSettingsPrivacyTab(c) {
  const current = state.currentUser.profile_visibility || 'public';
  const options = [
    { value: 'public', label: 'Публичный', desc: 'Профиль доступен всем авторизованным пользователям' },
    { value: 'colleagues', label: 'Только для коллег', desc: 'Видят только пользователи твоего подразделения' },
    { value: 'private', label: 'Приватный', desc: 'Профиль скрыт от всех, кроме тебя' },
  ];

  const notice = _accountNode('div', 'a390');
  notice.append(
    _accountNode('span', 'a391', 'ⓘ'),
    _accountNode(
      'div',
      'a392',
      'В публичном профиле ваш email показывается замаскированным (например i***n@mail.ru). Приватный профиль скрыт от всех.',
    ),
  );

  const visibilityRow = document.createElement('div');
  visibilityRow.className = 'set-row';
  visibilityRow.appendChild(_accountNode('label', null, 'Отображение профиля'));
  const choices = _accountNode('div', 'a393');
  options.forEach(option => {
    const selected = current === option.value;
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute(
      'data-dynamic-style',
      dynamicStyleToken`text-align:left;display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:${selected ? 'var(--accent-gradient)' : 'transparent'};border:none;border-radius:8px;cursor:pointer;font-family:inherit;color:${selected ? '#fff' : 'var(--text-primary)'};`,
    );
    button.addEventListener('click', () => setPrivacyVisibility(option.value));

    const radio = document.createElement('div');
    radio.setAttribute(
      'data-dynamic-style',
      dynamicStyleToken`width:18px;height:18px;border-radius:50%;border:2px solid ${selected ? '#fff' : 'var(--border-light)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;`,
    );
    if (selected) radio.appendChild(_accountNode('div', 'a394'));
    const copy = _accountNode('div', 'a004');
    copy.append(
      _accountNode('div', 'a395', option.label),
      _accountNode('div', 'a396', option.desc),
    );
    button.append(radio, copy);
    choices.appendChild(button);
  });
  visibilityRow.appendChild(choices);

  const danger = _accountNode('div', 'a397');
  danger.appendChild(_accountNode('label', 'a398', 'Опасная зона'));
  const deleteButton = _accountNode('button', 'a399');
  deleteButton.className = 'set-save-btn';
  deleteButton.type = 'button';
  deleteButton.appendChild(document.createElement('span')).textContent = 'Удалить аккаунт';
  deleteButton.addEventListener('click', confirmDeleteAccount);
  danger.append(
    deleteButton,
    _accountNode(
      'div',
      'a369',
      'Безвозвратно удаляет аккаунт и все данные: списки, заметки, прогресс, результаты тестов, коллекции.',
    ),
  );

  c.replaceChildren(
    _accountNode('h3', 'a350', 'Приватность'),
    notice,
    visibilityRow,
    danger,
  );
}

function confirmDeleteAccount() {
  const ex = document.getElementById('deleteAccModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'deleteAccModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  const dialog = _accountNode('div', 'a400');
  dialog.appendChild(_accountNode('h3', 'a401', 'Удалить аккаунт?'));
  const warning = _accountNode('p', 'a402');
  warning.append(
    document.createTextNode('Это действие необратимо. Все ваши данные будут удалены навсегда. Для подтверждения введите пароль и слово '),
    _accountNode('b', 'a154', 'УДАЛИТЬ'),
    document.createTextNode('.'),
  );
  const password = _accountNode('input', 'a403');
  password.id = 'delAccPassword';
  password.type = 'password';
  password.placeholder = 'Пароль';
  const confirmation = _accountNode('input', 'a404');
  confirmation.id = 'delAccConfirm';
  confirmation.type = 'text';
  confirmation.placeholder = 'Введите УДАЛИТЬ';
  const actions = _accountNode('div', 'a108');
  const cancel = _accountNode('button', 'a405', 'Отмена');
  cancel.type = 'button';
  cancel.addEventListener('click', () => m.remove());
  const remove = _accountNode('button', 'a406', 'Удалить');
  remove.type = 'button';
  remove.addEventListener('click', doDeleteAccount);
  actions.append(cancel, remove);
  dialog.append(warning, password, confirmation, actions);
  m.appendChild(dialog);
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  document.body.appendChild(m);
}

async function doDeleteAccount() {
  const pwd = document.getElementById('delAccPassword')?.value || '';
  const conf = document.getElementById('delAccConfirm')?.value || '';
  if (!pwd || !conf) { showToast('Заполните оба поля'); return; }
  try {
    await api.library.deleteAccount(pwd, conf);
    const m = document.getElementById('deleteAccModal');
    if (m) m.remove();
    showToast('Аккаунт удалён');
    // Аккаунт уже удалён сервером, поэтому отдельный отзыв сессии здесь
    // может закономерно вернуть 401. Локальные данные всё равно очищаем.
    try { await api.logout(); } catch (_) { api.tokens.clear(); }
    clearNoteKey(); stopSyncPolling();
    setTimeout(() => location.reload(), 800);
  } catch (err) {
    const msg = err && err.detail ? err.detail : (err && err.status ? 'Ошибка ' + err.status : 'Не удалось удалить');
    showToast(msg);
  }
}

async function setPrivacyVisibility(value) {
  try {
    const updated = await api.updateMe({ profile_visibility: value });
    state.currentUser.profile_visibility = updated.profile_visibility;
    renderSettingsPrivacyTab(document.getElementById('settingsContent'));
    showToast('Настройка сохранена');
  } catch (e) {
    console.error(e);
    showToast('Не удалось сохранить');
  }
}

// --- Размер шрифта читалки (масштаб PDF/EPUB-текста) ---
const READER_FONT_KEY = 'aegis_reader_font';
function getReaderFontScale() { return parseInt(localStorage.getItem(READER_FONT_KEY) || '100', 10); }
function setReaderFontScale(pct) {
  localStorage.setItem(READER_FONT_KEY, String(pct));
  renderSettingsPersonalizationTab(document.getElementById('settingsContent'));
  showToast(`Шрифт читалки: ${pct}%`);
}

function _accountChoiceButton(label, selected, styleText, onClick, className) {
  const button = document.createElement('button');
  button.type = 'button';
  if (className) button.className = className;
  if (selected) button.classList.add('active');
  button.setAttribute('data-dynamic-style', dynamicStyleToken(styleText));
  button.addEventListener('click', onClick);
  if (label instanceof Node) button.appendChild(label);
  else button.textContent = String(label);
  return button;
}

function renderSettingsPersonalizationTab(c) {
  const currentTheme = getAppTheme();
  const currentGrid = getGridSize();
  const goal = getReadingGoal();
  const fontScale = getReaderFontScale();
  const booksGoal = getBooksGoal();

  const createRow = (labelText, content, hint) => {
    const row = document.createElement('div');
    row.className = 'set-row';
    row.append(_accountNode('label', null, labelText), content);
    if (hint) row.appendChild(_accountNode('div', 'a410', hint));
    return row;
  };
  const choiceStyle = (selected, extra = '') =>
    `flex:1;padding:10px;background:${selected ? 'var(--accent-gradient)' : 'transparent'};border:none;color:${selected ? '#fff' : 'var(--text-secondary)'};border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;${extra}`;

  const themeChoices = _accountNode('div', 'a407');
  [
    ['dark', 'themeMoon', 'Тёмная'],
    ['light', 'themeSun', 'Светлая'],
  ].forEach(([theme, iconName, label]) => {
    const selected = currentTheme === theme;
    const button = _accountChoiceButton(
      document.createDocumentFragment(),
      selected,
      choiceStyle(selected, 'display:inline-flex;align-items:center;justify-content:center;gap:6px;font-size:12px;font-weight:600;'),
      () => {
        setAppTheme(theme);
        renderSettingsPersonalizationTab(document.getElementById('settingsContent'));
      },
      'app-theme-btn',
    );
    appendTrustedIcon(button, ICONS[iconName]);
    button.appendChild(_accountNode('span', null, label));
    themeChoices.appendChild(button);
  });

  const gridChoices = _accountNode('div', 'a407');
  [2, 3, 4].forEach(count => {
    gridChoices.appendChild(
      _accountChoiceButton(
        count,
        currentGrid === count,
        choiceStyle(currentGrid === count, "font-family:'JetBrains Mono',monospace;"),
        () => setGridSize(count),
      ),
    );
  });

  const preview = _accountNode('div', 'a408');
  const previewGrid = document.createElement('div');
  previewGrid.id = 'gridPreview';
  previewGrid.setAttribute(
    'data-dynamic-style',
    dynamicStyleToken`display:grid;grid-template-columns:repeat(${currentGrid},1fr);gap:6px;`,
  );
  for (let index = 0; index < currentGrid * 2; index += 1) {
    previewGrid.appendChild(_accountNode('div', 'a409'));
  }
  preview.appendChild(previewGrid);

  const readingGoalChoices = _accountNode('div', 'a407');
  [10, 20, 30, 50].forEach(pageCount => {
    readingGoalChoices.appendChild(
      _accountChoiceButton(
        pageCount,
        goal === pageCount,
        choiceStyle(goal === pageCount, "font-family:'JetBrains Mono',monospace;"),
        () => setReadingGoal(pageCount),
      ),
    );
  });

  const booksGoalContent = document.createDocumentFragment();
  booksGoalContent.appendChild(_accountNode('div', 'a411', 'Выберите количество книг и период'));
  booksGoalContent.appendChild(_accountNode('div', 'a412', 'Количество книг'));
  const countChoices = _accountNode('div', 'a413');
  [5, 10, 15, 20, 30].forEach(count => {
    const selected = booksGoal?.count === count;
    countChoices.appendChild(
      _accountChoiceButton(
        count,
        selected,
        `min-width:52px;padding:12px 10px;border-radius:10px;border:1px solid ${selected ? 'transparent' : 'var(--border)'};background:${selected ? 'var(--accent-gradient)' : 'var(--bg-primary)'};color:${selected ? '#fff' : 'var(--text-secondary)'};cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:700;`,
        event => selectBooksGoalCount(count, event.currentTarget),
        'bg-count-btn',
      ),
    );
  });
  booksGoalContent.appendChild(countChoices);
  booksGoalContent.appendChild(_accountNode('div', 'a412', 'Или своё число'));
  const customCount = _accountNode('input', 'a414');
  customCount.id = 'booksGoalCount';
  customCount.type = 'number';
  customCount.inputMode = 'numeric';
  customCount.min = '1';
  customCount.max = '200';
  customCount.value = booksGoal?.count || '';
  customCount.placeholder = 'например, 12';
  booksGoalContent.appendChild(customCount);

  booksGoalContent.appendChild(_accountNode('div', 'a412', 'За какой период'));
  const periodChoices = _accountNode('div', 'a415');
  const currentPeriod = booksGoal?.period || 'quarter';
  [
    ['month', 'Месяц'],
    ['quarter', 'Квартал'],
    ['year', 'Год'],
  ].forEach(([period, label]) => {
    const selected = currentPeriod === period;
    periodChoices.appendChild(
      _accountChoiceButton(
        label,
        selected,
        `flex:1;padding:13px 8px;border-radius:10px;border:1px solid ${selected ? 'transparent' : 'var(--border)'};background:${selected ? 'var(--accent-gradient)' : 'var(--bg-primary)'};color:${selected ? '#fff' : 'var(--text-secondary)'};cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;`,
        event => selectBooksGoalPeriod(period, event.currentTarget),
        'bg-period-btn',
      ),
    );
  });
  booksGoalContent.appendChild(periodChoices);
  booksGoalContent.appendChild(
    _accountSaveButton('Сохранить цель', saveBooksGoalFromUI, 'a416'),
  );
  if (booksGoal) {
    booksGoalContent.appendChild(
      _accountSaveButton('Снять цель', () => setBooksGoal(0), 'a417'),
    );
  }
  booksGoalContent.appendChild(
    _accountNode('div', 'a418', 'Прогресс-бар появится на главной странице'),
  );
  const booksGoalRow = document.createElement('div');
  booksGoalRow.className = 'set-row';
  booksGoalRow.append(_accountNode('label', null, 'Цель: сколько книг прочитать'), booksGoalContent);

  const fontChoices = _accountNode('div', 'a407');
  [
    [90, 'А-'],
    [100, 'А'],
    [115, 'А+'],
    [130, 'А++'],
  ].forEach(([scale, label]) => {
    fontChoices.appendChild(
      _accountChoiceButton(
        label,
        fontScale === scale,
        choiceStyle(fontScale === scale),
        () => setReaderFontScale(scale),
      ),
    );
  });

  c.replaceChildren(
    _accountNode('h3', 'a350', 'Персонализация'),
    createRow('Тема приложения', themeChoices),
    createRow('Карточек книг в ряд', gridChoices),
    createRow('Предпросмотр', preview, 'Изменения применяются ко всему каталогу'),
    createRow('Цель чтения (страниц в день)', readingGoalChoices, 'Цель отображается в профиле и тепловой карте'),
    booksGoalRow,
    createRow('Размер шрифта в читалке', fontChoices, 'Масштаб страницы при открытии книги'),
  );
}

function setGridSize(n) {
  applyGridSize(n);
  // Перерисуем экран настроек чтобы обновить активную кнопку и предпросмотр
  renderSettingsPersonalizationTab(document.getElementById('settingsContent'));
  // Если открыта главная — перерисуем каталог
  if (state.currentScreen === 'home') renderHome();
  showToast(`Карточек в ряд: ${n}`);
}

function _accountLabeledInput(labelText, input) {
  const row = document.createElement('div');
  row.className = 'set-row';
  row.append(_accountNode('label', null, labelText), input);
  return row;
}

function _accountFormInput(type, id, placeholder, autocomplete, maxLength) {
  const input = document.createElement('input');
  input.type = type;
  input.id = id;
  input.placeholder = placeholder;
  if (autocomplete) input.autocomplete = autocomplete;
  if (maxLength) input.maxLength = maxLength;
  return input;
}

function _accountSaveButton(text, onClick, staticStyle) {
  const button = _accountNode('button', staticStyle);
  button.className = 'set-save-btn';
  button.type = 'button';
  button.appendChild(document.createElement('span')).textContent = text;
  button.addEventListener('click', onClick);
  return button;
}

function renderSettingsSecurityTab(c) {
  const currentPassword = _accountFormInput('password', 'setCurrentPassword', 'Введите текущий пароль', 'current-password', 128);
  const newPassword = _accountFormInput('password', 'setNewPassword', 'Минимум 8 символов', 'new-password', 128);
  const repeatPassword = _accountFormInput('password', 'setNewPasswordConfirm', 'Ещё раз новый пароль', 'new-password', 128);
  const passwordError = _accountNode('div', 'a420');
  passwordError.id = 'setPasswordError';

  const emailSection = _accountNode('div', 'a421');
  emailSection.appendChild(_accountNode('h3', 'a422', 'Смена email'));
  const currentEmail = _accountNode('div', 'a423');
  currentEmail.append(
    document.createTextNode('Текущий email: '),
    _accountNode('strong', 'a424', state.currentUser?.email || 'не указан'),
    document.createTextNode('. На новый адрес придёт код подтверждения.'),
  );
  emailSection.appendChild(currentEmail);

  const stepOne = document.createElement('div');
  stepOne.id = 'emailStep1';
  const newEmail = _accountFormInput('email', 'setNewEmail', 'new@example.com', 'email');
  const emailPassword = _accountFormInput('password', 'setEmailPassword', 'Ваш пароль', 'current-password');
  const emailError = _accountNode('div', 'a420');
  emailError.id = 'setEmailError';
  stepOne.append(
    _accountLabeledInput('Новый email', newEmail),
    _accountLabeledInput('Пароль (для подтверждения)', emailPassword),
    emailError,
    _accountSaveButton('Отправить код подтверждения', requestEmailChangeUI),
  );

  const stepTwo = _accountNode('div', 'a279');
  stepTwo.id = 'emailStep2';
  const emailCode = _accountFormInput('text', 'setEmailCode', '6-значный код', null, 6);
  emailCode.inputMode = 'numeric';
  const emailErrorTwo = _accountNode('div', 'a420');
  emailErrorTwo.id = 'setEmailError2';
  stepTwo.append(
    _accountNode('div', 'a425', 'Код отправлен на новый адрес. Введите его ниже.'),
    _accountLabeledInput('Код из письма', emailCode),
    emailErrorTwo,
    _accountSaveButton('Подтвердить смену email', confirmEmailChangeUI),
    _accountSaveButton(
      'Отмена',
      () => renderSettingsSecurityTab(document.getElementById('settingsContent')),
      'a426',
    ),
  );
  emailSection.append(stepOne, stepTwo);

  c.replaceChildren(
    _accountNode('h3', 'a350', 'Смена пароля'),
    _accountNode(
      'div',
      'a419',
      'Для смены пароля введи текущий пароль и новый пароль. Новый пароль должен быть не короче 8 символов и отличаться от текущего.',
    ),
    _accountLabeledInput('Текущий пароль', currentPassword),
    _accountLabeledInput('Новый пароль', newPassword),
    _accountLabeledInput('Повторите новый пароль', repeatPassword),
    passwordError,
    _accountSaveButton('Изменить пароль', saveSettingsPassword),
    emailSection,
  );
}

async function requestEmailChangeUI() {
  const email = (document.getElementById('setNewEmail').value || '').trim();
  const pwd = (document.getElementById('setEmailPassword').value || '');
  const err = document.getElementById('setEmailError');
  err.textContent = '';
  if (!email || !email.includes('@')) { err.textContent = 'Введите корректный email'; return; }
  if (!pwd) { err.textContent = 'Введите пароль'; return; }
  try {
    await api.requestEmailChange(email, pwd);
    document.getElementById('emailStep1').style.display = 'none';
    document.getElementById('emailStep2').style.display = 'block';
    showToast('Код отправлен на новый адрес');
  } catch (e) {
    err.textContent = e && e.detail ? e.detail : 'Не удалось отправить код';
  }
}

async function confirmEmailChangeUI() {
  const code = (document.getElementById('setEmailCode').value || '').trim();
  const err = document.getElementById('setEmailError2');
  err.textContent = '';
  if (!code) { err.textContent = 'Введите код'; return; }
  try {
    const updated = await api.confirmEmailChange(code);
    state.currentUser.email = updated.email;
    showToast('Email изменён');
    renderSettingsSecurityTab(document.getElementById('settingsContent'));
  } catch (e) {
    err.textContent = e && e.detail ? e.detail : 'Неверный код';
  }
}

async function saveSettingsPassword() {
  const current = (document.getElementById('setCurrentPassword').value || '');
  const newp = (document.getElementById('setNewPassword').value || '');
  const confirm = (document.getElementById('setNewPasswordConfirm').value || '');
  const errEl = document.getElementById('setPasswordError');
  errEl.textContent = '';

  if (!current) { errEl.textContent = 'Введите текущий пароль'; return; }
  if (newp.length < 8) { errEl.textContent = 'Новый пароль должен быть не короче 8 символов'; return; }
  if (newp !== confirm) { errEl.textContent = 'Новые пароли не совпадают'; return; }
  if (newp === current) { errEl.textContent = 'Новый пароль должен отличаться от текущего'; return; }

  try {
    await api.changePassword(current, newp);
    showToast('Пароль изменён');
    // Чистим поля для безопасности
    document.getElementById('setCurrentPassword').value = '';
    document.getElementById('setNewPassword').value = '';
    document.getElementById('setNewPasswordConfirm').value = '';
  } catch (e) {
    if (e.status === 401) {
      errEl.textContent = 'Текущий пароль неверный';
    } else if (e.status === 400) {
      errEl.textContent = e.detail || 'Ошибка при смене пароля';
    } else {
      errEl.textContent = 'Не удалось изменить пароль. Попробуйте позже.';
      console.error(e);
    }
  }
}

function renderSettingsInfoTab(c) {
  const user = state.currentUser;

  const avatarSection = _accountNode('div', 'a428');
  const avatar = _accountNode('div', 'a429');
  avatar.className = 'profile-avatar-lg';
  const avatarText = _accountNode('span', null, 'U');
  avatarText.id = 'settingsAvatarText';
  const avatarImage = _accountNode('img', 'a279');
  avatarImage.id = 'settingsAvatarImg';
  avatar.append(avatarText, avatarImage);

  const avatarUpload = _accountNode('input', 'a279');
  avatarUpload.id = 'settingsAvatarUpload';
  avatarUpload.type = 'file';
  avatarUpload.accept = 'image/*';
  avatar.addEventListener('click', () => avatarUpload.click());
  avatarUpload.addEventListener('change', uploadAvatar);
  const avatarHint = _accountNode(
    'div',
    'a430',
    'Кликни на аватар чтобы загрузить новое фото\n(JPEG/PNG/WEBP, до 2 МБ)',
  );
  avatarSection.append(avatar, avatarUpload, avatarHint);

  const username = _accountFormInput('text', 'setUsername', '', null);
  username.value = user.name || '';
  username.disabled = true;
  username.setAttribute('data-static-style', 'a431');
  const usernameRow = _accountLabeledInput('Никнейм (логин)', username);
  usernameRow.appendChild(
    _accountNode('div', 'a410', 'Изменение никнейма пока не поддерживается'),
  );

  const fullName = _accountFormInput('text', 'setFullName', 'Иванов Иван Иванович', null, 128);
  fullName.value = user.full_name || '';

  const department = document.createElement('select');
  department.id = 'setDepartment';
  [
    ['', '— Не указано —'],
    ['ЦКЗ', 'ЦКЗ'], ['ДПМ', 'ДПМ'], ['УБД', 'УБД'], ['УКИИ', 'УКИИ'],
    ['УКАИ', 'УКАИ'], ['УМК', 'УМК'], ['УЭК', 'УЭК'], ['ЦКГ', 'ЦКГ'],
    ['ЦУПКБ', 'ЦУПКБ'], ['ЦВВ', 'ЦВВ'], ['__other__', 'Другое...'],
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    department.appendChild(option);
  });
  const departmentOther = _accountFormInput('text', 'setDepartmentOther', 'Введите название', null, 64);
  departmentOther.setAttribute('data-static-style', 'a432');
  const departmentRow = _accountLabeledInput('Подразделение', department);
  departmentRow.appendChild(departmentOther);

  c.replaceChildren(
    _accountNode('h3', 'a350', 'Информация о профиле'),
    avatarSection,
    usernameRow,
    _accountLabeledInput('ФИО', fullName),
    departmentRow,
    _accountSaveButton('Сохранить изменения', saveSettingsInfo),
  );

  updateAvatar('settingsAvatarImg');
  if (avatarText) {
    avatarText.textContent = (user.name || 'U').charAt(0).toUpperCase();
    const image = document.getElementById('settingsAvatarImg');
    if (image && image.src && !image.src.endsWith('undefined') && image.style.display !== 'none') {
      avatarText.style.display = 'none';
    }
  }

  const knownDepartments = ['ЦКЗ', 'ДПМ', 'УБД', 'УКИИ', 'УКАИ', 'УМК', 'УЭК', 'ЦКГ', 'ЦУПКБ', 'ЦВВ'];
  if (user.department) {
    if (knownDepartments.includes(user.department)) {
      department.value = user.department;
      departmentOther.style.display = 'none';
    } else {
      department.value = '__other__';
      departmentOther.value = user.department;
      departmentOther.style.display = 'block';
    }
  }

  department.addEventListener('change', () => {
    if (department.value === '__other__') {
      departmentOther.style.display = 'block';
      departmentOther.focus();
    } else {
      departmentOther.style.display = 'none';
      departmentOther.value = '';
    }
  });
}

async function saveSettingsInfo() {
  const fullName = (document.getElementById('setFullName').value || '').trim();
  const depSelect = document.getElementById('setDepartment').value;
  let department = null;
  if (depSelect === '__other__') {
    department = (document.getElementById('setDepartmentOther').value || '').trim();
  } else if (depSelect) {
    department = depSelect;
  }

  try {
    const updated = await api.updateMe({
      full_name: fullName || null,
      department: department || null,
    });
    // Обновим state
    state.currentUser.full_name = updated.full_name;
    state.currentUser.department = updated.department;
    showToast('Изменения сохранены');
    renderProfile();
  } catch (e) {
    console.error(e);
    showToast('Ошибка: ' + (e.detail || e.message));
  }
}

// ========== EDIT PROFILE MODAL ==========
function openEditProfileModal() {
  if (!state.currentUser) return;
  const currentName = state.currentUser.full_name || '';
  document.getElementById('editFullName').value = currentName;
  // Кнопка «Удалить аватар» только если он есть
  const avatarSection = document.getElementById('editAvatarSection');
  if (avatarSection) {
    avatarSection.style.display = state.currentUser.has_avatar ? 'block' : 'none';
  }
  document.getElementById('editProfileModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('editFullName').focus(), 100);
}

function closeEditProfileModal() {
  document.getElementById('editProfileModal').classList.add('hidden');
}

async function saveProfileEdits() {
  const fullName = document.getElementById('editFullName').value.trim();
  const btn = document.getElementById('saveProfileBtn');
  btn.disabled = true;
  btn.textContent = 'Сохранение...';
  try {
    const updated = await api.updateMe({ full_name: fullName || null });
    // Обновляем state.currentUser
    state.currentUser.full_name = updated.full_name;
    state.currentUser.has_avatar = updated.has_avatar;
    closeEditProfileModal();
    renderProfile();
    updateAvatar('avatarHome');
    updateAvatar('avatarMylist');
    updateAvatar('avatarTraining');
    showToast('Имя обновлено');
  } catch (err) {
    if (err instanceof api.ApiError) {
      showToast('Ошибка: ' + (err.detail || err.status));
    } else {
      showToast('Сервер недоступен');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Сохранить';
  }
}
async function deleteCurrentAvatar() {
  if (!confirm('Удалить аватар? Будет показываться буква.')) return;
  const btn = document.getElementById('deleteAvatarBtn');
  btn.disabled = true;
  btn.textContent = 'Удаление...';
  try {
    const updated = await api.deleteAvatar();
    state.currentUser.has_avatar = updated.has_avatar;
    closeEditProfileModal();
    renderProfile();
    updateAvatar('avatarHome');
    updateAvatar('avatarMylist');
    updateAvatar('avatarTraining');
    showToast('Аватар удалён');
  } catch (err) {
    if (err instanceof api.ApiError) {
      showToast('Ошибка: ' + (err.detail || err.status));
    } else {
      showToast('Сервер недоступен');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Удалить аватар';
  }
}
async function uploadAvatar(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 2 * 1024 * 1024) {
    showToast('Файл слишком большой (макс 2 МБ)');
    e.target.value = '';
    return;
  }
  showToast('Загружаем аватар...');
  try {
    const updated = await api.uploadAvatar(f);
    state.currentUser.has_avatar = updated.has_avatar;
    renderProfile();
    updateAvatar('avatarHome');
    updateAvatar('avatarMylist');
    updateAvatar('avatarTraining');
    showToast('Аватар обновлён');
  } catch (err) {
    if (err instanceof api.ApiError) {
      showToast('Ошибка: ' + (err.detail || err.status));
    } else {
      showToast('Сервер недоступен');
    }
  } finally {
    e.target.value = '';
  }
}

async function showMyStatsModal() {
  const ex = document.getElementById('myStatsModal');
  if (ex) ex.remove();

  const modal = document.createElement('div');
  modal.id = 'myStatsModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px;';
  const dialog = _accountNode('div', 'a433');
  const header = _accountNode('div', 'a434');
  const close = _accountNode('button', 'a436', '✕');
  close.id = 'myStatsClose';
  close.type = 'button';
  header.append(_accountNode('h2', 'a435', 'Моя статистика'), close);
  const bodyContent = _accountNode('div', 'a437', 'Считаю…');
  bodyContent.id = 'myStatsBody';
  dialog.append(header, bodyContent);
  modal.appendChild(dialog);
  document.body.appendChild(modal);
  close.addEventListener('click', () => modal.remove());
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  // Подгружаем свежие данные
  try { await loadHeatmapFromApi(); } catch (_) {}
  let attempts = [];
  try { attempts = await api.library.myQuizAttempts(); } catch (_) {}

  const days = state.heatmapData || [];
  const totalPages = days.reduce((s, d) => s + (d.pages || 0), 0);
  const activeDays = days.filter(d => (d.pages || 0) > 0).length;
  // Оценка часов: ~1.8 мин на страницу
  const hours = Math.round((totalPages * 1.8 / 60) * 10) / 10;
  const goal = (typeof getReadingGoal === 'function') ? getReadingGoal() : 20;

  // Любимые категории — из mylist + books
  const catCount = {};
  Object.keys(state.mylist || {}).forEach(bid => {
    const b = (state.books || []).find(x => String(x.id) === String(bid));
    if (b) (b.categories || []).forEach(c => { catCount[c] = (catCount[c] || 0) + 1; });
  });
  const topCats = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Средний балл тестов
  const avgQuiz = attempts.length
    ? Math.round(attempts.reduce((s, a) => s + (a.percentage || 0), 0) / attempts.length)
    : null;
  const passedCount = attempts.filter(a => (a.percentage || 0) >= 60).length;

  // Динамика по неделям (последние ~12 недель)
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    weeks.push(chunk.reduce((s, d) => s + (d.pages || 0), 0));
  }
  const maxWeek = Math.max(1, ...weeks);

  // Статусы книг
  const statuses = Object.values(state.mylist || {});
  const reading = statuses.filter(s => s === 'reading').length;
  const completed = statuses.filter(s => s === 'completed').length;
  const planned = statuses.filter(s => s === 'planned').length;

  const body = document.getElementById('myStatsBody');
  if (!body) return;
  body.style.textAlign = 'left';
  body.style.padding = '0';
  body.style.color = 'var(--text-primary)';

  const createCard = (value, label, color) => {
    const card = _accountNode('div', 'a438');
    const number = document.createElement('div');
    number.setAttribute(
      'data-dynamic-style',
      dynamicStyleToken`font-size:24px;font-weight:800;color:${color};font-family:'JetBrains Mono',monospace;`,
    );
    number.textContent = String(value);
    card.append(number, _accountNode('div', 'a439', label));
    return card;
  };

  const summary = _accountNode('div', 'a440');
  summary.append(
    createCard(totalPages, 'страниц прочитано', 'var(--accent)'),
    createCard(hours + ' ч', 'примерно времени', '#a855f7'),
    createCard(activeDays, 'активных дней', '#10b981'),
    createCard(avgQuiz !== null ? avgQuiz + '%' : '—', 'средний балл тестов', '#f59e0b'),
  );

  const weeklySection = _accountNode('div', 'a441');
  const weeklyChart = _accountNode('div', 'a443');
  if (weeks.length) {
    weeks.forEach((weekPages) => {
      const bar = document.createElement('div');
      bar.title = `${weekPages} стр.`;
      bar.setAttribute(
        'data-dynamic-style',
        dynamicStyleToken`flex:1;min-width:4px;height:${Math.max(4, Math.round(weekPages / maxWeek * 70))}px;background:var(--accent-gradient);border-radius:3px 3px 0 0;`,
      );
      weeklyChart.appendChild(bar);
    });
  } else {
    weeklyChart.appendChild(_accountNode('div', 'a444', 'Нет данных'));
  }
  weeklySection.append(
    _accountNode('div', 'a442', 'Динамика по неделям'),
    weeklyChart,
    _accountNode('div', 'a410', 'Сумма страниц за каждую неделю (90 дней)'),
  );

  const categoriesSection = _accountNode('div', 'a441');
  categoriesSection.appendChild(_accountNode('div', 'a442', 'Любимые категории'));
  if (topCats.length) {
    topCats.forEach(([category, count]) => {
      const percentage = Math.round(count / topCats[0][1] * 100);
      const categoryRow = _accountNode('div', 'a347');
      const categoryHeader = _accountNode('div', 'a445');
      categoryHeader.append(
        _accountNode('span', null, category),
        _accountNode('span', 'a243', count),
      );
      const categoryTrack = _accountNode('div', 'a446');
      const categoryFill = document.createElement('div');
      categoryFill.setAttribute(
        'data-dynamic-style',
        dynamicStyleToken`height:100%;width:${percentage}%;background:var(--accent-gradient);`,
      );
      categoryTrack.appendChild(categoryFill);
      categoryRow.append(categoryHeader, categoryTrack);
      categoriesSection.appendChild(categoryRow);
    });
  } else {
    categoriesSection.appendChild(
      _accountNode('div', 'a192', 'Добавь книги в список, чтобы увидеть категории'),
    );
  }

  const bookStatuses = _accountNode('div', 'a447');
  bookStatuses.append(
    createCard(reading, 'читаю', '#3b82f6'),
    createCard(completed, 'прочитано', '#10b981'),
    createCard(planned, 'в планах', '#a855f7'),
  );

  body.replaceChildren(
    summary,
    weeklySection,
    categoriesSection,
    bookStatuses,
    _accountNode(
      'div',
      'a448',
      `Тестов пройдено: ${passedCount} из ${attempts.length} · Цель: ${goal} стр./день`,
    ),
  );
}

function updateAvatar(id) {
  const el = document.getElementById(id);
  if (!el || !state.currentUser) return;
  const u = state.currentUser;
  const displayName = u.full_name || u.name;
  if (u.has_avatar) {
    const img = document.createElement('img');
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    img.src = api.users.avatarUrl(u.id) + '?t=' + Date.now();
    img.onerror = () => { el.textContent = displayName.charAt(0).toUpperCase(); };
    el.replaceChildren();
    el.appendChild(img);
  } else {
    el.textContent = displayName.charAt(0).toUpperCase();
  }
}
