// Аналитика библиотеки и отдельных книг.
let analyticsCharts = {};

// ========== ANALYTICS ==========
function destroyAnalyticsCharts() {
  Object.values(analyticsCharts).forEach(chart => {
    try { chart.destroy(); } catch (e) { /* Chart may already be disposed. */ }
  });
  analyticsCharts = {};
}

// Пустой график без единой точки выглядит как сломанный — пишем словами.
function markAnalyticsEmpty(canvasId, isEmpty, text) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  let note = canvas.parentElement.querySelector('.analytics-empty-note');
  if (isEmpty) {
    if (!note) {
      note = document.createElement('p');
      note.className = 'analytics-empty-note';
      canvas.after(note);
    }
    note.textContent = text;
  } else if (note) {
    note.remove();
  }
  canvas.hidden = isEmpty;
}

async function renderAnalytics() {
  destroyAnalyticsCharts();
  populateAnalyticsBookSelector();

  // Chart.js грузится лениво (vendor-loader.js). Без этого ожидания графики
  // падали с «Chart is not defined» и вкладка оставалась пустой.
  try {
    await ensureChartLoaded();
  } catch (err) {
    console.error(err);
    showToast('Не удалось загрузить библиотеку графиков');
    return;
  }

  // Данные по всем читателям считает сервер. Раньше графики строились из
  // state текущего администратора: «активность» была его личной тепловой
  // картой, а в воронке «открытия» превышали «просмотры».
  let data;
  try {
    data = await api.library.adminAnalytics();
  } catch (err) {
    console.error(err);
    showToast('Не удалось загрузить аналитику');
    return;
  }
  const days = data.activity.map(point => point.date);
  const activityData = data.activity.map(point => point.pages);
  const topBooks = data.top_books;
  const { views: totalViews, opened: totalOpens, reading: totalReadings, completed: totalCompletions } = data.funnel;

  markAnalyticsEmpty('chartReadingActivity', activityData.every(value => !value),
    'За последнюю неделю читатели ещё не листали книги.');
  markAnalyticsEmpty('chartTopBooks', topBooks.length === 0, 'Книги пока никто не начал читать.');
  markAnalyticsEmpty('chartFunnel', !totalOpens, 'Книги пока никто не открывал в читалке.');

  const ctx1 = document.getElementById('chartReadingActivity')?.getContext('2d');
  if (ctx1) {
    analyticsCharts.activity = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: days.map(d => new Date(d).toLocaleDateString('ru', { weekday: 'short' })),
        datasets: [{
          label: 'Страниц прочитано',
          data: activityData,
          borderColor: accentRgba(1),
          backgroundColor: accentRgba(0.1),
          fill: true,
          tension: 0.4,
          pointBackgroundColor: accentRgba(1),
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: INTEGER_TICKS },
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } }
        }
      }
    });
  }

  const ctx2 = document.getElementById('chartTopBooks')?.getContext('2d');
  if (ctx2) {
    analyticsCharts.topBooks = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: topBooks.map(b => b.title.length > 28 ? b.title.slice(0, 27) + '…' : b.title),
        datasets: [{
          label: 'Читателей',
          data: topBooks.map(b => b.readers),
          backgroundColor: topBooks.map((_, i) => {
            const alphas = [0.8, 0.65, 0.5, 0.35, 0.2];
            return accentRgba(alphas[i] || 0.15);
          }),
          borderColor: accentRgba(1),
          borderWidth: 1,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: INTEGER_TICKS },
          y: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } } }
        }
      }
    });
  }

  // Воронка — в парах «читатель — книга»: каждый шаг внутри предыдущего.
  // «Просмотры» карточек считаются с повторами, это другая единица, поэтому
  // они подписаны отдельно, а не стоят первым столбцом.
  const ctx3 = document.getElementById('chartFunnel')?.getContext('2d');
  setAnalyticsCaption('chartFunnel', totalViews
    ? `Просмотров карточек книг: ${totalViews}. Ниже — пары «читатель — книга».`
    : 'Ниже — пары «читатель — книга».');
  if (ctx3) {
    analyticsCharts.funnel = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: ['Открыли', `Читают (> ${FUNNEL_READING_PAGES} стр.)`, 'Дочитали'],
        datasets: [{
          data: [totalOpens, totalReadings, totalCompletions],
          backgroundColor: [accentRgba(0.8), accentRgba(0.5), 'rgba(34,197,94,0.6)'],
          borderColor: [accentRgba(1), accentRgba(1), '#22c55e'],
          borderWidth: 1,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: INTEGER_TICKS },
          x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } } }
        }
      }
    });
  }

  // Удержание: доля читателей, вернувшихся через N дней после регистрации.
  // Срок, до которого ещё никто не дожил, на графике не показываем.
  const retention = (data.retention || []).filter(point => point.eligible > 0);
  markAnalyticsEmpty('chartRetention', retention.length === 0,
    'Пока рано считать: с регистрации читателей прошло меньше суток.');
  const ctx4 = document.getElementById('chartRetention')?.getContext('2d');
  if (ctx4 && retention.length) {
    analyticsCharts.retention = new Chart(ctx4, {
      type: 'bar',
      data: {
        labels: retention.map(point => `Через ${point.day} ${pluralDays(point.day)}`),
        datasets: [{
          label: 'Вернулись, %',
          data: retention.map(point => Math.round(point.retained / point.eligible * 100)),
          backgroundColor: accentRgba(0.6),
          borderColor: accentRgba(1),
          borderWidth: 1,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: item => {
                const point = retention[item.dataIndex];
                return `${item.raw}% — ${point.retained} из ${point.eligible}`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { ...INTEGER_TICKS, callback: value => `${value}%` },
          },
          x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } } }
        }
      }
    });
  }
}

