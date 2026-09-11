// ========== TRAINING ==========
document.getElementById('trainingTabs').addEventListener('click', e => {
  const t = e.target.closest('.training-tab');
  if (!t) return;
  state.trainingTab = t.dataset.ttab;
  renderTrainingScreen();
});

function renderTrainingScreen() {
  updateAvatar('avatarTraining');
  document.querySelectorAll('.training-tab').forEach(t => t.classList.toggle('active', t.dataset.ttab === state.trainingTab));

  const completed = state.currentUser ? (state.completedQuizzes[state.currentUser.name] || []) : [];
  let all = state.books.map(b => ({
    bookId: b.id,
    book: b,
    completed: completed.includes(b.id),
  }));

  let f = all;
  if (state.trainingTab === 'completed') f = all.filter(t => t.completed);
  if (state.trainingTab === 'pending') f = all.filter(t => !t.completed);

  // Блок «Тест уровня кибербезопасности» — только на вкладке «Пройдено»
  let cyberLevelBlock = '';
  if (state.trainingTab === 'completed' && state.currentUser) {
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
            <button data-onclick="restartOnboardingFromTraining()" data-static-style="a330">Пройти заново</button>
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
          <button data-onclick="restartOnboardingFromTraining()" data-static-style="a331">Пройти тест уровня</button>
        </div>
      `;
    }
  }

  const listHtml = f.length
    ? f.map(t => `<div class="training-card" data-onclick="startQuizFromTraining(${t.bookId})">
        <h4>${eh(t.book.title)}</h4>
        <div class="meta">${eh(bookCategoriesText(t.book))}</div>
        <span class="status ${t.completed ? 'status-completed' : 'status-pending'}">${t.completed ? ICONS.check + ' Пройдено' : ICONS.clock + ' Не пройдено'}</span>
      </div>`).join('')
    : `<div class="mylist-empty"><div class="icon" data-static-style="a239">${ICONS.education}</div><p>Нет тестов</p></div>`;

  replaceWithAppMarkup(document.getElementById('trainingList'), cyberLevelBlock + listHtml);
}

function restartOnboardingFromTraining() {
  // Если юзер уже проходил — спрашиваем подтверждение
  if (state.currentUser && state.currentUser.cyber_level) {
    if (!confirm('Пройти тест заново? Текущий результат будет заменён новым.')) return;
  }
  renderLevelChoices();
  navigateTo('onboarding');
  document.getElementById('onboardingResult').classList.add('hidden');
  document.getElementById('onboardingQuiz').classList.add('hidden');
  document.getElementById('onboardingWelcome').classList.remove('hidden');
}

function startQuizFromTraining(bid) {
  openBookDetail(bid);
  setTimeout(() => document.querySelector('.detail-tab[data-dtab="training"]')?.click(), 100);
}
