// Вкладка обучения на странице книги и админское пересоздание теста.
function renderDetailTraining() {
  if (!currentBookId) return;
  const isAdmin = state.currentUser?.role === 'admin';
  const adminBtn = isAdmin
    ? `<button data-onclick="regenerateBookQuiz(${currentBookId})" data-nonce="${sensitiveNonce()}" id="regenQuizBtn" data-static-style="a484">${ICONS.sparkles || ''}<span>Пересоздать тест (ИИ)</span></button>`
    : '';
  const c = state.completedQuizzes[state.currentUser?.name] || [];
  if (c.includes(currentBookId)) {
    document.getElementById('detailTabTraining').innerHTML = `
      <div data-static-style="a166">
        <div data-static-style="a239">${ICONS.check}</div>
        <p>Пройдено!</p>
        <button class="btn-quiz primary" data-onclick="startQuiz(${currentBookId})" data-static-style="a485">${ICONS.refresh}<span>Заново</span></button>
        <div>${adminBtn}</div>
        </div>`;
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
