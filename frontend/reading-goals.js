// Цели чтения, сохраняемые локально для текущего пользователя.
const READING_GOAL_KEY = 'aegis_reading_goal';
const BOOKS_GOAL_KEY = 'aegis_books_goal';

function getBooksGoal() {
  try { return JSON.parse(lsGet(BOOKS_GOAL_KEY) || 'null'); } catch (_) { return null; }
}

function saveBooksGoalFromUI() {
  const input = document.getElementById('booksGoalCount');
  const count = parseInt(input?.value) || window._booksGoalCount || 0;
  const period = window._booksGoalPeriod || (getBooksGoal()?.period) || 'quarter';
  if (!count || count < 1) { showToast('Укажите количество книг'); return; }
  setBooksGoal(count, period);
}

function setBooksGoal(count, period) {
  if (!count) { lsRemove(BOOKS_GOAL_KEY); }
  else { lsSet(BOOKS_GOAL_KEY, JSON.stringify({ count, period, since: new Date().toISOString() })); }
  renderBooksGoalWidget();
  if (document.getElementById('settingsContent')) renderSettingsPersonalizationTab(document.getElementById('settingsContent'));
  showToast(count ? `Цель: ${count} книг / ${period === 'month' ? 'месяц' : period === 'quarter' ? 'квартал' : 'год'}` : 'Цель снята');
}

function booksCompletedInPeriod() {
  if (!getBooksGoal()) return 0;
  // У записей списка пока нет даты завершения, поэтому учитываются все completed.
  return Object.values(state.mylist || {}).filter(s => s === 'completed').length;
}

function getReadingGoal() { return parseInt(lsGet(READING_GOAL_KEY) || '20', 10); }
function setReadingGoal(n) {
  lsSet(READING_GOAL_KEY, String(n));
  renderSettingsPersonalizationTab(document.getElementById('settingsContent'));
  showToast(`Цель: ${n} стр./день`);
}
