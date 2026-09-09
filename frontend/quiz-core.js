// ========== QUIZ ==========
function renderQuizQuestion() {
  const c = document.getElementById('detailTabTraining');
  if (!c) return;
  const q = currentQuiz.questions[currentQuiz.currentIndex];
  const userAnswer = currentQuiz.answers[currentQuiz.currentIndex];
  const isAnswered = userAnswer !== -1;

  c.innerHTML = `<div class="quiz-container">
    <div data-static-style="a091">
      <span data-static-style="a192">Вопрос ${currentQuiz.currentIndex + 1} из ${currentQuiz.questions.length}</span>
    </div>
    <div class="quiz-question">${eh(q.q)}</div>
    <div class="quiz-options">
      ${q.options.map((o, i) => {
        const isSelected = isAnswered && userAnswer === i;
        const cls = 'quiz-option' + (isSelected ? ' selected' : '');
        return `<button class="${cls}" ${isAnswered ? 'disabled' : ''} data-onclick="answerQuiz(${i})">
          <span class="quiz-option-letter">${'ABCD'[i]}</span>${eh(o)}
        </button>`;
      }).join('')}
    </div>
    <div class="quiz-nav">
      <button class="btn-quiz" data-onclick="prevQuestion()" ${currentQuiz.currentIndex === 0 ? 'disabled' : ''}>${ICONS.chevronLeft} Назад</button>
      ${currentQuiz.currentIndex < currentQuiz.questions.length - 1
        ? `<button class="btn-quiz primary" data-onclick="nextQuestion()">Далее ${ICONS.chevronRight}</button>`
        : `<button class="btn-quiz primary" data-onclick="finishQuiz()">${ICONS.check} Завершить</button>`}
    </div>
  </div>`;
}
function nextQuestion() { if (currentQuiz.currentIndex < currentQuiz.questions.length - 1) { currentQuiz.currentIndex++; renderQuizQuestion(); } }
function prevQuestion() { if (currentQuiz.currentIndex > 0) { currentQuiz.currentIndex--; renderQuizQuestion(); } }


async function loadCompletedQuizzesFromApi() {
  if (!state.currentUser) return false;
  try {
    const attempts = await api.library.myQuizAttempts();
    const passedBooks = new Set();
    attempts.forEach(a => {
      if (a.percentage >= 60) passedBooks.add(a.book_id);
    });
    state.completedQuizzes[state.currentUser.name] = Array.from(passedBooks);
    return true;
  } catch (err) {
    console.error('Не удалось загрузить попытки тестов:', err);
    return false;
  }
}

async function fetchQuizForBook(bookId) {
  // Кэш убран намеренно: каждый заход в тест должен открывать новую сессию на
  // сервере, иначе повторная сдача упрётся в «сессия уже использована».
  try {
    const data = await api.library.quiz(bookId);
    return data;
  } catch (err) {
    console.error('Не удалось загрузить тест для книги', bookId, err);
    const msg = (err && err.status)
      ? `Ошибка теста (${err.status}${err.detail ? ': ' + err.detail : ''})`
      : 'Не удалось загрузить тест';
    showToast(msg);
    return { questions: [], sessionToken: null };
  }
}

async function startQuiz(bookId) {
  // Показываем спиннер, пока грузятся/генерируются вопросы (может быть долго при AI-генерации)
  const c = document.getElementById('detailTabTraining');
  if (c) c.innerHTML = loadingSpinnerHTML('Готовим тест…');
  const { questions, sessionToken } = await fetchQuizForBook(bookId);
  if (!questions.length) return showToast('Нет вопросов теста');

  currentQuiz = {
    bookId,
    sessionToken,
    questions: questions.map(q => ({
      q: q.question,
      options: q.options,
      correct: -1,
      _id: q.id,
    })),
    currentIndex: 0,
    score: 0,
    answers: new Array(questions.length).fill(-1),
  };
  renderQuizQuestion();
}

function startCombinedQuiz(bookIds) {
  showToast('Комбо-тест будет доступен после миграции AI-чата (Этап 3)');
}

