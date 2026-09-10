// Authentication, registration, verification and session UI.
// Loaded as a classic script before app.js; public handlers intentionally remain global.

// ========== AUTH ==========
document.querySelectorAll('.auth-tab').forEach(t => t.addEventListener('click', function () {
  document.querySelectorAll('.auth-tab').forEach(x => x.classList.remove('active'));
  this.classList.add('active');
  state.currentTab = this.dataset.tab;
  const isRegister = state.currentTab === 'register';
  document.getElementById('registerEmailField').classList.toggle('hidden', !isRegister);
  document.getElementById('registerDepartmentField').classList.toggle('hidden', !isRegister);
  document.getElementById('registerFirstNameField').classList.toggle('hidden', !isRegister);
  document.getElementById('registerLastNameField').classList.toggle('hidden', !isRegister);
  document.getElementById('authPass').required = !isRegister;
  // Обновляем текст кнопки и заголовка формы
  const submitText = document.getElementById('authSubmitText');
  if (submitText) submitText.textContent = isRegister ? 'Зарегистрироваться' : 'Войти';
  else if (document.querySelector('#authForm .btn')) document.querySelector('#authForm .btn').textContent = isRegister ? 'Зарегистрироваться' : 'Войти';
  const title = document.getElementById('authFormTitle');
  const subtitle = document.getElementById('authFormSubtitle');
  const forgotHint = document.getElementById('forgotPasswordHint');
  if (title) title.textContent = isRegister ? 'Создать аккаунт' : 'С возвращением';
  if (subtitle) subtitle.textContent = isRegister ? 'Заполните данные для регистрации' : 'Войдите в свой аккаунт';
  if (forgotHint) forgotHint.style.display = isRegister ? 'none' : '';
}));

function authNode(tagName, text, staticStyle) {
  const node = document.createElement(tagName);
  if (staticStyle) node.setAttribute('data-static-style', staticStyle);
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function openForgotPassword() {
  let m = document.getElementById('forgotPasswordModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'forgotPasswordModal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:5000;display:flex;align-items:center;justify-content:center;padding:18px;';
    document.body.appendChild(m);
  }
  const panel = authNode('div', undefined, 'a272');
  const header = authNode('div', undefined, 'a273');
  const heading = authNode('h3', 'Восстановление пароля', 'a274');
  const close = authNode('button', '✕', 'a275');
  close.addEventListener('click', () => m.remove());
  header.append(heading, close);
  const firstStep = authNode('div');
  firstStep.id = 'fpStep1';
  const emailHint = authNode('p', 'Введите email, указанный при регистрации. Мы отправим код для сброса пароля.', 'a276');
  const email = authNode('input', undefined, 'a277');
  email.type = 'email';
  email.id = 'fpEmail';
  email.placeholder = 'Email';
  const send = authNode('button', 'Отправить код', 'a278');
  send.id = 'fpSendBtn';
  send.addEventListener('click', forgotPasswordSendCode);
  firstStep.append(emailHint, email, send);
  const secondStep = authNode('div', undefined, 'a279');
  secondStep.id = 'fpStep2';
  const codeHint = authNode('p', 'Введите код из письма и новый пароль.', 'a276');
  const code = authNode('input', undefined, 'a280');
  code.type = 'text';
  code.id = 'fpCode';
  code.placeholder = 'Код из письма';
  code.inputMode = 'numeric';
  const newPassword = authNode('input', undefined, 'a277');
  newPassword.type = 'password';
  newPassword.id = 'fpNewPass';
  newPassword.placeholder = 'Новый пароль (мин. 8 символов)';
  const reset = authNode('button', 'Сбросить пароль', 'a278');
  reset.id = 'fpResetBtn';
  reset.addEventListener('click', forgotPasswordReset);
  secondStep.append(codeHint, code, newPassword, reset);
  panel.append(header, firstStep, secondStep, authNode('p', 'При потере пароля доступ к ранее зашифрованным заметкам не восстанавливается.', 'a281'));
  m.replaceChildren(panel);
}

async function forgotPasswordSendCode() {
  const email = document.getElementById('fpEmail').value.trim();
  if (!email || !email.includes('@')) { showToast('Введите корректный email'); return; }
  const btn = document.getElementById('fpSendBtn');
  btn.disabled = true; btn.textContent = 'Отправляю…';
  try {
    await api.forgotPassword(email);
    window._fpEmail = email;
    document.getElementById('fpStep1').style.display = 'none';
    document.getElementById('fpStep2').style.display = 'block';
    showToast('Если email зарегистрирован, код отправлен');
  } catch (e) {
    showToast('Не удалось отправить код, попробуйте позже');
    btn.disabled = false; btn.textContent = 'Отправить код';
  }
}

async function forgotPasswordReset() {
  const code = document.getElementById('fpCode').value.trim();
  const newPass = document.getElementById('fpNewPass').value;
  if (!code) { showToast('Введите код из письма'); return; }
  if (newPass.length < 8) { showToast('Пароль: минимум 8 символов'); return; }
  const btn = document.getElementById('fpResetBtn');
  btn.disabled = true; btn.textContent = 'Сбрасываю…';
  try {
    await api.resetPassword(window._fpEmail, code, newPass);
    showToast('Пароль изменён, выполняется вход…');
    document.getElementById('forgotPasswordModal').remove();
    const user = await api.me();
    if (typeof deriveNoteKey === 'function') await deriveNoteKey(newPass, user.username);
    location.reload();
  } catch (e) {
    const msg = (e && (e.detail || (e.body && e.body.detail))) || 'Неверный код или истёк срок';
    showToast(msg);
    btn.disabled = false; btn.textContent = 'Сбросить пароль';
  }
}

function replacePasswordEyeIcon(icon, passwordVisible) {
  if (!icon) return;
  const svgNs = 'http://www.w3.org/2000/svg';
  const addShape = (tagName, attributes) => {
    const shape = document.createElementNS(svgNs, tagName);
    Object.entries(attributes).forEach(([name, value]) => shape.setAttribute(name, value));
    icon.appendChild(shape);
  };
  icon.replaceChildren();
  if (passwordVisible) {
    addShape('path', { d: 'M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94' });
    addShape('path', { d: 'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19' });
    addShape('line', { x1: '1', y1: '1', x2: '23', y2: '23' });
    return;
  }
  addShape('path', { d: 'M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12Z' });
  addShape('circle', { cx: '12', cy: '12', r: '3' });
}

function togglePasswordVisibility() {
  const input = document.getElementById('authPass');
  const icon = document.getElementById('eyeIcon');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    replacePasswordEyeIcon(icon, true);
  } else {
    input.type = 'password';
    replacePasswordEyeIcon(icon, false);
  }
}

