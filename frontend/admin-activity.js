// Админка → «Активность»: кто и когда заходил, что открывал и нажимал.
//
// Список пользователей с последним заходом, затем хронология одного
// пользователя по сеансам (сеанс — одно открытие приложения). Данные
// собирает usage-tracker.js; хранятся 90 дней.

const ACTIVITY_SCREEN_LABELS = {
  home: 'Главная',
  catalog: 'Каталог',
  mylist: 'Мой список',
  training: 'Тестирование',
  profile: 'Профиль',
  settings: 'Настройки',
  admin: 'Админ-панель',
  detail: 'Карточка книги',
  reader: 'Читалка',
  assistant: 'Ассистент',
  onboarding: 'Тест уровня',
  auth: 'Вход',
};

const ACTIVITY_ACTION_LABELS = {
  addNoteToSelection: 'Добавил заметку к выделенному',
  aiQuick: 'Быстрый вопрос ИИ в читалке',
  answerCertQuestion: 'Ответил на вопрос аттестации',
  answerQuiz: 'Ответил на вопрос теста',
  applyFilters: 'Применил фильтры каталога',
  assistantOpenBook: 'Открыл книгу из ответа ассистента',
  assistantQuick: 'Быстрый вопрос ассистенту',
  clearAssistantChat: 'Очистил чат ассистента',
  clearSearchInput: 'Очистил поиск',
  closeAIPanel: 'Закрыл панель ИИ',
  closeARSchemeMenu: 'Закрыл список схем',
  closeReader: 'Закрыл читалку',
  createCollectionFromModal: 'Создал подборку',
  deleteAnnotation: 'Удалил заметку',
  deleteReview: 'Удалил отзыв',
  downloadCertificateAndClose: 'Скачал сертификат',
  explainSelectionTerm: 'Попросил объяснить термин',
  exportNotes: 'Выгрузил заметки',
  finishOnboarding: 'Завершил тест уровня',
  finishQuiz: 'Завершил тест',
  goBackFromDetail: 'Вернулся из карточки книги',
  highlightSelection: 'Выделил текст в книге',
  logout: 'Вышел из аккаунта',
  lookupSelectionWord: 'Посмотрел значение слова',
  nextQuestion: 'Следующий вопрос теста',
  openARSchemeMenu: 'Открыл список схем',
  openARWithScheme: 'Открыл схему',
  openAddModal: 'Открыл «Добавить в подборку»',
  openAvatarPicker: 'Выбор аватара',
  openBookmarksList: 'Открыл закладки',
  openCertificationModal: 'Открыл аттестацию',
  openChatHistory: 'Открыл историю чатов',
  openCyberLevelModal: 'Открыл уровень подготовки',
  openGoToPageDialog: 'Переход на страницу',
  openPrivacyPolicy: 'Открыл политику конфиденциальности',
  openSettingsTab: 'Открыл раздел настроек',
  openShortcutsModal: 'Открыл горячие клавиши',
  openTOC: 'Открыл оглавление',
  openUserAgreement: 'Открыл пользовательское соглашение',
  removeBookOffline: 'Удалил книгу из офлайна',
  resetFilters: 'Сбросил фильтры',
  retakeQuiz: 'Перепроходит тест',
  runFullTextSearch: 'Поиск по тексту книг',
  sendAIMessage: 'Задал вопрос ИИ в читалке',
  sendAssistantMessage: 'Задал вопрос ассистенту',
  setHomeBooksTab: 'Переключил подборку на главной',
  startCyberLevelTest: 'Начал тест уровня',
  startNewChat: 'Новый чат с ассистентом',
  startPomodoro: 'Запустил помодоро',
  startQuizFromTraining: 'Начал тест',
  submitCertExam: 'Сдал аттестацию',
  submitComment: 'Написал комментарий',
  submitReview: 'Оставил отзыв',
  summarizeCurrentChapter: 'Пересказ главы',
  toggleAIPanel: 'Панель ИИ в читалке',
  toggleBookInCollection: 'Изменил подборку',
  toggleCatalogPanel: 'Панель каталога',
  togglePageBookmark: 'Закладка на странице',
  toggleReaderSearch: 'Поиск в книге',
  toggleReaderTheme: 'Сменил тему читалки',
  'appearance:chosen': 'Выбрал оформление',
  'appearance:skipped': 'Пропустил выбор оформления',
};

let activityDays = 30;

function activityEventLabel(event) {
  if (event.kind === 'book') {
    const book = event.book_title ? `«${event.book_title}»` : 'книгу (удалена из каталога)';
    return event.name === 'read' ? `Читал ${book}` : `Открыл карточку ${book}`;
  }
  if (event.kind === 'screen') {
    return `Экран: ${ACTIVITY_SCREEN_LABELS[event.name] || event.name}`;
  }
  if (event.name.startsWith('scheme:')) return `Открыл схему: ${event.name.slice(7)}`;
  return ACTIVITY_ACTION_LABELS[event.name] || `Нажал: ${event.name}`;
}

// «Открыл карточку …» сразу же даёт экран «Карточка книги», «Читал …» —
// экран «Читалка». Второй строкой это ничего не добавляет — убираем.
function activityTimelineEvents(events) {
  const sameAsBook = { detail: 'detail', reader: 'read' };
  return events.filter((event, index) => {
    const previous = events[index - 1];
    return !(event.kind === 'screen' && previous && previous.kind === 'book'
      && sameAsBook[event.name] === previous.name);
  });
}