// Пройти тест заново: сбрасываем кэш и заново запрашиваем тест.
// Бэк отдаёт случайную выборку вопросов, поэтому каждый повтор — новый набор.
async function retakeQuiz(bookId) {
  const c = document.getElementById('detailTabTraining');
  if (c) c.innerHTML = loadingSpinnerHTML('Готовим новый тест…');
  return startQuiz(bookId);
}

function answerQuiz(i) {
  if (currentQuiz.answers[currentQuiz.currentIndex] !== -1) return;
  currentQuiz.answers[currentQuiz.currentIndex] = i;
  renderQuizQuestion();
}

async function finishQuiz() {
  const answers = currentQuiz.answers.map(a => a === -1 ? -1 : a);
  const cleanAnswers = answers.map(a => a < 0 ? 0 : a);

  let result;
  try {
    result = await api.library.submitQuiz(
      currentQuiz.bookId, cleanAnswers, currentQuiz.sessionToken
    );
  } catch (err) {
    if (err instanceof api.ApiError) showToast('Ошибка: ' + (err.detail || err.status));
    else showToast('Сервер недоступен');
    return;
  }

  result.correct_indices.forEach((ci, idx) => {
    if (currentQuiz.questions[idx]) currentQuiz.questions[idx].correct = ci;
  });
  currentQuiz.score = result.score;

  if (result.percentage >= 60 && state.currentUser) {
    if (!state.completedQuizzes[state.currentUser.name]) state.completedQuizzes[state.currentUser.name] = [];
    if (!state.completedQuizzes[state.currentUser.name].includes(currentQuiz.bookId)) {
      state.completedQuizzes[state.currentUser.name].push(currentQuiz.bookId);
    }
  }
  refreshGamificationFromApi();

  const c = document.getElementById('detailTabTraining');
  if (c) {
    const t = result.total, s = result.score, p = result.percentage;

    const breakdown = currentQuiz.questions.map((q, idx) => {
      const userIdx = currentQuiz.answers[idx];
      const correctIdx = q.correct;
      const userText = userIdx >= 0 ? q.options[userIdx] : '— нет ответа —';
      const correctText = q.options[correctIdx];
      const isCorrect = userIdx === correctIdx;
      return `<div data-dynamic-style="${dynamicStyleToken`background:var(--bg-card);border:1px solid var(--border);border-left:3px solid ${isCorrect ? '#22c55e' : '#ef4444'};border-radius:var(--radius);padding:12px;margin-bottom:8px;text-align:left;`}">
        <div data-static-style="a250">Вопрос ${idx + 1}</div>
        <div data-static-style="a251">${eh(q.q)}</div>
        <div data-static-style="a252">
          <span data-static-style="a243">Ваш ответ:</span>
          <span data-dynamic-style="${dynamicStyleToken`color:${isCorrect ? '#22c55e' : '#ef4444'};font-weight:500;`}">${eh(userText)} ${isCorrect ? ICONS.check : ICONS.x}</span>
        </div>
        ${!isCorrect ? `<div data-static-style="a253">
          <span data-static-style="a243">Правильный:</span>
          <span data-static-style="a254">${eh(correctText)}</span>
        </div>` : ''}
      </div>`;
    }).join('');

    c.innerHTML = `<div class="quiz-result ${p >= 60 ? 'success' : 'partial'}" data-static-style="a091">
      <div data-static-style="a255">${p >= 80 ? ICONS.shield : ICONS.education}</div>
      <div data-static-style="a256">${p}%</div>
      <div data-static-style="a257">${s}/${t}</div>
      <button class="btn-quiz primary" data-onclick="retakeQuiz(${currentQuiz.bookId})" data-static-style="a258">
      <span data-static-style="a259">${ICONS.refresh}</span>
      <span data-static-style="a260">Заново</span>
    </button>
      </div>
    <div data-static-style="a261">
      <h4 data-static-style="a224">Разбор ответов</h4>
      ${breakdown}
    </div>`;
  }
}
