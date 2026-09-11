// Блок «Продолжить чтение» и скрытые пользователем книги.
//
// Сам блок рисует renderContinueScroll ниже. Здесь только список скрытых
// вручную книг. Раньше рядом жила renderResumeReading — вторая, дублирующая
// отрисовка того же блока; её отключили, но код остался, и правки уходили
// именно в него, не доезжая до экрана.

const RESUME_HIDDEN_KEY = 'aegis_resume_hidden';

function getResumeHidden() {
  try { return JSON.parse(lsGet(RESUME_HIDDEN_KEY) || '[]'); } catch (_) { return []; }
}

function hideFromResume(bookId) {
  const hidden = getResumeHidden();
  if (!hidden.includes(bookId)) hidden.push(bookId);
  lsSet(RESUME_HIDDEN_KEY, JSON.stringify(hidden));
  if (navigator.vibrate) navigator.vibrate(10);
  // Перерисовываем главную целиком: блок «Продолжить» живёт внутри неё, и
  // отдельной точки обновления у него нет.
  renderHome();
}

function unhideFromResume(bookId) {
  const hidden = getResumeHidden().filter(id => id !== bookId);
  lsSet(RESUME_HIDDEN_KEY, JSON.stringify(hidden));
}

function renderBookScroll(id, books, query) {
  replaceWithAppMarkup(document.getElementById(id), books.map(b => cardHTML(b, query)).join(''));
}

// Сколько книг показывать в блоке «Продолжить». Больше — и он перестаёт быть
// подсказкой «на чём я остановилась» и превращается во вторую библиотеку.
const CONTINUE_LIMIT = 5;

function renderContinueScroll(books, query) {
  const section = document.getElementById('sectionContinue');
  const container = document.getElementById('scrollContinue');
  if (!container) return;

  const hidden = getResumeHidden();

  const items = books
    .filter(b => {
      const p = state.readingProgress[b.id];
      if (!p || !p.started) return false;
      if (hidden.includes(b.id)) return false;
      // Дочитанным здесь не место: блок про то, к чему вернуться.
      // finished_at с сервера во фронт не приходит, считаем по страницам.
      const total = p.totalPages || 0;
      if (total > 1 && (p.currentPage || 0) >= total) return false;
      return true;
    })
    .sort((a, b) => {
      const ta = state.readingProgress[a.id]?.lastReadAt;
      const tb = state.readingProgress[b.id]?.lastReadAt;
      return (tb ? new Date(tb).getTime() : 0) - (ta ? new Date(ta).getTime() : 0);
    })
    .slice(0, CONTINUE_LIMIT);

  // Пустой блок с заголовком выглядит поломкой, поэтому прячем целиком.
  if (section) section.style.display = items.length ? '' : 'none';
  replaceWithAppMarkup(container, items
    .map(b => cardHTML(b, query, { removable: true }))
    .join(''));
}

