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

function renderSettingsScreen() {
  // Заполнить навигацию (один раз)
  document.querySelectorAll('.settings-tab').forEach(btn => {
    const tabId = btn.dataset.stab;
    const tab = SETTINGS_TABS.find(t => t.id === tabId);
    if (!tab) return;
    if (!btn.innerHTML.trim()) {
      btn.innerHTML = `${ICONS[tab.icon]}<span>${tab.label}</span>`;
    }
    btn.classList.toggle('active', tabId === settingsCurrentTab);
  });

  // Иконка для кнопки выхода
  const logoutIc = document.getElementById('logoutIcon');
  if (logoutIc && !logoutIc.innerHTML.trim()) logoutIc.innerHTML = ICONS.iconLogout;

  renderSettingsTabContent();
}

function openSettingsTab(tabId) {
  settingsCurrentTab = tabId;
  document.querySelectorAll('.settings-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.stab === tabId);
  });
  renderSettingsTabContent();
}

async function renderSettingsStorageTab(c) {
  c.innerHTML = `
    <h3 data-static-style="a350">Данные и память</h3>
    <div id="storageStatsContent" data-static-style="a351">
      ${ICONS.iconDatabase}
      <div data-static-style="a352">Подсчёт...</div>
    </div>
  `;

  const stats = await getStorageStats();
  const cont = document.getElementById('storageStatsContent');
  if (!cont) return;

  const usedPct = stats.quota > 0 ? Math.round((stats.used / stats.quota) * 100) : 0;
  const wifiOnly = isWifiOnlyEnabled();

  cont.style.textAlign = 'left';
  cont.style.padding = '0';
  cont.innerHTML = `
    <div data-static-style="a353">
      <div data-static-style="a354">
        <div data-static-style="a355">ИСПОЛЬЗОВАНО</div>
        <div data-static-style="a356">${formatBytes(stats.used)}</div>
      </div>
      <div data-static-style="a357">
        <div data-dynamic-style="${dynamicStyleToken`height:100%;width:${usedPct}%;background:var(--accent-gradient);transition:width 0.3s;`}"></div>
      </div>
      <div data-static-style="a358">
        <span>${usedPct}% от доступного</span>
        <span>из ${formatBytes(stats.quota)}</span>
      </div>
    </div>

    <div data-static-style="a359">
      <div data-static-style="a360">
        <div data-static-style="a361">${formatBytes(stats.cacheSize)}</div>
        <div data-static-style="a344">Кэш приложения</div>
      </div>
      <div data-static-style="a360">
        <div data-static-style="a362">${stats.cacheCount}</div>
        <div data-static-style="a344">Файлов в кэше</div>
      </div>
    </div>

    <!-- Тумблер «только Wi-Fi» -->
    <div class="set-row" data-static-style="a363">
      <div data-static-style="a364">
        <div data-static-style="a004">
          <div data-static-style="a365">Скачивать только по Wi-Fi</div>
          <div data-static-style="a099">Экономия мобильного трафика</div>
        </div>
        <label class="toggle-switch" data-static-style="a366">
          <input type="checkbox" id="wifiOnlyToggle" ${wifiOnly ? 'checked' : ''} data-onchange="onWifiOnlyToggle()" data-args="this" data-static-style="a367">
          <span class="toggle-slider" data-dynamic-style="${dynamicStyleToken`position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${wifiOnly ? 'var(--accent)' : 'var(--bg-card-hover)'};transition:0.2s;border-radius:24px;pointer-events:none;`}">
            <span data-dynamic-style="${dynamicStyleToken`position:absolute;height:18px;width:18px;left:${wifiOnly ? '21px' : '3px'};bottom:3px;background:#fff;transition:0.2s;border-radius:50%;`}"></span>
          </span>
        </label>
      </div>
    </div>

    <!-- Тумблер автопредзагрузки -->
    <div class="set-row" data-static-style="a363">
      <div data-static-style="a364">
        <div data-static-style="a004">
          <div data-static-style="a365">Автосохранение книг офлайн</div>
          <div data-static-style="a099">Начатые книги автоматически скачиваются по Wi-Fi</div>
        </div>
        <label class="toggle-switch" data-static-style="a366">
          <input type="checkbox" id="autoPreloadToggle" ${isAutoPreloadEnabled() ? 'checked' : ''} data-onchange="onAutoPreloadToggle()" data-args="this" data-static-style="a367">
          <span class="toggle-slider" data-dynamic-style="${dynamicStyleToken`position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${isAutoPreloadEnabled() ? 'var(--accent)' : 'var(--bg-card-hover)'};transition:0.2s;border-radius:24px;pointer-events:none;`}">
            <span data-dynamic-style="${dynamicStyleToken`position:absolute;height:18px;width:18px;left:${isAutoPreloadEnabled() ? '21px' : '3px'};bottom:3px;background:#fff;transition:0.2s;border-radius:50%;`}"></span>
          </span>
        </label>
      </div>
    </div>

    <button class="set-save-btn" data-onclick="exportAllUserData()" data-nonce="${sensitiveNonce()}" data-static-style="a368">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      <span>Скачать все мои данные</span>
    </button>
    <div data-static-style="a369">
      Выгрузка всех ваших данных (профиль, списки, заметки, прогресс, результаты тестов) одним JSON-файлом.
    </div>

    <button class="set-save-btn" data-onclick="confirmClearCache()" data-static-style="a370">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
      <span>Очистить кэш</span>
    </button>

    <div data-static-style="a371">
      После очистки книги придётся скачать заново при следующем чтении. Прогресс чтения, заметки и достижения сохранятся.
    </div>
  `;
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
    c.innerHTML = `
      <div data-static-style="a372">
        <div data-static-style="a373">${tab ? tab.label : ''}</div>
        <div data-static-style="a253">Раздел будет доступен в ближайшее время</div>
      </div>
    `;
  }
}

function renderSettingsHelpTab(c) {
  c.innerHTML = `
    <div data-static-style="a374">
      <div data-static-style="a375">
        <div data-static-style="a376">Знакомство с приложением</div>
        <p data-static-style="a377">
          Короткий тур по основным разделам: библиотека, тестирование, AI-ассистент и схемы атак.
        </p>
        <button data-onclick="replayOnboardingTour()" data-static-style="a378">
          Пройти обучение заново
        </button>
      </div>

      <div data-static-style="a375">
        <div data-static-style="a376">Установка приложения</div>
        <p data-static-style="a377">
          Установите Aegis на телефон или планшет для быстрого доступа с домашнего экрана.
        </p>
        <button data-onclick="triggerInstall()" data-static-style="a379">
          Установить приложение
        </button>
      </div>

      <div data-static-style="a375">
        <div data-static-style="a380">Связь с поддержкой</div>
        <p data-static-style="a377">
          При возникновении вопросов или проблем пишите на почту:
        </p>
        <a href="mailto:support@aegis-sec-library.ru" data-static-style="a381">
          support@aegis-sec-library.ru
        </a>
      </div>

      <div data-static-style="a382">
        <div data-static-style="a376">Правовые документы</div>
        <p data-static-style="a377">
          Условия использования платформы Aegis и порядок обработки данных.
        </p>
        <div data-static-style="a093">
          <button data-onclick="openUserAgreement()" data-static-style="a383">
            Пользовательское соглашение
          </button>
          <button data-onclick="openPrivacyPolicy()" data-static-style="a383">
            Политика конфиденциальности
          </button>
        </div>
      </div>
    </div>`;
}

function _openLegalModal(titleText, html) {
  let m = document.getElementById('legalDocModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'legalDocModal';
    m.style.cssText = 'position:fixed;inset:0;background:var(--bg-primary);z-index:4000;display:flex;flex-direction:column;';
    document.body.appendChild(m);
  }
  m.innerHTML = `
    <div data-static-style="a384">
      <div data-static-style="a385">${eh(titleText)}</div>
      <button data-onclick="closeModal('legalDocModal')" data-static-style="a386">✕</button>
    </div>
    <div data-static-style="a387">
      ${html}
    </div>
    <div data-static-style="a388">
      <button data-onclick="closeModal('legalDocModal')" data-static-style="a389">Закрыть</button>
    </div>`;
}

function openUserAgreement() {
  _openLegalModal('Пользовательское соглашение', USER_AGREEMENT_HTML);
}

function openPrivacyPolicy() {
  _openLegalModal('Политика конфиденциальности', PRIVACY_POLICY_HTML);
}

function renderSettingsPrivacyTab(c) {
  const u = state.currentUser;
  const current = u.profile_visibility || 'public';

  const options = [
    { value: 'public',     label: 'Публичный',         desc: 'Профиль доступен всем авторизованным пользователям' },
    { value: 'colleagues', label: 'Только для коллег', desc: 'Видят только пользователи твоего подразделения' },
    { value: 'private',    label: 'Приватный',         desc: 'Профиль скрыт от всех, кроме тебя' },
  ];

  c.innerHTML = `
    <h3 data-static-style="a350">Приватность</h3>

    <div data-static-style="a390">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-static-style="a391"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <div data-static-style="a392">
        В публичном профиле ваш email показывается замаскированным (например i***n@mail.ru). Приватный профиль скрыт от всех.
      </div>
    </div>

    <div class="set-row">
      <label>Отображение профиля</label>
      <div data-static-style="a393">
        ${options.map(opt => `
          <button data-onclick="setPrivacyVisibility('${opt.value}')" data-dynamic-style="${dynamicStyleToken`text-align:left;display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:${current === opt.value ? 'var(--accent-gradient)' : 'transparent'};border:none;border-radius:8px;cursor:pointer;font-family:inherit;color:${current === opt.value ? '#fff' : 'var(--text-primary)'};`}">
            <div data-dynamic-style="${dynamicStyleToken`width:18px;height:18px;border-radius:50%;border:2px solid ${current === opt.value ? '#fff' : 'var(--border-light)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;`}">
              ${current === opt.value ? '<div data-static-style="a394"></div>' : ''}
            </div>
            <div data-static-style="a004">
              <div data-static-style="a395">${opt.label}</div>
              <div data-static-style="a396">${opt.desc}</div>
            </div>
          </button>
        `).join('')}
      </div>
    </div>

    <div data-static-style="a397">
      <label data-static-style="a398">Опасная зона</label>
      <button data-onclick="confirmDeleteAccount()" data-nonce="${sensitiveNonce()}" class="set-save-btn" data-static-style="a399">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        <span>Удалить аккаунт</span>
      </button>
      <div data-static-style="a369">
        Безвозвратно удаляет аккаунт и все данные: списки, заметки, прогресс, результаты тестов, коллекции.
      </div>
    </div>
  `;
}

function confirmDeleteAccount() {
  const ex = document.getElementById('deleteAccModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'deleteAccModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  m.innerHTML = `<div data-static-style="a400">
    <h3 data-static-style="a401">Удалить аккаунт?</h3>
    <p data-static-style="a402">Это действие необратимо. Все ваши данные будут удалены навсегда. Для подтверждения введите пароль и слово <b data-static-style="a154">УДАЛИТЬ</b>.</p>
    <input id="delAccPassword" type="password" placeholder="Пароль" data-static-style="a403">
    <input id="delAccConfirm" type="text" placeholder="Введите УДАЛИТЬ" data-static-style="a404">
    <div data-static-style="a108">
      <button data-onclick="closeModal('deleteAccModal')" data-static-style="a405">Отмена</button>
      <button data-onclick="doDeleteAccount()" data-nonce="${sensitiveNonce()}" data-static-style="a406">Удалить</button>
    </div>
  </div>`;
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

function renderSettingsPersonalizationTab(c) {
  const currentTheme = getAppTheme();
  const currentGrid = getGridSize();
  const goal = getReadingGoal();
  const fontScale = getReaderFontScale();

  c.innerHTML = `
    <h3 data-static-style="a350">Персонализация</h3>

    <!-- Тема -->
    <div class="set-row">
      <label>Тема приложения</label>
      <div data-static-style="a407">
        <button data-onclick="setAppTheme('dark');renderSettingsPersonalizationTab(document.getElementById('settingsContent'))" class="app-theme-btn ${currentTheme === 'dark' ? 'active' : ''}" data-dynamic-style="${dynamicStyleToken`flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:${currentTheme === 'dark' ? 'var(--accent-gradient)' : 'transparent'};border:none;color:${currentTheme === 'dark' ? '#fff' : 'var(--text-secondary)'};border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;`}">
          ${ICONS.themeMoon}<span>Тёмная</span>
        </button>
        <button data-onclick="setAppTheme('light');renderSettingsPersonalizationTab(document.getElementById('settingsContent'))" class="app-theme-btn ${currentTheme === 'light' ? 'active' : ''}" data-dynamic-style="${dynamicStyleToken`flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:${currentTheme === 'light' ? 'var(--accent-gradient)' : 'transparent'};border:none;color:${currentTheme === 'light' ? '#fff' : 'var(--text-secondary)'};border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;`}">
          ${ICONS.themeSun}<span>Светлая</span>
        </button>
      </div>
    </div>

    <!-- Карточек в ряд -->
    <div class="set-row">
      <label>Карточек книг в ряд</label>
      <div data-static-style="a407">
        ${[2, 3, 4].map(n => `
          <button data-onclick="setGridSize(${n})" data-dynamic-style="${dynamicStyleToken`flex:1;padding:10px;background:${currentGrid === n ? 'var(--accent-gradient)' : 'transparent'};border:none;color:${currentGrid === n ? '#fff' : 'var(--text-secondary)'};border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;font-family:'JetBrains Mono',monospace;`}">
            ${n}
          </button>
        `).join('')}
      </div>
    </div>

    <!-- Предпросмотр -->
    <div class="set-row">
      <label>Предпросмотр</label>
      <div data-static-style="a408">
        <div id="gridPreview" data-dynamic-style="${dynamicStyleToken`display:grid;grid-template-columns:repeat(${currentGrid},1fr);gap:6px;`}">
          ${Array.from({length: currentGrid * 2}, () => `
            <div data-static-style="a409">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
            </div>
          `).join('')}
        </div>
      </div>
      <div data-static-style="a410">Изменения применяются ко всему каталогу</div>
    </div>

    <!-- Цель чтения -->
    <div class="set-row">
      <label>Цель чтения (страниц в день)</label>
      <div data-static-style="a407">
        ${[10, 20, 30, 50].map(n => `
          <button data-onclick="setReadingGoal(${n})" data-dynamic-style="${dynamicStyleToken`flex:1;padding:10px;background:${goal === n ? 'var(--accent-gradient)' : 'transparent'};border:none;color:${goal === n ? '#fff' : 'var(--text-secondary)'};border-radius:8px;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;`}">
            ${n}
          </button>
        `).join('')}
      </div>
      <div data-static-style="a410">Цель отображается в профиле и тепловой карте</div>
    </div>

    <!-- Цель по книгам за период -->
    <div class="set-row">
      <label>Цель: сколько книг прочитать</label>
      <div data-static-style="a411">Выберите количество книг и период</div>

      <div data-static-style="a412">Количество книг</div>
      <div data-static-style="a413">
        ${[5, 10, 15, 20, 30].map(n => {
          const sel = (getBooksGoal()?.count) === n;
          return `<button type="button" data-onclick="selectBooksGoalCount(${n})" data-args="this" class="bg-count-btn" data-dynamic-style="${dynamicStyleToken`min-width:52px;padding:12px 10px;border-radius:10px;border:1px solid ${sel ? 'transparent' : 'var(--border)'};background:${sel ? 'var(--accent-gradient)' : 'var(--bg-primary)'};color:${sel ? '#fff' : 'var(--text-secondary)'};cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:700;`}">${n}</button>`;
        }).join('')}
      </div>

      <div data-static-style="a412">Или своё число</div>
      <input id="booksGoalCount" type="number" inputmode="numeric" min="1" max="200" value="${(getBooksGoal()?.count) || ''}" placeholder="например, 12" data-static-style="a414">

      <div data-static-style="a412">За какой период</div>
      <div data-static-style="a415">
        ${[{v:'month',l:'Месяц'},{v:'quarter',l:'Квартал'},{v:'year',l:'Год'}].map(o => {
          const cur = getBooksGoal()?.period || 'quarter';
          const sel = cur === o.v;
          return `<button type="button" data-onclick="selectBooksGoalPeriod('${o.v}')" data-args="this" class="bg-period-btn" data-dynamic-style="${dynamicStyleToken`flex:1;padding:13px 8px;border-radius:10px;border:1px solid ${sel ? 'transparent' : 'var(--border)'};background:${sel ? 'var(--accent-gradient)' : 'var(--bg-primary)'};color:${sel ? '#fff' : 'var(--text-secondary)'};cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;`}">${o.l}</button>`;
        }).join('')}
      </div>

      <button data-onclick="saveBooksGoalFromUI()" class="set-save-btn" data-static-style="a416">Сохранить цель</button>
      ${getBooksGoal() ? `<button data-onclick="setBooksGoal(0)" class="set-save-btn" data-static-style="a417">Снять цель</button>` : ''}
      <div data-static-style="a418">Прогресс-бар появится на главной странице</div>
    </div>

    <!-- Размер шрифта читалки -->
    <div class="set-row">
      <label>Размер шрифта в читалке</label>
      <div data-static-style="a407">
        ${[{p:90,l:'А-'},{p:100,l:'А'},{p:115,l:'А+'},{p:130,l:'А++'}].map(o => `
          <button data-onclick="setReaderFontScale(${o.p})" data-dynamic-style="${dynamicStyleToken`flex:1;padding:10px;background:${fontScale === o.p ? 'var(--accent-gradient)' : 'transparent'};border:none;color:${fontScale === o.p ? '#fff' : 'var(--text-secondary)'};border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;`}">
            ${o.l}
          </button>
        `).join('')}
      </div>
      <div data-static-style="a410">Масштаб страницы при открытии книги</div>
    </div>
  `;
}

function setGridSize(n) {
  applyGridSize(n);
  // Перерисуем экран настроек чтобы обновить активную кнопку и предпросмотр
  renderSettingsPersonalizationTab(document.getElementById('settingsContent'));
  // Если открыта главная — перерисуем каталог
  if (state.currentScreen === 'home') renderHome();
  showToast(`Карточек в ряд: ${n}`);
}

function renderSettingsSecurityTab(c) {
  c.innerHTML = `
    <h3 data-static-style="a350">Смена пароля</h3>

    <div data-static-style="a419">
      Для смены пароля введи текущий пароль и новый пароль. Новый пароль должен быть не короче 8 символов и отличаться от текущего.
    </div>

    <div class="set-row">
      <label>Текущий пароль</label>
      <input type="password" id="setCurrentPassword" autocomplete="current-password" placeholder="Введите текущий пароль" maxlength="128">
    </div>

    <div class="set-row">
      <label>Новый пароль</label>
      <input type="password" id="setNewPassword" autocomplete="new-password" placeholder="Минимум 8 символов" maxlength="128">
    </div>

    <div class="set-row">
      <label>Повторите новый пароль</label>
      <input type="password" id="setNewPasswordConfirm" autocomplete="new-password" placeholder="Ещё раз новый пароль" maxlength="128">
    </div>

    <div id="setPasswordError" data-static-style="a420"></div>

    <button class="set-save-btn" data-onclick="saveSettingsPassword()">
      ${ICONS.iconSave}<span>Изменить пароль</span>
    </button>

    <div data-static-style="a421">
      <h3 data-static-style="a422">Смена email</h3>
      <div data-static-style="a423">
        Текущий email: <strong data-static-style="a424">${eh(state.currentUser?.email || 'не указан')}</strong>.
        На новый адрес придёт код подтверждения.
      </div>

      <div id="emailStep1">
        <div class="set-row">
          <label>Новый email</label>
          <input type="email" id="setNewEmail" autocomplete="email" placeholder="new@example.com">
        </div>
        <div class="set-row">
          <label>Пароль (для подтверждения)</label>
          <input type="password" id="setEmailPassword" autocomplete="current-password" placeholder="Ваш пароль">
        </div>
        <div id="setEmailError" data-static-style="a420"></div>
        <button class="set-save-btn" data-onclick="requestEmailChangeUI()">Отправить код подтверждения</button>
      </div>

      <div id="emailStep2" data-static-style="a279">
        <div data-static-style="a425">Код отправлен на новый адрес. Введите его ниже.</div>
        <div class="set-row">
          <label>Код из письма</label>
          <input type="text" inputmode="numeric" id="setEmailCode" placeholder="6-значный код" maxlength="6">
        </div>
        <div id="setEmailError2" data-static-style="a420"></div>
        <button class="set-save-btn" data-onclick="confirmEmailChangeUI()">Подтвердить смену email</button>
        <button class="set-save-btn" data-onclick="renderSettingsSecurityTab(document.getElementById('settingsContent'))" data-static-style="a426">Отмена</button>
      </div>
    </div>

  `;
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
  const u = state.currentUser;
  c.innerHTML = `
    <h3 data-static-style="a350">Информация о профиле</h3>

    <!-- Аватар -->
    <div data-static-style="a428">
      <div class="profile-avatar-lg" data-static-style="a429" data-onclick="clickElement('settingsAvatarUpload')">
        <span id="settingsAvatarText">U</span>
        <img id="settingsAvatarImg" data-static-style="a279">
      </div>
      <input type="file" id="settingsAvatarUpload" accept="image/*" data-static-style="a279" data-onchange="uploadAvatar()" data-args="event">
      <div data-static-style="a430">
        Кликни на аватар чтобы загрузить новое фото<br>
        (JPEG/PNG/WEBP, до 2 МБ)
      </div>
    </div>

    <!-- Никнейм (только просмотр пока) -->
    <div class="set-row">
      <label>Никнейм (логин)</label>
      <input type="text" id="setUsername" value="${eh(u.name || '')}" disabled data-static-style="a431">
      <div data-static-style="a410">Изменение никнейма пока не поддерживается</div>
    </div>

    <!-- ФИО -->
    <div class="set-row">
      <label>ФИО</label>
      <input type="text" id="setFullName" value="${eh(u.full_name || '')}" placeholder="Иванов Иван Иванович" maxlength="128">
    </div>

    <!-- Подразделение -->
    <div class="set-row">
      <label>Подразделение</label>
      <select id="setDepartment">
        <option value="">— Не указано —</option>
        <option value="ЦКЗ">ЦКЗ</option>
        <option value="ДПМ">ДПМ</option>
        <option value="УБД">УБД</option>
        <option value="УКИИ">УКИИ</option>
        <option value="УКАИ">УКАИ</option>
        <option value="УМК">УМК</option>
        <option value="УЭК">УЭК</option>
        <option value="ЦКГ">ЦКГ</option>
        <option value="ЦУПКБ">ЦУПКБ</option>
        <option value="ЦВВ">ЦВВ</option>
        <option value="__other__">Другое...</option>
      </select>
      <input type="text" id="setDepartmentOther" placeholder="Введите название" maxlength="64" data-static-style="a432">
    </div>

    <button class="set-save-btn" data-onclick="saveSettingsInfo()">
      ${ICONS.iconSave}<span>Сохранить изменения</span>
    </button>
  `;

  // Применяем аватар
  updateAvatar('settingsAvatarImg');
  const avatarText = document.getElementById('settingsAvatarText');
  if (avatarText) {
    avatarText.textContent = (u.name || 'U').charAt(0).toUpperCase();
    const img = document.getElementById('settingsAvatarImg');
    if (img && img.src && !img.src.endsWith('undefined') && img.style.display !== 'none') {
      avatarText.style.display = 'none';
    }
  }

  // Подставляем текущее подразделение
  const depSelect = document.getElementById('setDepartment');
  const depOther = document.getElementById('setDepartmentOther');
  const KNOWN_DEPS = ['ЦКЗ','ДПМ','УБД','УКИИ','УКАИ','УМК','УЭК','ЦКГ','ЦУПКБ','ЦВВ'];
  if (u.department) {
    if (KNOWN_DEPS.includes(u.department)) {
      depSelect.value = u.department;
      depOther.style.display = 'none';
    } else {
      depSelect.value = '__other__';
      depOther.value = u.department;
      depOther.style.display = 'block';
    }
  }

  depSelect.addEventListener('change', () => {
    if (depSelect.value === '__other__') {
      depOther.style.display = 'block';
      depOther.focus();
    } else {
      depOther.style.display = 'none';
      depOther.value = '';
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
  modal.innerHTML = `<div data-static-style="a433">
    <div data-static-style="a434">
      <h2 data-static-style="a435">Моя статистика</h2>
      <button id="myStatsClose" data-static-style="a436">✕</button>
    </div>
    <div id="myStatsBody" data-static-style="a437">Считаю…</div>
  </div>`;
  document.body.appendChild(modal);
  document.getElementById('myStatsClose').onclick = () => modal.remove();
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

  const card = (val, label, color) => `
    <div data-static-style="a438">
      <div data-dynamic-style="${dynamicStyleToken`font-size:24px;font-weight:800;color:${color};font-family:'JetBrains Mono',monospace;`}">${val}</div>
      <div data-static-style="a439">${label}</div>
    </div>`;

  const body = document.getElementById('myStatsBody');
  if (!body) return;
  body.style.textAlign = 'left';
  body.style.padding = '0';
  body.style.color = 'var(--text-primary)';
  body.innerHTML = `
    <div data-static-style="a440">
      ${card(totalPages, 'страниц прочитано', 'var(--accent)')}
      ${card(hours + ' ч', 'примерно времени', '#a855f7')}
      ${card(activeDays, 'активных дней', '#10b981')}
      ${card(avgQuiz !== null ? avgQuiz + '%' : '—', 'средний балл тестов', '#f59e0b')}
    </div>

    <div data-static-style="a441">
      <div data-static-style="a442">Динамика по неделям</div>
      <div data-static-style="a443">
        ${weeks.map(w => `<div title="${w} стр." data-dynamic-style="${dynamicStyleToken`flex:1;min-width:4px;height:${Math.max(4, Math.round(w / maxWeek * 70))}px;background:var(--accent-gradient);border-radius:3px 3px 0 0;`}"></div>`).join('') || '<div data-static-style="a444">Нет данных</div>'}
      </div>
      <div data-static-style="a410">Сумма страниц за каждую неделю (90 дней)</div>
    </div>

    <div data-static-style="a441">
      <div data-static-style="a442">Любимые категории</div>
      ${topCats.length ? topCats.map(([cat, n]) => {
        const pct = Math.round(n / topCats[0][1] * 100);
        return `<div data-static-style="a347">
          <div data-static-style="a445"><span>${eh(cat)}</span><span data-static-style="a243">${n}</span></div>
          <div data-static-style="a446"><div data-dynamic-style="${dynamicStyleToken`height:100%;width:${pct}%;background:var(--accent-gradient);`}"></div></div>
        </div>`;
      }).join('') : '<div data-static-style="a192">Добавь книги в список, чтобы увидеть категории</div>'}
    </div>

    <div data-static-style="a447">
      ${card(reading, 'читаю', '#3b82f6')}
      ${card(completed, 'прочитано', '#10b981')}
      ${card(planned, 'в планах', '#a855f7')}
    </div>

    <div data-static-style="a448">
      Тестов пройдено: ${passedCount} из ${attempts.length} · Цель: ${goal} стр./день
    </div>
  `;
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
