// Cyber-level selection and onboarding assessment.
// Loaded as a classic script before app.js; public handlers intentionally remain global.

let onboardingState = {
  questions: [],
  topicNames: {},
  answers: {},        // {qid: index}
  currentIndex: 0,
};

// ========== ВЫБОР УРОВНЯ (новый стартовый экран онбординга) ==========

const LEVEL_CHOICES = [
  {
    code: 'gate_guardian',
    name: 'Gate Guardian',
    description: 'Я знаю, где вход, и буду стоять насмерть. Но если атака сложнее фишинга — зову старших.',
  },
  {
    code: 'scout',
    name: 'Scout',
    description: 'Я вижу дыры, которые другие не замечают. Иногда случайно ломаю свои же сервисы, но это часть обучения.',
  },
  {
    code: 'stronghold',
    name: 'Stronghold',
    description: 'Меня не возьмёшь лобовой атакой. Придётся искать уязвимость нулевого дня — а я её уже закрыл на прошлой неделе.',
  },
  {
    code: 'shadow_architect',
    name: 'Shadow Architect',
    description: 'Я не реагирую на угрозы — я проектирую среду, где атака обречена с самого начала. Хакеры даже не узнают, что их уже обманули.',
  },
  {
    code: 'abyss_warden',
    name: 'Abyss Warden',
    description: 'Я не просто защищаю — я определяю, что такое безопасность. Если я чего-то не знаю, этого ещё не существует.',
  },
];

function renderLevelChoices() {
  const container = document.getElementById('levelChoiceList');
  if (!container) return;
  const fragment = document.createDocumentFragment();
  LEVEL_CHOICES.forEach((lvl, idx) => {
    const info = getCyberLevelInfo(lvl.code);
    const card = document.createElement('button');
    card.className = 'level-choice-card';
    card.setAttribute('data-static-style', 'a566');
    const icon = document.createElement('div');
    icon.setAttribute('data-static-style', 'a567');
    appendTrustedIcon(icon, info.icon);
    const copy = document.createElement('div');
    copy.setAttribute('data-static-style', 'a004');
    const name = document.createElement('div');
    name.setAttribute('data-static-style', 'a568');
    name.textContent = `${idx + 1}. ${lvl.name}`;
    const description = document.createElement('div');
    description.setAttribute('data-static-style', 'a392');
    description.textContent = lvl.description;
    copy.append(name, description);
    card.append(icon, copy);
    card.addEventListener('click', () => selectLevelSelf(lvl.code));
    fragment.appendChild(card);
  });
  const testCard = document.createElement('button');
  testCard.className = 'level-choice-card level-choice-test';
  testCard.setAttribute('data-static-style', 'a569');
  const testIcon = document.createElement('div');
  testIcon.setAttribute('data-static-style', 'a570');
  appendTrustedIcon(testIcon, ICONS.target);
  const testCopy = document.createElement('div');
  testCopy.setAttribute('data-static-style', 'a004');
  const testName = document.createElement('div');
  testName.setAttribute('data-static-style', 'a571');
  testName.textContent = '6. Хочу узнать (тест)';
  const testDescription = document.createElement('div');
  testDescription.setAttribute('data-static-style', 'a572');
  testDescription.textContent = '20 вопросов по 5 темам кибербезопасности. ~7 минут.';
  testCopy.append(testName, testDescription);
  testCard.append(testIcon, testCopy);
  testCard.addEventListener('click', startOnboardingQuiz);
  fragment.appendChild(testCard);
  container.replaceChildren(fragment);
}

async function selectLevelSelf(levelCode) {
  try {
    await api.onboarding.selfAssess(levelCode);
    // Обновляем currentUser
    if (state.currentUser) state.currentUser.cyber_level = levelCode;
    showToast('Уровень установлен. Можешь начинать читать!');
    closeOnboarding();
  } catch (e) {
    console.error(e);
    showToast('Не удалось сохранить уровень: ' + (e.detail || e.message));
  }
}

function startOnboardingQuiz() {
  // Скрыть welcome, показать quiz
  document.getElementById('onboardingWelcome').classList.add('hidden');
  document.getElementById('onboardingQuiz').classList.remove('hidden');
  // Сбросить состояние теста и стартовать
  startOnboarding();
}