function socialAuth(provider) {
  if (provider === 'sberid') {
    showToast('Вход через Сбер ID скоро будет доступен');
  } else {
    showToast(`Вход через ${provider} ещё не реализован`);
  }
}

document.getElementById('authDepartment').addEventListener('change', function() {
  const other = document.getElementById('authDepartmentOther');
  if (this.value === '__other__') {
    other.classList.remove('hidden');
    other.focus();
  } else {
    other.classList.add('hidden');
    other.value = '';
  }
});

function formatApiError(err) {
  if (!(err instanceof api.ApiError)) return 'Не удаётся связаться с сервером.';

  // Полезно для отладки: показываем точную причину от сервера в консоли
  try { console.warn('API error', err.status, err.detail, err.body); } catch (_) {}

  if (Array.isArray(err.detail) && err.detail.length > 0) {
    const first = err.detail[0];
    const field = first.loc?.[first.loc.length - 1] || 'поле';
    const fieldRu = { username: 'логин', password: 'пароль', email: 'email', full_name: 'имя', department: 'подразделение' }[field] || field;
    return `${fieldRu}: ${first.msg}`;
  }

  if (typeof err.detail === 'string' && err.detail) return err.detail;

  // Иногда сервер кладёт сообщение в другие поля тела
  if (err.body && typeof err.body === 'object') {
    if (typeof err.body.message === 'string') return err.body.message;
    if (typeof err.body.error === 'string') return err.body.error;
  }

  return `Ошибка ${err.status}`;
}

let pendingVerifyEmail = null;
let pendingVerifyCreds = null;

