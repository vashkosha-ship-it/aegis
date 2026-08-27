/* Замена инлайновым обработчикам, которые нельзя было перенести в data-onclick
 * механически: они использовали this, event или содержали несколько выражений.
 *
 * Логика не изменилась — просто переехала из атрибута в именованную функцию.
 * Элемент приходит последним аргументом: диспетчер добавляет его, когда в
 * разметке указано data-args="this".
 */

/* ---- подмена картинки при ошибке загрузки ---- */

function replaceWithFallback(el) {
  // Разметка запасного варианта лежит в data-fallback, а не в обработчике
  el.outerHTML = el.getAttribute('data-fallback') || '';
}

/* ---- аннотации ---- */

function deleteAnnotationFromTooltip(bookId, id, depth, el) {
  deleteAnnotation(bookId, id);
  var node = el;
  for (var i = 0; i < depth && node; i++) node = node.parentElement;
  if (node) node.remove();
}

/* ---- настройки ---- */

function onWifiOnlyToggle(el) {
  // Значение читаем до перерисовки: она заменит сам элемент
  var checked = el.checked;
  setWifiOnly(checked);
  renderSettingsScreen();
  showToast(checked ? 'Только Wi-Fi' : 'Любая сеть');
}

function onAutoPreloadToggle(el) {
  var checked = el.checked;
  setAutoPreload(checked);
  renderSettingsScreen();
  showToast(checked ? 'Автосохранение включено' : 'Автосохранение выключено');
}

/* ---- цель по книгам ---- */

function _resetGoalButtons(selector) {
  document.querySelectorAll(selector).forEach(function (b) {
    b.style.background = 'var(--bg-primary)';
    b.style.color = 'var(--text-secondary)';
    b.style.borderColor = 'var(--border)';
  });
}

function _markGoalButtonActive(el) {
  el.style.background = 'var(--accent-gradient)';
  el.style.color = '#fff';
  el.style.borderColor = 'transparent';
}

function selectBooksGoalCount(n, el) {
  window._booksGoalCount = n;
  _resetGoalButtons('.bg-count-btn');
  _markGoalButtonActive(el);
  var input = document.getElementById('booksGoalCount');
  if (input) input.value = n;
}

function selectBooksGoalPeriod(value, el) {
  window._booksGoalPeriod = value;
  _resetGoalButtons('.bg-period-btn');
  _markGoalButtonActive(el);
}

/* ---- статус книги ---- */

function onBookStatusChange(bookId, el) {
  updateBookStatus(bookId, el.value);
}

/* ---- поиск и чат ---- */

function onSearchInput() {
  state.booksPage = 1;
  renderHome();
}

function onSearchKeydown(ev) {
  if (ev.key === 'Enter') runFullTextSearch();
}

function onAiInputKeydown(ev) {
  if (ev.key === 'Enter') sendAIMessage();
}

/* ---- закрытие модальных окон и делегирование клика ----
 * Раньше в разметке стояло document.getElementById('x').remove(). Диспетчер
 * такие цепочки не выполняет (и не должен: через них можно дотянуться куда
 * угодно), поэтому — именованные функции.
 */

function closeModal(id) {
  var el = document.getElementById(id);
  if (el) el.remove();
}

function clickElement(id) {
  var el = document.getElementById(id);
  if (el) el.click();
}