// Счётчики людей и книг — целые: шкала 0,1 … 0,9 читателя выглядела как ошибка.
const INTEGER_TICKS = { color: '#9ca3af', precision: 0 };
// Тот же порог, что и на сервере (READING_PAGES_THRESHOLD).
const FUNNEL_READING_PAGES = 5;

function pluralDays(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}

// Подпись над графиком (например, число просмотров рядом с воронкой).
function setAnalyticsCaption(canvasId, text) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  let caption = canvas.parentElement.querySelector('.analytics-caption');
  if (!caption) {
    caption = document.createElement('p');
    caption.className = 'analytics-caption';
    canvas.before(caption);
  }
  caption.textContent = text;
}

// ========== АДМИН: ДЕТАЛЬНАЯ АНАЛИТИКА КНИГИ ==========
async function openBookAnalyticsModal(bookId) {
  const modal = document.getElementById('bookAnalyticsModal');
  const content = document.getElementById('bookAnalyticsContent');
  replaceWithStaticText(content, 'Загрузка...', 'a577');
  modal.classList.remove('hidden');
  try {
    const data = await api.library.adminBookAnalytics(bookId);
    renderBookAnalytics(data);
  } catch (err) {
    console.error(err);
    replaceWithStaticText(content, 'Не удалось загрузить аналитику', 'a578');
  }
}

function closeBookAnalyticsModal() {
  document.getElementById('bookAnalyticsModal').classList.add('hidden');
}