function showPendingApprovalScreen() {
  let overlay = document.getElementById('pendingApprovalOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pendingApprovalOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg-primary);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';
    document.body.appendChild(overlay);
  }
  const hasLevel = state.currentUser && state.currentUser.cyber_level;
  const panel = authNode('div', undefined, 'a282');
  panel.append(
    authNode('div', '⏳', 'a283'),
    authNode('h2', 'Заявка на рассмотрении', 'a284'),
    authNode('p', 'Ваш email подтверждён. Теперь администратор должен одобрить доступ к библиотеке — обычно это занимает до 24 часов. Мы пришлём письмо на вашу почту, как только откроем доступ, так что эту страницу можно закрыть.', 'a285'),
    authNode('p', 'А пока вы можете пройти тест на уровень знаний — результат сохранится в вашем профиле.', 'a286'),
  );
  if (hasLevel) {
    panel.appendChild(authNode('div', 'Вы уже прошли тест уровня. Дождитесь одобрения администратора.', 'a287'));
  } else {
    const start = authNode('button', 'Пройти тест на уровень знаний', 'a288');
    start.id = 'pendingStartTestBtn';
    panel.appendChild(start);
  }
  const refresh = authNode('button', 'Проверить статус одобрения', 'a289');
  refresh.id = 'pendingRefreshBtn';
  const logout = authNode('button', 'Выйти', 'a176');
  logout.id = 'pendingLogoutBtn';
  const support = authNode('div', undefined, 'a290');
  support.appendChild(document.createTextNode('При возникновении вопросов или проблем пишите на почту '));
  const supportLink = authNode('a', 'support@aegis-sec-library.ru', 'a291');
  supportLink.href = 'mailto:support@aegis-sec-library.ru';
  support.appendChild(supportLink);
  panel.append(refresh, logout, support);
  overlay.replaceChildren(panel);

  const startBtn = document.getElementById('pendingStartTestBtn');
  if (startBtn) {
    startBtn.onclick = () => {
      overlay.style.display = 'none';
      renderLevelChoices();
      navigateTo('onboarding');
    };
  }
  document.getElementById('pendingRefreshBtn').onclick = async () => {
    const rbtn = document.getElementById('pendingRefreshBtn');
    rbtn.disabled = true;
    const orig = rbtn.textContent;
    rbtn.textContent = 'Проверяю…';
    try {
      const u = await api.me();
      if (u && u.is_approved === true) {
        overlay.remove();
        if (state.currentUser) state.currentUser.is_approved = true;
        showToast('Доступ одобрен! Добро пожаловать');
        // Подгружаем данные библиотеки перед входом
        try {
          await loadBooksFromApi();
          await loadMyListFromApi();
          await loadProgressFromApi();
        } catch (_) {}
        navigateTo(u.cyber_level ? 'home' : 'onboarding');
      } else {
        rbtn.disabled = false;
        rbtn.textContent = orig;
        showToast('Заявка пока на рассмотрении администратором');
      }
    } catch (err) {
      rbtn.disabled = false;
      rbtn.textContent = orig;
      showToast('Не удалось проверить статус, попробуйте ещё раз');
    }
  };
  document.getElementById('pendingLogoutBtn').onclick = async () => {
    try {
      await api.logout();
      overlay.remove();
      clearNoteKey(); stopSyncPolling();
      state.currentUser = null;
      navigateTo('auth');
    } catch (err) {
      showToast(err && err.detail ? err.detail : 'Не удалось завершить сеанс. Попробуйте ещё раз.');
    }
  };
}

function showVerifyEmailScreen(email) {
  let overlay = document.getElementById('verifyEmailOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'verifyEmailOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg-primary);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px;';
    document.body.appendChild(overlay);
  }
  const panel = authNode('div', undefined, 'a292');
  panel.append(authNode('div', '✉️', 'a293'), authNode('h2', 'Подтвердите email', 'a294'));
  const sent = authNode('p', undefined, 'a295');
  sent.append(
    document.createTextNode('Мы отправили код подтверждения на'), document.createElement('br'),
    authNode('b', email, 'a154'), document.createElement('br'),
    authNode('span', 'Проверьте папку «Спам», если письма нет', 'a192'),
  );
  const input = authNode('input', undefined, 'a296');
  input.type = 'text';
  input.id = 'verifyCodeInput';
  input.inputMode = 'numeric';
  input.maxLength = 6;
  input.placeholder = '000000';
  const verify = authNode('button', 'Подтвердить', 'a297');
  verify.id = 'verifyCodeBtn';
  const actions = authNode('div', undefined, 'a298');
  const resend = authNode('button', 'Отправить код повторно', 'a299');
  resend.id = 'verifyResendBtn';
  const back = authNode('button', 'Назад', 'a176');
  back.id = 'verifyBackBtn';
  actions.append(resend, back);
  panel.append(sent, input, verify, actions);
  overlay.replaceChildren(panel);

  input.focus();
  verify.onclick = submitVerifyCode;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submitVerifyCode(); });
  resend.onclick = async () => {
    try {
      await api.resendCode(pendingVerifyEmail);
      showToast('Код отправлен повторно');
    } catch (err) {
      showToast(getAuthErrorMessage(err));
    }
  };
  back.onclick = () => {
    overlay.remove();
    pendingVerifyEmail = null;
    pendingVerifyCreds = null;
  };
}

