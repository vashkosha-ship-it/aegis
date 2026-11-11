// ========== TRAINING ==========
document.getElementById('trainingTabs').addEventListener('click', e => {
  const t = e.target.closest('.training-tab');
  if (!t) return;
  state.trainingTab = t.dataset.ttab;
  trainingVisibleCount = TRAINING_PAGE_SIZE;
  renderTrainingScreen();
});

// В библиотеке тысячи книг; карточка теста на каждую сразу — это секунда
// отрисовки на каждом заходе на экран. Показываем порциями.
const TRAINING_PAGE_SIZE = 60;
let trainingVisibleCount = TRAINING_PAGE_SIZE;

// Тесты проверяются на сервере — без интернета их не открыть.
const OFFLINE_TESTS_MESSAGE = 'Нет подключения к интернету. Тесты доступны только онлайн.';

function testsBlockedOffline() {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return false;
  showToast(OFFLINE_TESTS_MESSAGE);
  return true;
}

function renderTrainingScreen() {
  updateAvatar('avatarTraining');
  document.querySelectorAll('.training-tab').forEach(t => t.classList.toggle('active', t.dataset.ttab === state.trainingTab));

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    replaceWithAppMarkup(document.getElementById('trainingList'),
      `<div class="mylist-empty training-offline"><div class="icon" data-static-style="a239">${ICONS.warningTriangle}</div>`
      + `<p>${eh(OFFLINE_TESTS_MESSAGE)}</p><p class="training-offline-hint">Подключитесь к сети — список тестов появится сам.</p></div>`);
    return;
  }

  const completed = state.currentUser ? (state.completedQuizzes[state.currentUser.name] || []) : [];
  // Тесты — только по книгам, которые человек читает или уже прочитал
  // (и по тем, что он уже сдавал). Тест по случайной книге из каталога —
  // шум: его не с чем сверить.
  const mine = new Set(Object.entries(state.mylist || {})
    .filter(([, status]) => status === 'reading' || status === 'completed')
    .map(([id]) => Number(id)));
  let all = state.books.filter(b => mine.has(b.id) || completed.includes(b.id)).map(b => ({
    bookId: b.id,
    book: b,
    completed: completed.includes(b.id),
  }));

  let f = all;
  if (state.trainingTab === 'completed') f = all.filter(t => t.completed);
  if (state.trainingTab === 'pending') f = all.filter(t => !t.completed);

  // Блок «Тест уровня кибербезопасности»: всегда первым на «Все тесты»,
  // на «Не пройдено» — пока уровень не определён, на «Пройдено» — после.
  // Раньше блок был только на «Пройдено», и непрошедшие его не находили.
  let cyberLevelBlock = '';
  const hasLevel = Boolean(state.currentUser && state.currentUser.cyber_level);
  const showLevelBlock = state.currentUser && (
    state.trainingTab === 'all'
    || (state.trainingTab === 'completed' && hasLevel)
    || (state.trainingTab === 'pending' && !hasLevel)
  );
  if (showLevelBlock) {
    const lvl = state.currentUser.cyber_level;
    if (lvl) {
      const info = getCyberLevelInfo(lvl);
      cyberLevelBlock = `
        <div data-static-style="a324">
          <div data-static-style="a325">
            <div data-static-style="a326">${info.icon.replace('width="20"','width="28"').replace('height="20"','height="28"')}</div>
            <div data-static-style="a004">
              <div data-static-style="a192">Твой уровень кибербезопасности</div>
              <div data-static-style="a327">${eh(info.name)}</div>
            </div>
          </div>
          <div data-static-style="a328">
            Результат не устраивает? Можно пересдать — текущий заменится новым.
          </div>
          <div data-static-style="a108">
            <button data-onclick="openCyberLevelModal()" data-static-style="a329">Подробнее</button>
            <button data-onclick="startCyberLevelTest()" data-static-style="a330">Пройти заново</button>
          </div>
        </div>
      `;
    } else {
      // Юзер не проходил тест — предлагаем пройти
      cyberLevelBlock = `
        <div data-static-style="a324">
          <div data-static-style="a325">
            <div data-static-style="a326">${ICONS.target.replace('width="22"','width="28"').replace('height="22"','height="28"')}</div>
            <div data-static-style="a004">
              <div data-static-style="a192">Тест уровня</div>
              <div data-static-style="a145">Определи свой уровень</div>
            </div>
          </div>
          <div data-static-style="a328">
            20 вопросов из 5 тем кибербезопасности. Узнай, где у тебя пробелы и что подтянуть.
          </div>
          <button data-onclick="startCyberLevelTest()" data-static-style="a331">Пройти тест уровня</button>
        </div>
      `;
    }
  }

  const visible = f.slice(0, trainingVisibleCount);
  const rest = f.length - visible.length;
  const moreHtml = rest > 0
    ? `<button type="button" class="btn-quiz training-more" id="trainingMoreBtn">Показать ещё (${rest})</button>`
    : '';
  const listHtml = f.length
    ? visible.map(t => `<button type="button" class="training-card" data-onclick="startQuizFromTraining(${t.bookId})">
        <h4>${eh(t.book.title)}</h4>
        <div class="meta">${eh(bookCategoriesText(t.book))}</div>
        <span class="status ${t.completed ? 'status-completed' : 'status-pending'}">${t.completed ? ICONS.check + ' Пройдено' : ICONS.clock + ' Не пройдено'}</span>
      </button>`).join('') + moreHtml
    : `<div class="mylist-empty"><div class="icon" data-static-style="a239">${ICONS.education}</div><p>${state.trainingTab === 'completed'
      ? 'Пройденных тестов пока нет'
      : 'Здесь появятся тесты по книгам, которые вы читаете. Откройте книгу — и тест по ней будет ждать здесь.'}</p></div>`;

  replaceWithAppMarkup(document.getElementById('trainingList'), cyberLevelBlock + listHtml);
  document.getElementById('trainingMoreBtn')?.addEventListener('click', () => {
    trainingVisibleCount += TRAINING_PAGE_SIZE * 2;
    renderTrainingScreen();
  });
}

