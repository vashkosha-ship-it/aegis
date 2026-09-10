// Экран профиля пользователя.
function renderProfile() {
  if (!state.currentUser) return;
  const u = state.currentUser;
  const displayName = u.full_name || u.name;

  // Заголовок: имя + кнопка-карандаш
  const header = document.getElementById('profileDisplayName');
  header.textContent = displayName;

  // Под заголовком — username (он не меняется)
  let usernameLine = document.getElementById('profileUsernameLine');
  if (!usernameLine) {
    usernameLine = document.createElement('div');
    usernameLine.id = 'profileUsernameLine';
    usernameLine.style.cssText = 'font-size:11px;color:var(--text-muted);margin-bottom:4px;';
    header.parentNode.insertBefore(usernameLine, header.nextSibling);
  }
  usernameLine.textContent = '@' + u.name;

  // Подразделение под username
  let depLine = document.getElementById('profileDepartmentLine');
  if (u.department) {
    if (!depLine) {
      depLine = document.createElement('div');
      depLine.id = 'profileDepartmentLine';
      depLine.style.cssText = 'font-size:11px;color:var(--accent);margin-bottom:4px;font-weight:600;';
      usernameLine.parentNode.insertBefore(depLine, usernameLine.nextSibling);
    }
    depLine.textContent = u.department;
  } else if (depLine) {
    depLine.remove();
  }

  // Тег роли + бейдж уровня кибербезопасности (если пройден тест)
  const roleTag = document.getElementById('profileRoleTag');
  roleTag.textContent = u.role === 'admin' ? 'Администратор' : 'Читатель';

  // Бейдж кибер-уровня — справа от роли
  let levelBadge = document.getElementById('cyberLevelBadge');
  if (u.cyber_level) {
    const levelInfo = getCyberLevelInfo(u.cyber_level);
    if (!levelBadge) {
      levelBadge = document.createElement('span');
      levelBadge.id = 'cyberLevelBadge';
      levelBadge.className = 'cyber-level-badge ' + u.cyber_level;
      roleTag.parentNode.insertBefore(levelBadge, roleTag.nextSibling);
    }
    levelBadge.className = 'cyber-level-badge ' + u.cyber_level;
    const levelIcon = document.createElement('span');
    levelIcon.setAttribute('data-static-style', 'a100');
    appendTrustedIcon(levelIcon, levelInfo.icon);
    levelBadge.replaceChildren(levelIcon, document.createTextNode(String(levelInfo.name ?? '')));
    levelBadge.style.cursor = 'pointer';
    levelBadge.title = 'Нажми для просмотра подробных результатов';
    levelBadge.onclick = openCyberLevelModal;
  } else if (levelBadge) {
    // Был бейдж, но юзер вдруг сбросил уровень — убираем
    levelBadge.remove();
  }

  // Кнопка «Пройти тест уровня» — показываем, если юзер пропустил онбординг
  let takeQuizBtn = document.getElementById('profileTakeQuizBtn');
  if (!u.cyber_level) {
    if (!takeQuizBtn) {
      takeQuizBtn = document.createElement('button');
      takeQuizBtn.id = 'profileTakeQuizBtn';
      takeQuizBtn.className = 'profile-take-quiz-btn';
      takeQuizBtn.onclick = () => {
        navigateTo('onboarding');
        document.getElementById('onboardingResult').classList.add('hidden');
        document.getElementById('onboardingQuiz').classList.add('hidden');
        document.getElementById('onboardingWelcome').classList.remove('hidden');
      };
      // Кнопка — в отдельный слот внизу карточки профиля
      const slot = document.getElementById('profileTestSlot');
      (slot || usernameLine.parentNode).appendChild(takeQuizBtn);
    }
    const quizIcon = document.createElement('span');
    quizIcon.setAttribute('data-static-style', 'a332');
    appendTrustedIcon(quizIcon, ICONS.target);
    takeQuizBtn.replaceChildren(quizIcon, document.createTextNode('Пройти тест уровня кибербезопасности'));
    takeQuizBtn.style.display = 'flex';
  } else if (takeQuizBtn) {
    // Юзер уже прошёл — кнопка не нужна
    takeQuizBtn.style.display = 'none';
  }

  document.getElementById('statBooks').textContent = state.books.length;
  document.getElementById('statBookmarks').textContent = Object.keys(state.mylist).length;
  document.getElementById('statAchievements').textContent = (state.gamification.achievementsOwned || []).length;
  const streak = document.getElementById('statStreak');
  const streakIcon = document.createElement('span');
  streakIcon.setAttribute('data-static-style', 'a333');
  appendTrustedIcon(streakIcon, ICONS.fire);
  streak.replaceChildren(document.createTextNode(String(getStreak())), streakIcon);

  // Аватар: с сервера, если has_avatar; иначе буква
  const at = document.getElementById('profileAvatarText');
  const ai = document.getElementById('profileAvatarImg');
  if (u.has_avatar) {
    at.style.display = 'none';
    ai.style.display = 'block';
    // ?t=Date.now() чтобы пробить кэш после смены аватара
    ai.src = api.users.avatarUrl(u.id) + '?t=' + Date.now();
    ai.onerror = () => {
      // Fallback — если файл по какой-то причине пропал
      at.style.display = 'block';
      ai.style.display = 'none';
      at.textContent = displayName.charAt(0).toUpperCase();
    };
  } else {
    at.style.display = 'block';
    ai.style.display = 'none';
    at.textContent = displayName.charAt(0).toUpperCase();
  }
  updateProfileXpDisplay();
  renderAchievementsInProfile();
  renderHeatmap();
  renderSkillsRadar();
  renderOfflineBooks();
  // Кнопки переключения темы приложения
  const btnDark = document.getElementById('appThemeBtnDark');
  const btnLight = document.getElementById('appThemeBtnLight');
  if (btnDark && !btnDark.hasChildNodes()) {
    const label = document.createElement('span');
    label.textContent = 'Тёмная';
    appendTrustedIcon(btnDark, ICONS.themeMoon);
    btnDark.appendChild(label);
  }
  if (btnLight && !btnLight.hasChildNodes()) {
    const label = document.createElement('span');
    label.textContent = 'Светлая';
    appendTrustedIcon(btnLight, ICONS.themeSun);
    btnLight.appendChild(label);
  }
  // Применяем актуальное состояние
  applyAppTheme(getAppTheme());
// SVG в шапке: шестерёнка + звезда + пламя
  const gearBtn = document.getElementById('btnOpenSettings');
  if (gearBtn && !gearBtn.hasChildNodes()) appendTrustedIcon(gearBtn, ICONS.settingsGear);
  const starIc = document.getElementById('profileStarIcon');
  if (starIc && !starIc.hasChildNodes()) appendTrustedIcon(starIc, ICONS.iconStar);
  const flameIc = document.getElementById('statStreakFlame');
  if (flameIc && !flameIc.hasChildNodes()) appendTrustedIcon(flameIc, ICONS.iconFlame);
}
