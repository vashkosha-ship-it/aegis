// Legal documents, privacy controls and account deletion.

// Тексты документов живут на постоянных страницах /legal/*.html — у них есть
// адрес, их можно открыть без входа, распечатать и сослаться на них. Окно в
// приложении загружает текст оттуда же, поэтому редакция одна.
const LEGAL_DOCUMENTS = {
  terms: { title: 'Пользовательское соглашение', url: '/legal/terms.html' },
  privacy: { title: 'Политика конфиденциальности', url: '/legal/privacy.html' },
  consent: { title: 'Согласие на обработку персональных данных', url: '/legal/consent.html' },
};

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
  const consent = _accountNode('button', 'a383', 'Согласие на обработку данных');
  consent.type = 'button';
  consent.addEventListener('click', openPdConsent);
  legalActions.append(agreement, privacy, consent);
  legal.appendChild(legalActions);

  content.append(tour, install, support, legal);
  c.replaceChildren(content);
}

function _openLegalModal(titleText, url) {
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
  closeButton.setAttribute('aria-label', 'Закрыть');
  closeButton.addEventListener('click', closeLegalModal);
  header.append(_accountNode('div', 'a385', titleText), closeButton);

  const content = _accountNode('div', 'a387');
  content.appendChild(_accountNode('p', 'a204', 'Загрузка…'));

  const footer = _accountNode('div', 'a388');
  const pageLink = _accountNode('a', '', 'Открыть отдельной страницей');
  pageLink.className = 'legal-page-link';
  pageLink.href = url;
  pageLink.target = '_blank';
  pageLink.rel = 'noopener';
  const doneButton = _accountNode('button', 'a389', 'Закрыть');
  doneButton.type = 'button';
  doneButton.addEventListener('click', closeLegalModal);
  footer.append(pageLink, doneButton);

  modal.replaceChildren(header, content, footer);
  _loadLegalDocument(url).then(nodes => {
    if (!modal.isConnected) return;
    content.replaceChildren(...nodes);
  });
}

// Загрузить текст документа со страницы. Страница своя (тот же origin), но
// разметку всё равно не вставляем как есть: переносим только содержимое
// <main> без навигации и без скриптов, через DOMParser — он ничего не
// исполняет.
async function _loadLegalDocument(url) {
  const fallback = () => {
    const note = _accountNode('p', 'a204', 'Не удалось загрузить документ. Откройте его отдельной страницей: ');
    const link = _accountNode('a', '', url);
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    note.appendChild(link);
    return [note];
  };
  try {
    if (typeof fetch !== 'function') return fallback();
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) return fallback();
    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
    const main = parsed.getElementById('legalDocument');
    if (!main) return fallback();
    main.querySelectorAll('nav, script, style, link').forEach(node => node.remove());
    return [...main.childNodes].map(node => document.importNode(node, true));
  } catch (error) {
    console.warn('Не удалось загрузить правовой документ', url, error);
    return fallback();
  }
}

function openUserAgreement() {
  _openLegalModal(LEGAL_DOCUMENTS.terms.title, LEGAL_DOCUMENTS.terms.url);
}

function openPrivacyPolicy() {
  _openLegalModal(LEGAL_DOCUMENTS.privacy.title, LEGAL_DOCUMENTS.privacy.url);
}

function openPdConsent() {
  _openLegalModal(LEGAL_DOCUMENTS.consent.title, LEGAL_DOCUMENTS.consent.url);
}

// --- Повторное согласие -----------------------------------------------------
// Тем, кто зарегистрировался до отдельного согласия на обработку ПДн, и всем
// после выхода новой редакции документов. Окно блокирующее: принять или выйти.
let legalConsentOpen = false;

function maybeShowLegalConsent() {
  const user = state.currentUser;
  if (legalConsentOpen) return true;
  if (!user || !user.id || user.legal_consent_required !== true) return false;
  if (state.currentScreen === 'auth') return false;
  // Без сети согласие не отправить — не запираем офлайн-чтение. Окно
  // появится при следующем заходе с подключением.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  showLegalConsentPrompt();
  return true;
}

