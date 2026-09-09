// Аналитика библиотеки и отдельных книг.
let analyticsCharts = {};

// ========== ANALYTICS ==========
function destroyAnalyticsCharts() {
  Object.values(analyticsCharts).forEach(chart => {
    try { chart.destroy(); } catch (e) { /* Chart may already be disposed. */ }
  });
  analyticsCharts = {};
}

function renderAnalytics() {
  destroyAnalyticsCharts();
  populateAnalyticsBookSelector();

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push(d.toISOString().split('T')[0]);
  }
  const activityData = days.map(day => {
    return state.heatmapData?.find(d => d.date === day)?.pages || 0;
  });

  const ctx1 = document.getElementById('chartReadingActivity')?.getContext('2d');
  if (ctx1) {
    analyticsCharts.activity = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: days.map(d => new Date(d).toLocaleDateString('ru', { weekday: 'short' })),
        datasets: [{
          label: 'Страниц прочитано',
          data: activityData,
          borderColor: '#00d4ff',
          backgroundColor: 'rgba(0,212,255,0.1)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#00d4ff',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } },
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } }
        }
      }
    });
  }

  const topBooks = [...state.books].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
  const ctx2 = document.getElementById('chartTopBooks')?.getContext('2d');
  if (ctx2) {
    analyticsCharts.topBooks = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: topBooks.map(b => b.title.substring(0, 20)),
        datasets: [{
          label: 'Просмотры',
          data: topBooks.map(b => b.views || 0),
          backgroundColor: topBooks.map((_, i) => {
            const alphas = [0.8, 0.65, 0.5, 0.35, 0.2];
            return `rgba(0,212,255,${alphas[i] || 0.15})`;
          }),
          borderColor: '#00d4ff',
          borderWidth: 1,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } },
          y: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } } }
        }
      }
    });
  }

  const totalViews = state.books.reduce((s, b) => s + (b.views || 0), 0);
  const totalOpens = Object.values(state.readingProgress).filter(p => p.started).length;
  const totalReadings = Object.values(state.readingProgress).filter(p => p.started && p.currentPage > 5).length;
  const totalCompletions = Object.values(state.mylist).filter(s => s === 'completed').length;

  const ctx3 = document.getElementById('chartFunnel')?.getContext('2d');
  if (ctx3) {
    analyticsCharts.funnel = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: ['Просмотры', 'Открытия', 'Читают', 'Завершили'],
        datasets: [{
          data: [totalViews, totalOpens, totalReadings, totalCompletions],
          backgroundColor: [
            'rgba(0,212,255,0.8)',
            'rgba(0,212,255,0.6)',
            'rgba(0,212,255,0.4)',
            'rgba(34,197,94,0.6)',
          ],
          borderColor: ['#00d4ff', '#00d4ff', '#00d4ff', '#22c55e'],
          borderWidth: 1,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } },
          x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } } }
        }
      }
    });
  }

  const ctx4 = document.getElementById('chartRetention')?.getContext('2d');
  if (ctx4) {
    analyticsCharts.retention = new Chart(ctx4, {
      type: 'line',
      data: {
        labels: ['День 1', 'День 7', 'День 14', 'День 30', 'День 60', 'День 90'],
        datasets: [{
          label: 'Активные пользователи',
          data: [100, 65, 48, 35, 28, 22],
          borderColor: '#7c3aed',
          backgroundColor: 'rgba(124,58,237,0.1)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#7c3aed',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', callback: v => v + '%' } },
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } }
        }
      }
    });
  }
}

// ========== АДМИН: ДЕТАЛЬНАЯ АНАЛИТИКА КНИГИ ==========
async function openBookAnalyticsModal(bookId) {
  const modal = document.getElementById('bookAnalyticsModal');
  const content = document.getElementById('bookAnalyticsContent');
  content.innerHTML = '<div data-static-style="a577">Загрузка...</div>';
  modal.classList.remove('hidden');
  try {
    const data = await api.library.adminBookAnalytics(bookId);
    renderBookAnalytics(data);
  } catch (err) {
    console.error(err);
    content.innerHTML = '<div data-static-style="a578">Не удалось загрузить аналитику</div>';
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
      ${statBox('Скачивания', d.downloads)}
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
        ${miniStat('Брошено', d.mylist.dropped, '#ef4444')}
        ${miniStat('Любимое', d.mylist.liked, '#f59e0b')}
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
  c.innerHTML = basicHtml + mylistHtml + progressSummaryHtml + readersHtml + quizHtml;
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
  sel.innerHTML = '<option value="">— выбрать книгу —</option>' +
    state.books.map(b => `<option value="${b.id}">${eh(b.title)}</option>`).join('');
}

function onAnalyticsBookSelected() {
  const sel = document.getElementById('analyticsBookSelector');
  const bookId = sel.value;
  if (!bookId) return;
  openBookAnalyticsModal(parseInt(bookId));
  sel.value = '';  // сброс, чтобы можно было открыть ту же книгу повторно
}