function closeOnboarding() {
  navigateTo('home');
  // Дополнительные действия при закрытии (если нужно)
}

async function maybeShowOnboarding() {
 // Рендерим карточки выбора уровня
  renderLevelChoices();
  // Показывать только если cyber_level не определён (т.е. тест ещё не прошли)
  if (!state.currentUser) return false;
  if (state.currentUser.cyber_level) return false;
  navigateTo('onboarding');
  renderLevelChoices();
  return true;
}

function skipOnboarding() {
  // Если аккаунт не одобрен админом — нельзя попасть в библиотеку
  if (state.currentUser && state.currentUser.is_approved === false) {
    showPendingApprovalScreen();
    return;
  }
  navigateTo('home');
}

async function startOnboarding() {
  try {
    const data = await api.onboarding.getQuiz();
    onboardingState.questions = data.questions;
    onboardingState.topicNames = data.topic_names;
    onboardingState.answers = {};
    onboardingState.currentIndex = 0;
    document.getElementById('onboardingWelcome').classList.add('hidden');
    document.getElementById('onboardingQuiz').classList.remove('hidden');
    document.getElementById('onboardingTotal').textContent = data.questions.length;
    renderOnboardingQuestion();
  } catch (err) {
    console.error('Не удалось загрузить тест:', err);
    showToast('Не удалось загрузить тест');
  }
}

function renderOnboardingQuestion() {
  const q = onboardingState.questions[onboardingState.currentIndex];
  if (!q) return;
  const total = onboardingState.questions.length;
  const idx = onboardingState.currentIndex;

  document.getElementById('onboardingCurrent').textContent = idx + 1;
  document.getElementById('onboardingProgressFill').style.width = ((idx + 1) / total * 100) + '%';
  document.getElementById('onboardingTopicBadge').textContent = onboardingState.topicNames[q.topic] || q.topic;
  document.getElementById('onboardingQuestion').textContent = q.question;

  const selected = onboardingState.answers[q.id];
  const options = document.createDocumentFragment();
  q.options.forEach((opt, i) => {
    const isSelected = selected === i;
    const button = document.createElement('button');
    button.className = `onboarding-option${isSelected ? ' selected' : ''}`;
    const letter = document.createElement('span');
    letter.className = 'onboarding-option-letter';
    letter.textContent = 'ABCD'[i] || String(i + 1);
    const label = document.createElement('span');
    label.textContent = String(opt);
    button.append(letter, label);
    button.addEventListener('click', () => selectOnboardingAnswer(i));
    options.appendChild(button);
  });
  document.getElementById('onboardingOptions').replaceChildren(options);

  // Управление кнопками
  document.getElementById('btnOnboardingPrev').disabled = (idx === 0);
  const isLast = idx === total - 1;
  const nextBtn = document.getElementById('btnOnboardingNext');
  const finishBtn = document.getElementById('btnOnboardingFinish');
  if (isLast) {
    nextBtn.classList.add('hidden');
    finishBtn.classList.remove('hidden');
  } else {
    nextBtn.classList.remove('hidden');
    finishBtn.classList.add('hidden');
  }
  // Кнопки далее/завершить активны только если есть ответ
  const hasAnswer = selected !== undefined;
  nextBtn.disabled = !hasAnswer;
  finishBtn.disabled = !hasAnswer;
}

function selectOnboardingAnswer(idx) {
  const q = onboardingState.questions[onboardingState.currentIndex];
  onboardingState.answers[q.id] = idx;
  renderOnboardingQuestion();
}

function nextOnboardingQuestion() {
  if (onboardingState.currentIndex < onboardingState.questions.length - 1) {
    onboardingState.currentIndex++;
    renderOnboardingQuestion();
  }
}

function prevOnboardingQuestion() {
  if (onboardingState.currentIndex > 0) {
    onboardingState.currentIndex--;
    renderOnboardingQuestion();
  }
}