async function restartOnboardingFromTraining() {
  // Если юзер уже проходил — спрашиваем подтверждение
  if (state.currentUser && state.currentUser.cyber_level) {
    if (!(await appConfirm('Текущий результат будет заменён новым.', { title: 'Пройти тест заново?', confirmText: 'Пройти' }))) return;
  }
  renderLevelChoices();
  navigateTo('onboarding');
  document.getElementById('onboardingResult').classList.add('hidden');
  document.getElementById('onboardingQuiz').classList.add('hidden');
  document.getElementById('onboardingWelcome').classList.remove('hidden');
}

// Тест уровня из раздела «Тестирование»: сразу к вопросам, без экрана
// выбора «знаю свой уровень / хочу тест».
async function startCyberLevelTest() {
  if (testsBlockedOffline()) return;
  if (state.currentUser && state.currentUser.cyber_level) {
    if (!(await appConfirm('Текущий результат будет заменён новым.', { title: 'Пройти тест заново?', confirmText: 'Пройти' }))) return;
  }
  navigateTo('onboarding');
  document.getElementById('onboardingResult').classList.add('hidden');
  startOnboardingQuiz();
}

function startQuizFromTraining(bid) {
  if (testsBlockedOffline()) return;
  openBookDetail(bid);
  setTimeout(() => document.querySelector('.detail-tab[data-dtab="training"]')?.click(), 100);
}

// Пропала или появилась сеть, пока открыт экран тестов, — перерисовываем.
if (typeof window !== 'undefined' && window.addEventListener) {
  ['online', 'offline'].forEach(type => window.addEventListener(type, () => {
    if (state.currentScreen === 'training') renderTrainingScreen();
  }));
}