async function submitVerifyCode() {
  const code = document.getElementById('verifyCodeInput').value.trim();
  if (code.length < 4) return showToast('Введите код из письма');
  const btn = document.getElementById('verifyCodeBtn');
  btn.disabled = true;
  btn.textContent = '...';
  try {
    await api.verifyEmail(pendingVerifyEmail, code);
    // Выводим ключ шифрования из сохранённого при регистрации пароля
    if (pendingVerifyCreds && pendingVerifyCreds.password) {
      await deriveNoteKey(pendingVerifyCreds.password, pendingVerifyCreds.username);
    }
    // Успех — токены сохранены, грузим пользователя
    const user = await api.me();
    state.currentUser = {
      name: user.username, role: user.role, id: user.id, email: user.email,
      full_name: user.full_name, has_avatar: user.has_avatar, cyber_level: user.cyber_level,
      topic_scores: user.topic_scores, level_assessed_at: user.level_assessed_at,
      department: user.department || null,
      is_approved: user.is_approved !== false,
    };
    await loadBooksFromApi();
    await loadMyListFromApi();
    await loadProgressFromApi();
    await loadCompletedQuizzesFromApi();
    await loadGamificationFromApi();
    await loadOfflineBookIds();
    const ov = document.getElementById('verifyEmailOverlay');
    if (ov) ov.remove();
    pendingVerifyEmail = null;
    pendingVerifyCreds = null;
    showToast('Email подтверждён! Добро пожаловать');
    if (state.currentUser && state.currentUser.is_approved === false) {
      showPendingApprovalScreen();
    } else if (!user.cyber_level) navigateTo('onboarding');
    else navigateTo('home');
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Подтвердить';
    showToast(getAuthErrorMessage(err));
  }
}

document.getElementById('authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const n = document.getElementById('authName').value.trim();
  const p = document.getElementById('authPass').value.trim();
  const email = document.getElementById('authEmail')?.value?.trim() || '';
  if (!n) return showToast('Введите логин');
  if (!p) return showToast('Введите пароль');

  if (state.currentTab === 'register') {
    if (n.length < 3) return showToast('Логин: минимум 3 символа');
    if (n.length > 64) return showToast('Логин: максимум 64 символа');
    if (!/^[a-zA-Z0-9_]+$/.test(n)) return showToast('Логин: только латиница, цифры и _');
    if (p.length < 8) return showToast('Пароль: минимум 8 символов');
    if (!email) return showToast('Email обязателен — на него придёт код подтверждения');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showToast('Введите корректный email (например, name@example.com)');
  }

  const submitBtn = document.getElementById('authSubmitBtn');
  const submitText = document.getElementById('authSubmitText');
  const submitSpinner = document.getElementById('authSubmitSpinner');
  const originalText = submitText ? submitText.textContent : submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.classList.add('loading');
  if (submitText) submitText.textContent = '...';
  else submitBtn.textContent = '...';
  if (submitSpinner) submitSpinner.classList.remove('hidden');

  try {
    if (state.currentTab === 'register') {
      const firstName = document.getElementById('authFirstName').value.trim();
      const lastName = document.getElementById('authLastName').value.trim();
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;
      // Собираем подразделение
      const depSelect = document.getElementById('authDepartment').value;
      let department = null;
      if (depSelect === '__other__') {
        department = document.getElementById('authDepartmentOther').value.trim() || null;
      } else if (depSelect) {
        department = depSelect;
      }
      await api.register(n, p, email, fullName, department);
      // Регистрация создаёт неподтверждённый аккаунт — показываем экран ввода кода
      pendingVerifyEmail = email;
      pendingVerifyCreds = { username: n, password: p };
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
      if (submitText) submitText.textContent = originalText;
      if (submitSpinner) submitSpinner.classList.add('hidden');
      showVerifyEmailScreen(email);
      return;
    } else {
      await api.login(n, p);
    }
    // Выводим ключ шифрования заметок из пароля (держится только в памяти)
    await deriveNoteKey(p, n);
    const user = await api.me();
    state.currentUser = {
        name: user.username,
        role: user.role,
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        has_avatar: user.has_avatar,
        cyber_level: user.cyber_level,
        topic_scores: user.topic_scores,
        level_assessed_at: user.level_assessed_at,
        department: user.department || null,
      is_approved: user.is_approved !== false,
      };
      await loadBooksFromApi();
      await loadMyListFromApi();
      await loadProgressFromApi();
      await loadCompletedQuizzesFromApi();
      await loadGamificationFromApi();
      await loadOfflineBookIds();
      maybeAutoPreload();

      saveState();
      document.getElementById('authForm').reset();

      // Не одобрен админом — показываем экран ожидания (с возможностью пройти тест уровня)
      if (state.currentUser && state.currentUser.is_approved === false) {
        showPendingApprovalScreen();
      } else if (state.currentTab === 'register' && !user.cyber_level) {
        renderLevelChoices();
        navigateTo('onboarding');
      } else {
        navigateTo('home');
      }
  } catch (err) {
    // Если вход заблокирован из-за неподтверждённого email — показываем экран кода
    const msg = (err && (err.detail || (err.body && err.body.detail))) || '';
    if (err && err.status === 403 && /not verified/i.test(msg)) {
      const loginName = document.getElementById('authName').value.trim();
      const loginPass = document.getElementById('authPass').value.trim();
      try {
        // Узнаём email по аккаунту нельзя без входа — просим ввести email для повторной отправки
        const emailForVerify = document.getElementById('authEmail')?.value?.trim();
        if (emailForVerify) {
          pendingVerifyEmail = emailForVerify;
          pendingVerifyCreds = { username: loginName, password: loginPass };
          await api.resendCode(emailForVerify);
          showVerifyEmailScreen(emailForVerify);
        } else {
          showToast('Подтвердите email. Введите его в поле email и попробуйте снова.');
        }
      } catch (_) {
        showToast('Подтвердите email перед входом');
      }
    } else {
      showToast(formatApiError(err));
      if (!(err instanceof api.ApiError)) console.error(err);
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading');
    if (submitText) submitText.textContent = originalText;
    else submitBtn.textContent = originalText;
    if (submitSpinner) submitSpinner.classList.add('hidden');
  }
});