function formatActivityDate(value, { withTime = true } = {}) {
  const date = new Date(value);
  const options = { day: 'numeric', month: 'long' };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  if (withTime) Object.assign(options, { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleString('ru-RU', options);
}

function formatActivityTime(value) {
  return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatActivityDuration(start, end) {
  const minutes = Math.round((new Date(end) - new Date(start)) / 60000);
  if (minutes < 1) return 'меньше минуты';
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ч ${minutes % 60} мин`;
}

function activityToolbar(onPeriod) {
  const toolbar = document.createElement('div');
  toolbar.className = 'usage-toolbar';
  const periods = document.createElement('div');
  periods.className = 'usage-periods';
  [[7, '7 дней'], [30, '30 дней'], [90, '90 дней']].forEach(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-tool' + (value === activityDays ? ' admin-tool--primary' : '');
    button.textContent = label;
    button.addEventListener('click', () => { activityDays = value; onPeriod(); });
    periods.appendChild(button);
  });
  const note = document.createElement('p');
  note.className = 'analytics-scope-note';
  note.textContent = 'Входы, экраны, нажатия и открытые книги. Что человек вводит сам (поиск, заметки, сообщения), не записывается. Хранится 90 дней.';
  toolbar.append(periods, note);
  return toolbar;
}

async function renderAdminActivity() {
  const container = document.getElementById('adActivity');
  if (!container) return;
  const toolbar = activityToolbar(renderAdminActivity);
  const status = document.createElement('p');
  status.className = 'activity-status';
  status.textContent = 'Загрузка…';
  container.replaceChildren(toolbar, status);

  let users;
  try {
    users = await api.library.adminActivity(activityDays);
  } catch (err) {
    status.textContent = 'Не удалось загрузить активность';
    return;
  }
  if (!users.length) {
    status.textContent = 'За этот период активности нет. Записи появляются, когда пользователи заходят в обновлённое приложение.';
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  table.className = 'activity-table';
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Пользователь', 'Последний заход', 'Сеансов', 'Действий', 'Книг', 'Устройство'].forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    headRow.appendChild(th);
  });
  head.appendChild(headRow);
  const body = document.createElement('tbody');
  users.forEach(user => {
    const row = document.createElement('tr');
    row.className = 'activity-user-row';
    row.tabIndex = 0;
    const open = () => renderAdminActivityUser(user.user_id);
    row.addEventListener('click', open);
    row.addEventListener('keydown', event => { if (event.key === 'Enter') open(); });
    [
      user.username,
      formatActivityDate(user.last_seen),
      String(user.sessions),
      String(user.events),
      String(user.books_opened),
      user.device || '—',
    ].forEach((text, index) => {
      const cell = document.createElement('td');
      cell.textContent = text;
      if (index === 0) cell.className = 'activity-username';
      row.appendChild(cell);
    });
    body.appendChild(row);
  });
  table.append(head, body);
  wrap.appendChild(table);
  status.textContent = `Пользователей: ${users.length}. Нажмите на строку, чтобы увидеть, что человек делал.`;
  container.replaceChildren(toolbar, status, wrap);
}

async function renderAdminActivityUser(userId) {
  const container = document.getElementById('adActivity');
  if (!container) return;
  const header = document.createElement('div');
  header.className = 'activity-detail-header';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'admin-tool';
  back.textContent = '← Все пользователи';
  back.addEventListener('click', () => renderAdminActivity());
  const title = document.createElement('h3');
  title.className = 'activity-detail-title';
  title.textContent = 'Загрузка…';
  header.append(back, title);
  const toolbar = activityToolbar(() => renderAdminActivityUser(userId));
  container.replaceChildren(header, toolbar);

  let data;
  try {
    data = await api.library.adminActivityUser(userId, activityDays);
  } catch (err) {
    title.textContent = 'Не удалось загрузить активность';
    return;
  }
  title.textContent = data.username;
  if (!data.sessions.length) {
    const empty = document.createElement('p');
    empty.className = 'activity-status';
    empty.textContent = 'За этот период пользователь не заходил.';
    container.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'activity-sessions';
  data.sessions.forEach((session, index) => {
    const card = document.createElement('details');
    card.className = 'activity-session';
    if (index === 0) card.open = true;
    const summary = document.createElement('summary');
    const when = document.createElement('span');
    when.className = 'activity-session-when';
    when.textContent = `${formatActivityDate(session.started_at)} · ${formatActivityDuration(session.started_at, session.ended_at)}`;
    const meta = document.createElement('span');
    meta.className = 'activity-session-meta';
    meta.textContent = `${session.device || 'устройство неизвестно'} · действий: ${activityTimelineEvents(session.events).length}`;
    summary.append(when, meta);
    card.appendChild(summary);

    const timeline = document.createElement('ol');
    timeline.className = 'activity-timeline';
    if (!session.events.length) {
      const item = document.createElement('li');
      item.textContent = 'Открыл приложение, больше ничего не делал';
      timeline.appendChild(item);
    }
    activityTimelineEvents(session.events).forEach(event => {
      const item = document.createElement('li');
      item.className = `activity-event activity-event--${event.kind}`;
      const time = document.createElement('time');
      time.dateTime = event.at;
      time.textContent = formatActivityTime(event.at);
      const text = document.createElement('span');
      text.textContent = activityEventLabel(event);
      if (event.kind === 'book' && event.book_id && (state.books || []).some(b => b.id === event.book_id)) {
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'activity-book-link';
        link.textContent = 'открыть';
        link.addEventListener('click', () => openBookDetail(event.book_id));
        item.append(time, text, link);
      } else {
        item.append(time, text);
      }
      timeline.appendChild(item);
    });
    card.appendChild(timeline);
    list.appendChild(card);
  });
  container.appendChild(list);
  if (data.truncated) {
    const note = document.createElement('p');
    note.className = 'analytics-scope-note';
    note.textContent = 'Показаны последние сеансы — выберите период покороче, чтобы увидеть всё.';
    container.appendChild(note);
  }
}