function showLegalConsentPrompt() {
  document.getElementById('legalConsentPrompt')?.remove();
  legalConsentOpen = true;

  const overlay = document.createElement('div');
  overlay.id = 'legalConsentPrompt';
  overlay.className = 'legal-consent-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'legalConsentTitle');

  const card = _accountNode('div', '');
  card.className = 'legal-consent-card';
  const title = _accountNode('h2', '', 'Обновлены правовые документы');
  title.id = 'legalConsentTitle';
  const intro = _accountNode('p', '', 'Чтобы продолжить, примите Пользовательское соглашение и Политику конфиденциальности и дайте отдельное согласие на обработку персональных данных.');

  const docs = _accountNode('div', '');
  docs.className = 'legal-consent-docs';
  [['terms', openUserAgreement], ['privacy', openPrivacyPolicy], ['consent', openPdConsent]].forEach(([key, open]) => {
    const button = _accountNode('button', '', LEGAL_DOCUMENTS[key].title);
    button.type = 'button';
    button.className = 'auth-legal-link';
    button.addEventListener('click', open);
    docs.appendChild(button);
  });

  const checkbox = (id, text) => {
    const label = _accountNode('label', '');
    label.className = 'auth-consent-label';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    label.append(input, _accountNode('span', '', text));
    return { label, input };
  };
  const terms = checkbox('legalConsentTerms', 'Принимаю Пользовательское соглашение и Политику конфиденциальности');
  const pd = checkbox('legalConsentPd', 'Даю согласие на обработку персональных данных, в том числе на их передачу поставщику ИИ-ассистента');
  const boxes = _accountNode('div', '');
  boxes.className = 'auth-consent-field';
  boxes.append(terms.label, pd.label);

  const actions = _accountNode('div', '');
  actions.className = 'legal-consent-actions';
  const accept = _accountNode('button', '', 'Принять и продолжить');
  accept.type = 'button';
  accept.className = 'btn btn-primary';
  accept.disabled = true;
  const leave = _accountNode('button', '', 'Выйти из аккаунта');
  leave.type = 'button';
  leave.className = 'btn-quiz';
  actions.append(accept, leave);

  const sync = () => { accept.disabled = !(terms.input.checked && pd.input.checked); };
  terms.input.addEventListener('change', sync);
  pd.input.addEventListener('change', sync);

  accept.addEventListener('click', async () => {
    accept.disabled = true;
    try {
      const updated = await api.acceptLegalDocuments();
      if (state.currentUser) state.currentUser.legal_consent_required = updated.legal_consent_required === true;
      overlay.remove();
      legalConsentOpen = false;
      if (typeof onAppScreenShown === 'function') onAppScreenShown();
    } catch (error) {
      console.error('Не удалось сохранить согласие', error);
      showToast('Не удалось сохранить согласие. Проверьте связь и попробуйте ещё раз.');
      sync();
    }
  });
  leave.addEventListener('click', () => {
    overlay.remove();
    legalConsentOpen = false;
    if (typeof logout === 'function') logout();
  });

  card.append(title, intro, docs, boxes, actions);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  terms.input.focus({ preventScroll: true });
}

function renderSettingsPrivacyTab(c) {
  const current = state.currentUser.profile_visibility || 'public';
  const options = [
    { value: 'public', label: 'Публичный', desc: 'Профиль доступен всем авторизованным пользователям' },
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
  const deletedUserId = currentOfflineUserId();
  try {
    await api.library.deleteAccount(pwd, conf);
    const m = document.getElementById('deleteAccModal');
    if (m) m.remove();
    showToast('Аккаунт удалён');
    // Аккаунт уже удалён сервером, поэтому отдельный отзыв сессии здесь
    // может закономерно вернуть 401. Локальные данные всё равно очищаем.
    try { await api.logout(); } catch (_) { /* Аккаунт уже удалён. */ }
    await clearLocalSession(deletedUserId);
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
