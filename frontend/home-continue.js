// Блок «Продолжить чтение» и скрытые пользователем книги.
//
// Сам блок рисует renderContinueScroll ниже. Здесь только список скрытых
// вручную книг. Раньше рядом жила renderResumeReading — вторая, дублирующая
// отрисовка того же блока; её отключили, но код остался, и правки уходили
// именно в него, не доезжая до экрана.

const RESUME_HIDDEN_KEY = 'aegis_resume_hidden';
// Локальный список однажды перенесён в аккаунт (на этом устройстве).
const RESUME_HIDDEN_SYNCED_KEY = 'aegis_resume_hidden_synced';

// Список убранных книг хранится в аккаунте (resume_hidden), а на устройстве
// лежит его копия — для мгновенной отрисовки и работы без сети. Раньше он
// жил только в localStorage: убранная книга возвращалась на другом
// устройстве, в приложении с экрана «Домой» (у него своё хранилище) и после
// очистки данных браузера.
function getResumeHidden() {
  try {
    const list = JSON.parse(lsGet(RESUME_HIDDEN_KEY) || '[]');
    return Array.isArray(list) ? list.map(Number).filter(id => Number.isInteger(id) && id > 0) : [];
  } catch (_) { return []; }
}

function _saveResumeHidden(list, syncToAccount = true) {
  lsSet(RESUME_HIDDEN_KEY, JSON.stringify(list));
  if (state.currentUser) state.currentUser.resume_hidden = list.slice();
  if (!syncToAccount || typeof api === 'undefined' || !api.updateMe || !state.currentUser) return;
  api.updateMe({ resume_hidden: list }).catch(error => {
    // Без сети список останется на устройстве и уйдёт в аккаунт при
    // следующем входе (см. syncResumeHiddenFromAccount).
    lsSet(RESUME_HIDDEN_SYNCED_KEY, '');
    console.info('Список «Продолжить» не сохранился в аккаунт:', error && error.message);
  });
}

// Вызывается после входа, когда пришёл профиль. Аккаунт — источник истины;
// локальные скрытия, которых в аккаунте ещё нет, переносим туда один раз
// (старые версии хранили их только на устройстве).
function syncResumeHiddenFromAccount() {
  const user = state.currentUser;
  if (!user) return;
  const server = Array.isArray(user.resume_hidden) ? user.resume_hidden.map(Number) : null;
  const local = getResumeHidden();
  const synced = lsGet(RESUME_HIDDEN_SYNCED_KEY) === '1';
  if (server && synced) {
    lsSet(RESUME_HIDDEN_KEY, JSON.stringify(server));
    return;
  }
  const merged = Array.from(new Set([...(server || []), ...local]));
  const changed = !server || merged.length !== server.length;
  lsSet(RESUME_HIDDEN_KEY, JSON.stringify(merged));
  user.resume_hidden = merged.slice();
  if (!changed) { lsSet(RESUME_HIDDEN_SYNCED_KEY, '1'); return; }
  if (typeof api === 'undefined' || !api.updateMe) return;
  api.updateMe({ resume_hidden: merged })
    .then(() => lsSet(RESUME_HIDDEN_SYNCED_KEY, '1'))
    .catch(() => { /* Попробуем при следующем входе. */ });
}

function hideFromResume(bookId) {
  const hidden = getResumeHidden();
  if (!hidden.includes(bookId)) hidden.push(bookId);
  _saveResumeHidden(hidden);
  if (navigator.vibrate) navigator.vibrate(10);
  // Перерисовываем главную целиком: блок «Продолжить» живёт внутри неё, и
  // отдельной точки обновления у него нет.
  renderHome();
}

// Книгу снова открыли — она опять актуальна и возвращается в «Продолжить».
function unhideFromResume(bookId) {
  const hidden = getResumeHidden();
  if (!hidden.includes(bookId)) return;   // не трогаем аккаунт при каждом открытии
  _saveResumeHidden(hidden.filter(id => id !== bookId));
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

