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

function _onboardingResultNode(tagName, className, text, staticStyle) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (staticStyle) node.setAttribute('data-static-style', staticStyle);
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function _onboardingLevelIcon(iconMarkup) {
  const box = _onboardingResultNode('div', null, undefined, 'a574');
  appendTrustedIcon(box, iconMarkup);
  const svg = box.querySelector('svg');
  if (svg) {
    svg.setAttribute('width', '40');
    svg.setAttribute('height', '40');
  }
  return box;
}

function _onboardingTopics(result) {
  const section = _onboardingResultNode('div', 'onboarding-topics');
  section.appendChild(_onboardingResultNode('h3', null, 'По темам'));
  result.topic_scores.forEach(topic => {
    const percentage = Math.max(0, Math.min(100, Number(topic.percentage) || 0));
    let strength = 'weak';
    if (percentage >= 70) strength = 'strong';
    else if (percentage >= 50) strength = 'medium';

    const row = _onboardingResultNode('div', 'onboarding-topic-row');
    const bar = _onboardingResultNode('div', 'onboarding-topic-bar');
    const fill = _onboardingResultNode('div', `onboarding-topic-fill ${strength}`);
    fill.setAttribute('data-dynamic-style', dynamicStyleToken`width:${percentage}%;`);
    bar.appendChild(fill);
    row.append(
      _onboardingResultNode('div', 'onboarding-topic-name', topic.topic_name),
      bar,
      _onboardingResultNode('div', 'onboarding-topic-pct', `${percentage}%`),
    );
    section.appendChild(row);
  });
  return section;
}

function _onboardingWeakTopics(result) {
  if (!result.weak_topics.length) return null;
  const weak = _onboardingResultNode('div', 'onboarding-weak-list');
  const title = _onboardingResultNode('h4', null, undefined, 'a573');
  appendTrustedIcon(title, ICONS.warningTriangle);
  title.appendChild(document.createTextNode(' Стоит подтянуть'));
  const names = result.weak_topics.map(topic => (
    result.topic_scores.find(score => score.topic === topic)?.topic_name || topic
  ));
  weak.append(title, _onboardingResultNode('p', null, names.join(', ')));
  return weak;
}

function _onboardingResultContent(result, info, levelName, description) {
  const fragment = document.createDocumentFragment();
  fragment.append(
    _onboardingLevelIcon(info.icon),
    _onboardingResultNode('div', 'onboarding-result-level gradient-text', levelName),
    _onboardingResultNode('div', 'onboarding-result-percentage', `${result.overall_percentage}% правильных`),
    _onboardingResultNode('div', 'onboarding-result-description', description),
  );
  return fragment;
}

function renderOnboardingResult(result) {
  const container = document.getElementById('onboardingResultContent');
  if (!container) return;
  const info = getCyberLevelInfo(result.cyber_level);
  const content = _onboardingResultContent(
    result,
    info,
    result.level_name,
    result.level_description,
  );
  content.appendChild(_onboardingTopics(result));
  const weak = _onboardingWeakTopics(result);
  if (weak) content.appendChild(weak);

  const finish = _onboardingResultNode(
    'button',
    'btn-onboarding-finish-result',
    'Начать обучение',
  );
  finish.type = 'button';
  finish.addEventListener('click', finishOnboardingNav);
  content.appendChild(finish);
  container.replaceChildren(content);
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
  const container = document.getElementById('onboardingResultContent');
  if (!container) return;
  const info = getCyberLevelInfo(result.cyber_level);
  const content = _onboardingResultContent(result, info, info.name, info.description);

  if (result.assessed_at) {
    const assessedDate = new Date(result.assessed_at).toLocaleDateString('ru-RU');
    content.appendChild(
      _onboardingResultNode('div', null, `Тест пройден: ${assessedDate}`, 'a575'),
    );
  }
  content.appendChild(_onboardingTopics(result));
  const weak = _onboardingWeakTopics(result);
  if (weak) content.appendChild(weak);

  const actions = _onboardingResultNode('div', null, undefined, 'a576');
  const back = _onboardingResultNode(
    'button',
    'btn-onboarding-skip',
    'Назад в профиль',
    'a004',
  );
  back.type = 'button';
  back.addEventListener('click', () => navigateTo('profile'));
  const restart = _onboardingResultNode(
    'button',
    'btn-onboarding-start',
    'Пройти заново',
    'a004',
  );
  restart.type = 'button';
  restart.addEventListener('click', restartOnboarding);
  actions.append(back, restart);
  content.appendChild(actions);
  container.replaceChildren(content);
}

function restartOnboarding() {
  if (!confirm('Пройти тест заново? Текущий результат будет заменён новым после прохождения.')) return;
  // Сбрасываем UI и стартуем тест заново
  document.getElementById('onboardingResult').classList.add('hidden');
  document.getElementById('onboardingWelcome').classList.add('hidden');
  document.getElementById('onboardingQuiz').classList.remove('hidden');
  startOnboarding();
}
