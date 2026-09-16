// Security, profile editing, avatar and personal statistics.

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
    img.onerror = () => { el.textContent = displayName.charAt(0).toUpperCase(); };
    if (api.users.loadAvatar) {
      api.users.loadAvatar(img, u.id).catch(() => img.onerror());
    } else {
      img.src = api.users.avatarUrl(u.id) + '?t=' + Date.now();
    }
    el.replaceChildren();
    el.appendChild(img);
  } else {
    el.textContent = displayName.charAt(0).toUpperCase();
  }
}