async function finishOnboarding() {
  // Проверяем что на все вопросы есть ответы
  const total = onboardingState.questions.length;
  const answered = Object.keys(onboardingState.answers).length;
  if (answered < total) {
    showToast(`Ответьте на все вопросы (${answered}/${total})`);
    return;
  }

  const finishBtn = document.getElementById('btnOnboardingFinish');
  finishBtn.disabled = true;
  finishBtn.textContent = 'Отправка...';

  try {
    const result = await api.onboarding.submit(onboardingState.answers);
    // Обновляем currentUser
    state.currentUser.cyber_level = result.cyber_level;
    state.currentUser.topic_scores = {};
    result.topic_scores.forEach(t => { state.currentUser.topic_scores[t.topic] = t.percentage; });
    state.currentUser.level_assessed_at = result.assessed_at;

    // Показываем результат
    document.getElementById('onboardingQuiz').classList.add('hidden');
    document.getElementById('onboardingResult').classList.remove('hidden');
    renderOnboardingResult(result);
  } catch (err) {
    console.error('Ошибка отправки теста:', err);
    showToast('Не удалось отправить ответы');
    finishBtn.disabled = false;
    finishBtn.textContent = 'Завершить';
  }
}

function renderOnboardingResult(result) {
  const c = document.getElementById('onboardingResultContent');
  const info = getCyberLevelInfo(result.cyber_level);

  // Темы с цветами по силе
  const topicsHtml = result.topic_scores.map(t => {
    let cls = 'weak';
    if (t.percentage >= 70) cls = 'strong';
    else if (t.percentage >= 50) cls = 'medium';
    return `<div class="onboarding-topic-row">
      <div class="onboarding-topic-name">${eh(t.topic_name)}</div>
      <div class="onboarding-topic-bar">
        <div class="onboarding-topic-fill ${cls}" data-dynamic-style="${dynamicStyleToken`width:${t.percentage}%;`}"></div>
      </div>
      <div class="onboarding-topic-pct">${t.percentage}%</div>
    </div>`;
  }).join('');

  // Слабые темы
  const weakHtml = result.weak_topics.length > 0 ? `
    <div class="onboarding-weak-list">
      <h4 data-static-style="a573">${ICONS.warningTriangle} Стоит подтянуть</h4>
      <p>${result.weak_topics.map(t => eh(result.topic_scores.find(s => s.topic === t)?.topic_name || t)).join(', ')}</p>
    </div>
  ` : '';

  c.innerHTML = `
    <div data-static-style="a574">${info.icon.replace('width="22"','width="40"').replace('height="22"','height="40"').replace('width="20"','width="40"').replace('height="20"','height="40"')}</div>
    <div class="onboarding-result-level gradient-text">${eh(result.level_name)}</div>
    <div class="onboarding-result-percentage">${result.overall_percentage}% правильных</div>
    <div class="onboarding-result-description">${eh(result.level_description)}</div>
    <div class="onboarding-topics">
      <h3>По темам</h3>
      ${topicsHtml}
    </div>
    ${weakHtml}
    <button class="btn-onboarding-finish-result" data-onclick="finishOnboardingNav()">Начать обучение</button>
  `;
}

function finishOnboardingNav() {
  // Если пользователь ещё не одобрен — возвращаем на экран ожидания, не пускаем в библиотеку
  if (state.currentUser && state.currentUser.is_approved === false) {
    showPendingApprovalScreen();
  } else {
    navigateTo('home');
  }
}
// ========== ИНФА ОБ УРОВНЕ + МОДАЛКА «МОЙ УРОВЕНЬ» ==========
function getCyberLevelInfo(code) {
  const map = {
    gate_guardian: {
      icon: ICONS.levelGateGuardian,
      name: 'Gate Guardian',
      description: 'Я знаю, где вход, и буду стоять насмерть. Но если атака сложнее фишинга — зову старших.',
    },
    scout: {
      icon: ICONS.levelScout,
      name: 'Scout',
      description: 'Я вижу дыры, которые другие не замечают. Иногда случайно ломаю свои же сервисы, но это часть обучения.',
    },
    stronghold: {
      icon: ICONS.levelStronghold,
      name: 'Stronghold',
      description: 'Меня не возьмёшь лобовой атакой. Придётся искать уязвимость нулевого дня — а я её уже закрыл на прошлой неделе.',
    },
    shadow_architect: {
      icon: ICONS.levelShadowArchitect,
      name: 'Shadow Architect',
      description: 'Я не реагирую на угрозы — я проектирую среду, где атака обречена с самого начала. Хакеры даже не узнают, что их уже обманули.',
    },
    abyss_warden: {
      icon: ICONS.levelAbyssWarden,
      name: 'Abyss Warden',
      description: 'Я не просто защищаю — я определяю, что такое безопасность. Если я чего-то не знаю, этого ещё не существует.',
    },
  };
  return map[code] || { icon: ICONS.target, name: code, description: '' };
}