function renderBookAnalytics(d) {
  const c = document.getElementById('bookAnalyticsContent');
  const basicHtml = `
    <div data-static-style="a579">
      <div data-static-style="a580">${eh(d.title)}</div>
      <div data-static-style="a192">${eh(d.author)} · ${eh((d.categories || []).join(', '))}</div>
    </div>
    <div data-static-style="a581">
      ${statBox('Просмотры', d.views)}
      ${statBox('Сохранено офлайн', d.downloads)}
      ${statBox('Рейтинг', d.rating ? d.rating.toFixed(1) : '—')}
      ${statBox('Отзывов', d.reviews_count)}
    </div>
  `;
  const mylistHtml = `
    <div data-static-style="a441">
      <h4 data-static-style="a582">В списках пользователей (${d.mylist.total})</h4>
      <div data-static-style="a583">
        ${miniStat('Читают', d.mylist.reading, '#10b981')}
        ${miniStat('В планах', d.mylist.planned, '#3b82f6')}
        ${miniStat('Завершено', d.mylist.completed, '#a78bfa')}
      </div>
    </div>
  `;
  const progressSummaryHtml = `
    <div data-static-style="a204">
      <h4 data-static-style="a582">Прогресс читателей</h4>
      <div data-static-style="a584">
        ${statBox('Начали', d.readers_started)}
        ${statBox('Завершили', d.readers_completed)}
        ${statBox('Средний %', d.avg_progress_pct + '%')}
      </div>
    </div>
  `;
  let readersHtml = '';
  if (d.readers && d.readers.length > 0) {
    const top = d.readers.slice(0, 10);
    const rows = top.map(r => `
      <tr>
        <td data-static-style="a585">@${eh(r.username)}</td>
        <td data-static-style="a586">${r.current_page} / ${r.total_pages}</td>
        <td data-static-style="a587">
          <div data-static-style="a588">
            <div data-dynamic-style="${dynamicStyleToken`height:100%;width:${r.progress_pct}%;background:var(--accent-gradient);`}"></div>
          </div>
          <span data-static-style="a589">${r.progress_pct}%</span>
        </td>
      </tr>
    `).join('');
    readersHtml = `
      <div data-static-style="a441">
        <h4 data-static-style="a582">Кто читает (${d.readers.length}${d.readers.length > 10 ? ', показаны топ-10' : ''})</h4>
        <table data-static-style="a590">
          <thead><tr data-static-style="a591">
            <th data-static-style="a592">Юзер</th>
            <th data-static-style="a593">Страница</th>
            <th data-static-style="a594">Прогресс</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } else {
    readersHtml = `
      <div data-static-style="a595">
        Никто пока не открыл эту книгу
      </div>
    `;
  }
  const quizHtml = d.quiz_attempts > 0 ? `
    <div data-static-style="a441">
      <h4 data-static-style="a582">Активность по тестам</h4>
      <div data-static-style="a584">
        ${statBox('Попыток', d.quiz_attempts)}
        ${statBox('Прошли (≥60%)', d.quiz_passed)}
        ${statBox('Средний балл', d.quiz_avg_percentage + '%')}
      </div>
    </div>
  ` : `
    <div data-static-style="a595">
      Никто пока не проходил тест по этой книге
    </div>
  `;
  replaceWithAppMarkup(c, basicHtml + mylistHtml + progressSummaryHtml + readersHtml + quizHtml);
}

function statBox(label, value) {
  return `<div data-static-style="a458">
    <div data-static-style="a596">${eh(label)}</div>
    <div data-static-style="a597">${eh(String(value))}</div>
  </div>`;
}

function miniStat(label, value, color) {
  return `<div data-static-style="a598">
    <div data-dynamic-style="${dynamicStyleToken`font-size:14px;font-weight:700;color:${color};font-family:'JetBrains Mono',monospace;`}">${value}</div>
    <div data-static-style="a599">${eh(label)}</div>
  </div>`;
}

// Заполнение селектора книг в админ-вкладке «Аналитика»
function populateAnalyticsBookSelector() {
  const sel = document.getElementById('analyticsBookSelector');
  if (!sel) return;
  replaceSelectOptions(sel, [
    { value: '', label: '— выбрать книгу —' },
    ...state.books.map(book => ({ value: book.id, label: book.title })),
  ]);
}

function onAnalyticsBookSelected() {
  const sel = document.getElementById('analyticsBookSelector');
  const bookId = sel.value;
  if (!bookId) return;
  openBookAnalyticsModal(parseInt(bookId));
  sel.value = '';  // сброс, чтобы можно было открыть ту же книгу повторно
}

// ========== АДМИН: ИСПОЛЬЗОВАНИЕ ИНТЕРФЕЙСА ==========
// Обезличенные счётчики: какие экраны открывают, что нажимают, какой цвет и
// тему выбирают. Имена приходят идентификаторами из кода — переводим их.
const USAGE_SCREEN_LABELS = {
  home: 'Главная', mylist: 'Мой список', training: 'Тестирование', reader: 'Читалка',
  profile: 'Профиль', settings: 'Настройки', admin: 'Админка', detail: 'Страница книги',
  assistant: 'AI-ассистент', auth: 'Вход', onboarding: 'Тест уровня',
};
const USAGE_ACTION_LABELS = {
  openBookDetail: 'Открыть книгу', openReader: 'Читать', toggleCatalogPanel: 'Каталог',
  runFullTextSearch: 'Поиск по тексту книг', toggleAIPanel: 'ИИ в читалке',
  sendAIMessage: 'Вопрос ИИ в читалке', sendAssistantMessage: 'Вопрос AI-ассистенту',
  assistantQuick: 'Быстрые запросы ассистента', summarizeCurrentChapter: 'Краткое содержание главы',
  togglePomodoro: 'Pomodoro', openTOC: 'Оглавление', toggleReaderSearch: 'Поиск в книге',
  togglePageBookmark: 'Закладка на странице', openBookmarksList: 'Список закладок',
  exportNotes: 'Экспорт заметок', toggleReaderTheme: 'Тема читалки',
  startQuizFromTraining: 'Тест из списка', retakeQuiz: 'Пройти тест заново',
  submitReview: 'Отзыв', submitComment: 'Комментарий в обсуждении',
  openARSchemeMenu: 'Меню схем атак', openCertificationModal: 'Аттестация',
  openCyberLevelModal: 'Уровень кибербезопасности', openShortcutsModal: 'Горячие клавиши',
  removeBookOffline: 'Удалить офлайн-копию', setHomeBooksTab: 'Вкладки «Популярное / Все книги»',
  resetFilters: 'Сброс фильтров', startNewChat: 'Новый диалог', openChatHistory: 'История диалогов',
  'scheme:killchain': 'Схема: Cyber Kill Chain', 'scheme:owasp': 'Схема: OWASP Top 10',
  'scheme:osi': 'Схема: модель OSI', 'scheme:mitre': 'Схема: MITRE ATT&CK',
  'scheme:nist': 'Схема: NIST CSF', 'scheme:ir': 'Схема: реагирование на инциденты',
  'scheme:did': 'Схема: эшелонированная защита', 'scheme:stride': 'Схема: STRIDE',
};
const USAGE_ACCENTS = {
  orange: ['Оранжевый', '#ff5c1f'], blue: ['Синий', '#2f7bff'],
  green: ['Зелёный', '#22c55e'], violet: ['Фиолетовый', '#8b5cf6'],
};
const USAGE_THEMES = { dark: ['Тёмная', '#3f3f46'], light: ['Светлая', '#e4e4e7'] };
let usageCharts = {};
let usageDays = 30;

function _usageCard(title, canvasId) {
  const card = document.createElement('div');
  card.className = 'analytics-card';
  const heading = document.createElement('h4');
  heading.textContent = title;
  const canvas = document.createElement('canvas');
  canvas.id = canvasId;
  canvas.width = 400;
  canvas.height = 220;
  card.append(heading, canvas);
  return card;
}

function _usageBarChart(canvasId, labels, values, colors, horizontal) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return null;
  return new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? 'y' : 'x',
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', precision: 0 } },
        y: { beginAtZero: true, grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 11 }, precision: 0 } },
      },
    },
  });
}

async function renderUsageStats(days = usageDays) {
  usageDays = days;
  const container = document.getElementById('adUsage');
  if (!container) return;
  Object.values(usageCharts).forEach(chart => { try { chart.destroy(); } catch (e) { /* уже удалён */ } });
  usageCharts = {};

  const toolbar = document.createElement('div');
  toolbar.className = 'usage-toolbar';
  const note = document.createElement('p');
  note.className = 'analytics-scope-note';
  note.textContent = 'Счётчики обезличены: видно, что нажимали, но не кто. Цвет и тема — по читателям без администраторов.';
  const periods = document.createElement('div');
  periods.className = 'usage-periods';
  [[7, '7 дней'], [30, '30 дней'], [90, '90 дней']].forEach(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-tool' + (value === days ? ' admin-tool--primary' : '');
    button.textContent = label;
    button.addEventListener('click', () => renderUsageStats(value));
    periods.appendChild(button);
  });
  toolbar.append(periods, note);

  const grid = document.createElement('div');
  grid.className = 'analytics-charts';
  grid.append(
    _usageCard('Экраны', 'chartUsageScreens'),
    _usageCard('Кнопки и функции', 'chartUsageActions'),
    _usageCard('Цвет оформления', 'chartUsageAccents'),
    _usageCard('Тема', 'chartUsageThemes'),
  );
  container.replaceChildren(toolbar, grid);

  let data;
  try {
    [data] = await Promise.all([api.library.adminUsage(days), ensureChartLoaded()]);
  } catch (err) {
    console.error(err);
    showToast('Не удалось загрузить статистику использования');
    return;
  }

  const accent = accentRgba(0.85);
  const screens = data.screens;
  const actions = data.actions;
  markAnalyticsEmpty('chartUsageScreens', !screens.length, 'Пока нет данных: статистика начнёт копиться после выкладки.');
  markAnalyticsEmpty('chartUsageActions', !actions.length, 'Пока нет данных о нажатиях.');
  markAnalyticsEmpty('chartUsageAccents', !data.accents.length, 'Читатели ещё не заходили после выкладки.');
  markAnalyticsEmpty('chartUsageThemes', !data.themes.length, 'Читатели ещё не заходили после выкладки.');

  if (screens.length) {
    usageCharts.screens = _usageBarChart('chartUsageScreens',
      screens.map(item => USAGE_SCREEN_LABELS[item.name] || item.name),
      screens.map(item => item.count), accent, true);
  }
  if (actions.length) {
    usageCharts.actions = _usageBarChart('chartUsageActions',
      actions.map(item => USAGE_ACTION_LABELS[item.name] || item.name),
      actions.map(item => item.count), accent, true);
  }
  if (data.accents.length) {
    usageCharts.accents = _usageBarChart('chartUsageAccents',
      data.accents.map(item => (USAGE_ACCENTS[item.name] || [item.name])[0]),
      data.accents.map(item => item.count),
      data.accents.map(item => (USAGE_ACCENTS[item.name] || [null, accent])[1]), false);
  }
  if (data.themes.length) {
    usageCharts.themes = _usageBarChart('chartUsageThemes',
      data.themes.map(item => (USAGE_THEMES[item.name] || [item.name])[0]),
      data.themes.map(item => item.count),
      data.themes.map(item => (USAGE_THEMES[item.name] || [null, accent])[1]), false);
  }
}
