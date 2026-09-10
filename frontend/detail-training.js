// Вкладка обучения на странице книги и админское пересоздание теста.
function renderDetailTraining() {
  if (!currentBookId) return;
  const isAdmin = state.currentUser?.role === 'admin';
  const c = state.completedQuizzes[state.currentUser?.name] || [];
  if (c.includes(currentBookId)) {
    const panel = document.createElement('div');
    panel.setAttribute('data-static-style', 'a166');
    const complete = document.createElement('div');
    complete.setAttribute('data-static-style', 'a239');
    appendTrustedIcon(complete, ICONS.check);
    const message = document.createElement('p');
    message.textContent = 'Пройдено!';
    const retry = document.createElement('button');
    retry.className = 'btn-quiz primary';
    retry.setAttribute('data-static-style', 'a485');
    appendTrustedIcon(retry, ICONS.refresh);
    const retryLabel = document.createElement('span');
    retryLabel.textContent = 'Заново';
    retry.appendChild(retryLabel);
    retry.addEventListener('click', () => startQuiz(currentBookId));
    const adminActions = document.createElement('div');
    if (isAdmin) {
      const regenerate = document.createElement('button');
      regenerate.id = 'regenQuizBtn';
      regenerate.setAttribute('data-static-style', 'a484');
      appendTrustedIcon(regenerate, ICONS.sparkles || '');
      const regenerateLabel = document.createElement('span');
      regenerateLabel.textContent = 'Пересоздать тест (ИИ)';
      regenerate.appendChild(regenerateLabel);
      regenerate.addEventListener('click', () => regenerateBookQuiz(currentBookId));
      adminActions.appendChild(regenerate);
    }
    panel.append(complete, message, retry, adminActions);
    document.getElementById('detailTabTraining').replaceChildren(panel);
  } else {
    startQuiz(currentBookId);
  }
}

async function regenerateBookQuiz(bookId) {
  if (!confirm('Пересоздать тест через ИИ? Старые вопросы будут заменены.')) return;
  const btn = document.getElementById('regenQuizBtn');
  if (btn) { btn.disabled = true; btn.querySelector('span').textContent = 'Генерация…'; }
  try {
    const questions = await api.library.regenerateQuiz(bookId);
    showToast(`Тест пересоздан: ${questions.length} вопросов`);
    startQuiz(bookId);
  } catch (err) {
    const msg = (err && err.status) ? `Ошибка (${err.status})` : 'Не удалось пересоздать тест';
    showToast(msg);
    if (btn) { btn.disabled = false; btn.querySelector('span').textContent = 'Пересоздать тест (ИИ)'; }
  }
}
