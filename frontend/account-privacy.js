// Legal documents, privacy controls and account deletion.

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