async function openCyberLevelModal() {
  // Тянем актуальный результат с бэка (на случай если данные несвежие)
  let result;
  try {
    result = await api.onboarding.getResult();
  } catch (err) {
    showToast('Не удалось загрузить результаты');
    return;
  }
  if (!result) {
    showToast('Сначала пройди тест уровня');
    return;
  }

  // Используем тот же экран результата онбординга
  navigateTo('onboarding');
  document.getElementById('onboardingWelcome').classList.add('hidden');
  document.getElementById('onboardingQuiz').classList.add('hidden');
  document.getElementById('onboardingResult').classList.remove('hidden');

  // Особенность: тут хотим кнопку «Назад в профиль» вместо «Начать обучение»,
  // и опционально — «Пройти тест заново»
  renderCyberLevelDetail(result);
}

function renderCyberLevelDetail(result) {
  const c = document.getElementById('onboardingResultContent');
  const info = getCyberLevelInfo(result.cyber_level);

  const topicsHtml = result.topic_scores.map(t => {
    let cls = 'weak';
    if (t.percentage >= 70) cls = 'strong';
    else if (t.percentage >= 50) cls = 'medium';
    return `<div class="onboarding-topic-row">
      <div class="onboarding-topic-name">${eh(t.topic_name)}</div>
      <div class="onboarding-topic-bar">
        <div class="onboarding-topic-fill ${cls}" data-dynamic-style="${dynamicStyleToken`width:${t.percentage}%;`}"></div>
      </div>
      <div class="onboarding-topic-pct">${t.percentage}%</div>
    </div>`;
  }).join('');

  const weakHtml = result.weak_topics.length > 0 ? `
    <div class="onboarding-weak-list">
      <h4 data-static-style="a573">${ICONS.warningTriangle} Стоит подтянуть</h4>
      <p>${result.weak_topics.map(t => eh(result.topic_scores.find(s => s.topic === t)?.topic_name || t)).join(', ')}</p>
    </div>
  ` : '';

  const dateStr = result.assessed_at ? new Date(result.assessed_at).toLocaleDateString('ru-RU') : '';

  c.innerHTML = `
    <div data-static-style="a574">${info.icon.replace('width="22"','width="40"').replace('height="22"','height="40"').replace('width="20"','width="40"').replace('height="20"','height="40"')}</div>
    <div class="onboarding-result-level gradient-text">${eh(info.name)}</div>
    <div class="onboarding-result-percentage">${result.overall_percentage}% правильных</div>
    <div class="onboarding-result-description">${eh(info.description)}</div>
    ${dateStr ? `<div data-static-style="a575">Тест пройден: ${dateStr}</div>` : ''}
    <div class="onboarding-topics">
      <h3>По темам</h3>
      ${topicsHtml}
    </div>
    ${weakHtml}
    <div data-static-style="a576">
      <button class="btn-onboarding-skip" data-onclick="navigateTo('profile')" data-static-style="a004">Назад в профиль</button>
      <button class="btn-onboarding-start" data-onclick="restartOnboarding()" data-static-style="a004">Пройти заново</button>
    </div>
  `;
}

function restartOnboarding() {
  if (!confirm('Пройти тест заново? Текущий результат будет заменён новым после прохождения.')) return;
  // Сбрасываем UI и стартуем тест заново
  document.getElementById('onboardingResult').classList.add('hidden');
  document.getElementById('onboardingWelcome').classList.add('hidden');
  document.getElementById('onboardingQuiz').classList.remove('hidden');
  startOnboarding();
}
