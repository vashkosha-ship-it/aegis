/* Замена инлайновым обработчикам, которые нельзя было перенести в data-onclick
 * механически: они использовали this, event или содержали несколько выражений.
 *
 * Логика не изменилась — просто переехала из атрибута в именованную функцию.
 * Элемент приходит последним аргументом: диспетчер добавляет его, когда в
 * разметке указано data-args="this".
 */

/* ---- подмена картинки при ошибке загрузки ---- */

// Заранее известные варианты замены. Раньше разметка лежала прямо в атрибуте
// data-fallback и подставлялась через outerHTML — то есть внедрённая на
// страницу картинка могла принести с собой любой HTML и заменить себя им.
// Скрипт бы не выполнился (политика запрещает), но новая разметка могла нести
// data-onclick с разрешённым именем — получалась цепочка из внедрения в
// подмену обложки и дальше в вызов обработчика.
//
// Теперь атрибут выбирает вариант из этого списка, а не описывает его.
const FALLBACK_BUILDERS = {
  /** Обложка книги: иконка вместо не загрузившейся картинки. */
  cover() {
    return _iconNode(window.ICONS && window.ICONS.bookCover);
  },

  /** Обложка в сетке: та же иконка, но в обёртке с фоном. */
  coverBg() {
    const wrap = document.createElement('div');
    wrap.className = 'cover-bg';
    const icon = _iconNode(window.ICONS && window.ICONS.bookCover);
    if (icon) wrap.appendChild(icon);
    return wrap;
  },

  /** Аватар: инициал или эмодзи из data-fallback-text. */
  text(el) {
    const node = document.createElement('div');
    node.className = el.getAttribute('data-fallback-class') || '';
    // textContent, а не innerHTML: значение приходит из данных пользователя
    node.textContent = el.getAttribute('data-fallback-text') || '';
    return node;
  },
};

/** Разобрать иконку из константы приложения в узел DOM.
 *
 * Строка берётся из ICONS — она задана в коде и пользователем не управляется,
 * поэтому разбор её как разметки безопасен. Именно это отличает её от
 * содержимого атрибута, которое могло прийти откуда угодно.
 */
function _iconNode(markup) {
  if (!markup) return null;
  const template = document.createElement('template');
  template.innerHTML = markup;
  return template.content.firstElementChild;
}

function replaceWithFallback(el) {
  const kind = el.getAttribute('data-fallback');
  const build = Object.prototype.hasOwnProperty.call(FALLBACK_BUILDERS, kind)
    ? FALLBACK_BUILDERS[kind]
    : null;

  if (!build) {
    // Неизвестный вариант — просто убираем сломанную картинку. Подставлять
    // что-то из атрибута нельзя: ровно этим и пользовались бы.
    el.remove();
    return;
  }

  const node = build(el);
  if (node) {
    el.replaceWith(node);
  } else {
    el.remove();
  }
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

/* ---- админка: удаление отзыва ----
 * В разметке стояло два вызова подряд: deleteReview(...) и обновление списка.
 * Диспетчер выполняет ровно один вызов, поэтому кнопка не работала вовсе —
 * след того же кодмода, что и крестики модальных окон.
 */

async function deleteReviewAndRefresh(bookId, reviewId) {
  await deleteReview(bookId, reviewId);
  await loadAndRenderAdminReviews();
}