function logout() {
  // Используем кастомный confirm вместо нативного — выглядит в стиле приложения
  showConfirmModal({
    title: 'Выход из аккаунта',
    message: 'Вы уверены, что хотите выйти?',
    confirmText: 'Выйти',
    cancelText: 'Отмена',
    danger: true,
    onConfirm: async () => {
      try {
        await api.logout();
        clearNoteKey(); stopSyncPolling();
        await clearUserScopedData();
        state.currentUser = null;
        navigateTo('auth');
        showToast('Вы вышли из аккаунта');
      } catch (err) {
        showToast(err && err.detail ? err.detail : 'Не удалось завершить сеанс. Попробуйте ещё раз.');
      }
    },
  });
}

async function tryAutoLogin() {
  // Access-токен живёт в памяти и после перезагрузки страницы пуст. Пробуем
  // получить новый по httpOnly-cookie: если её нет или она протухла — гость.
  if (!api.isAuthenticated()) {
    const restored = await api.restoreSession();
    if (!restored) return false;
  }
  try {
    const user = await api.me();
   state.currentUser = {
      name: user.username,
      role: user.role,
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      has_avatar: user.has_avatar,
      cyber_level: user.cyber_level,
      topic_scores: user.topic_scores,
      level_assessed_at: user.level_assessed_at,
      profile_visibility: user.profile_visibility || 'public',
      department: user.department || null,
      is_approved: user.is_approved !== false,
    };

    await loadBooksFromApi();
    await loadMyListFromApi();
    await loadProgressFromApi();
    await loadCompletedQuizzesFromApi();
    await loadGamificationFromApi();
    await loadOfflineBookIds();
      maybeAutoPreload();

    saveState();
    return true;
  } catch (err) {
    // Различаем «протухший токен» и «нет сети».
    // 401 → токен недействителен, разлогиниваем как раньше.
    // Сетевая ошибка/офлайн + есть кэш пользователя → НЕ разлогиниваем,
    // восстанавливаем сессию из кэша и показываем скачанные книги.
    const isAuthError = (err instanceof api.ApiError) && err.status === 401;
    const cached = getCachedUser();
    if (!isAuthError && cached && api.isAuthenticated()) {
      state.currentUser = cached;
      await loadOfflineBookIds();
      await loadBooksFromOffline();
      try { loadProgressFromApi(); } catch (_) {}  // прогресс берётся локально, сетевой вызов молча упадёт
      showToast('Офлайн-режим: вход по сохранённой сессии');
      return true;
    }
    try { await api.logout(); } catch (_) { api.tokens.clear(); }
    clearNoteKey(); stopSyncPolling();
    clearCachedUser();
    return false;
  }
}
