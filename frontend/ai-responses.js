// ========== AI ==========
function generateAIResponse(msg) {
  const m = msg.toLowerCase();

  if (/рекомендац|посоветуй|что почитать|похож/i.test(m)) {
    const r = getRecommendations(3);
    return r.length ? `Рекомендую:\n\n${r.map((b, i) => `${i + 1}. ${b.title} (${b.rating})`).join('\n')}` : 'Начните читать книги!';
  }

  if (/саммари|опиши|о чем/i.test(m)) {
    return state.currentBook ? `Книга: ${state.currentBook.title}\n\n${state.currentBook.desc}` : 'Откройте книгу';
  }

  if (/тест|вопрос|quiz/i.test(m)) {
    if (state.currentBook) {
      state.pendingAiAction = 'quiz_context';
      return `Хотите сгенерировать тест:\n\n1. По текущей книге "${state.currentBook.title}"\n2. По всем прочитанным книгам\n\nНапишите "1" или "2" для выбора.`;
    } else {
      const completedBooks = Object.entries(state.mylist || {}).filter(([, s]) => s === 'completed').map(([id]) => parseInt(id));
      if (completedBooks.length > 0) {
        state.pendingAiAction = 'quiz_all';
        return `У вас ${completedBooks.length} прочитанных книг. Сгенерировать комбинированный тест по всем? (напишите "да")`;
      }
      return 'Откройте книгу или прочитайте хотя бы одну для генерации теста.';
    }
  }

  if (state.pendingAiAction === 'quiz_context' && (m === '1' || m.includes('текущ') || m.includes('эта'))) {
    state.pendingAiAction = null;
    return `Тест по "${state.currentBook.title}" готов! Перейдите на вкладку "Тестирование" для прохождения.`;
  }

  if (state.pendingAiAction === 'quiz_context' && (m === '2' || m.includes('все') || m.includes('прочитан'))) {
    state.pendingAiAction = null;
    const completedBooks = Object.entries(state.mylist || {}).filter(([, s]) => s === 'completed').map(([id]) => parseInt(id));
    if (completedBooks.length > 0) {
      startCombinedQuiz(completedBooks);
      return `Комбинированный тест по ${completedBooks.length} книгам готов! Перейдите на вкладку "Тестирование".`;
    }
    return 'Нет прочитанных книг для комбинированного теста.';
  }

  if (state.pendingAiAction === 'quiz_all' && (m === 'да' || m === 'yes' || m === 'ок')) {
    state.pendingAiAction = null;
    const completedBooks = Object.entries(state.mylist || {}).filter(([, s]) => s === 'completed').map(([id]) => parseInt(id));
    if (completedBooks.length > 0) {
      startCombinedQuiz(completedBooks);
      return `Комбинированный тест готов! Перейдите на вкладку "Тестирование".`;
    }
    return 'Нет прочитанных книг.';
  }

  if (/прогресс|статистик/i.test(m)) {
    const xp = state.gamification.xp;
    return `Уровень: ${calculateLevel(xp).level} | XP: ${xp} | Стрик: ${getStreak()}`;
  }

  return 'Я могу: Саммари | Тесты | Рекомендации | Прогресс';
}
