// Лидерборд, тепловая карта активности и карта навыков профиля.
// ========== LEADERBOARD ==========
async function loadAndRenderLeaderboard() {
  const container = document.getElementById('adLeaderboard');
  if (!container) return;
  replaceWithStaticText(container, 'Загрузка...', 'a449');
  try {
    const lb = await api.library.leaderboard(50);
    container.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Пользователь</th><th>XP</th><th>Стрик</th></tr></thead>
      <tbody>
        ${lb.map((u, i) => {
          // Скрывшие профиль участвуют анонимно; свою строку подсвечиваем
          const name = u.is_hidden ? 'Участник' : (u.full_name || u.username);
          const style = u.is_self ? ' data-static-style="a450"' : '';
          const muted = u.is_hidden ? ' data-static-style="a243"' : '';
          return `<tr${style}>
          <td>${u.place || i + 1}</td>
          <td${muted}>${eh(name)}${u.is_self ? ' (вы)' : ''}</td>
          <td>${u.xp}</td>
          <td>${u.streak_count}<span data-static-style="a333">${ICONS.fire}</span></td>
        </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
  } catch (err) {
    replaceWithStaticText(container, 'Не удалось загрузить лидерборд', 'a150');
  }
}

// ========== HEATMAP ==========
async function loadHeatmapFromApi() {
  try {
    const data = await api.library.heatmap(90);
    state.heatmapData = data.days || [];
    return true;
  } catch (err) {
    console.error('Не удалось загрузить тепловую карту:', err);
    state.heatmapData = [];
    return false;
  }
}

// ===== Карта знаний по темам (radar chart) =====
// Группируем категории книг в крупные направления кибербезопасности
const SKILL_THEMES = {
  'Network Security': ['сет', 'network', 'сетев', 'firewall', 'protocol', 'traffic', 'трафик'],
  'AppSec / Web': ['web', 'веб', 'приложен', 'app', 'owasp', 'devsecops', 'код', 'программ'],
  'Offensive': ['пентест', 'pentest', 'red team', 'эксплуатац', 'exploit', 'атак', 'attack', 'взлом', 'hacking'],
  'Defense / SOC': ['soc', 'мониторинг', 'incident', 'инцидент', 'защит', 'defense', 'blue team', 'siem', 'форензик', 'forensic'],
  'Crypto / IAM': ['криптограф', 'crypto', 'шифр', 'pki', 'tls', 'iam', 'аутентификац', 'идентификац', 'ключ'],
  'GRC / Risk': ['риск', 'risk', 'governance', 'compliance', 'политик', 'аудит', 'audit', 'nist', 'iso', 'методолог', 'управлени'],
  'Malware / RE': ['malware', 'впо', 'вирус', 'reverse', 'реверс', 'анализ вредонос', 'троян'],
  'AI Security': ['ии', 'ai', 'machine learning', 'ml', 'нейросет', 'adversarial', 'модел'],
};

function computeSkillScores() {
  // Для каждой темы: сила = прочитанные книги (вес 2) + в процессе (вес 1), нормализуем 0-100
  const scores = {};
  for (const theme of Object.keys(SKILL_THEMES)) scores[theme] = 0;

  const books = state.books || [];
  for (const b of books) {
    const status = state.mylist && state.mylist[b.id];
    const prog = state.readingProgress && state.readingProgress[b.id];
    let weight = 0;
    if (status === 'completed') weight = 2;
    else if (status === 'reading' || (prog && prog.started)) weight = 1;
    else if (status === 'liked' || status === 'planned') weight = 0.3;
    if (weight === 0) continue;

    const hay = ((b.categories || []).join(' ') + ' ' + (b.title || '')).toLowerCase();
    for (const [theme, keywords] of Object.entries(SKILL_THEMES)) {
      if (keywords.some(k => hay.includes(k))) {
        scores[theme] += weight;
      }
    }
  }
  // Нормализация: максимум приводим к 100, чтобы график читался
  const max = Math.max(1, ...Object.values(scores));
  const normalized = {};
  for (const [theme, val] of Object.entries(scores)) {
    normalized[theme] = Math.round((val / max) * 100);
  }
  return { raw: scores, normalized };
}

let _skillsRadarChart = null;
async function renderSkillsRadar() {
  const canvas = document.getElementById('skillsRadarCanvas');
  const empty = document.getElementById('skillsRadarEmpty');
  if (!canvas) return;

  // Лениво подгружаем chart.js при первом построении графика
  if (typeof Chart === 'undefined') {
    try { await ensureChartLoaded(); } catch (e) { return; }
  }
  if (typeof Chart === 'undefined') return;

  const { raw, normalized } = computeSkillScores();
  const total = Object.values(raw).reduce((a, b) => a + b, 0);

  // Если совсем нет данных — показываем заглушку
  if (total < 0.5) {
    canvas.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }
  canvas.style.display = 'block';
  if (empty) empty.style.display = 'none';

  const labels = Object.keys(SKILL_THEMES);
  const data = labels.map(l => normalized[l]);

  if (_skillsRadarChart) { _skillsRadarChart.destroy(); _skillsRadarChart = null; }

  const styles = getComputedStyle(document.documentElement);
  const accent = (styles.getPropertyValue('--accent') || '#00d4ff').trim();
  const textMuted = (styles.getPropertyValue('--text-muted') || '#8a93a6').trim();
  const border = (styles.getPropertyValue('--border') || 'rgba(255,255,255,0.1)').trim();

  _skillsRadarChart = new Chart(canvas, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: 'Уровень знаний',
        data,
        fill: true,
        backgroundColor: 'rgba(0,212,255,0.18)',
        borderColor: accent,
        borderWidth: 2,
        pointBackgroundColor: accent,
        pointRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: { display: false, stepSize: 25 },
          grid: { color: border },
          angleLines: { color: border },
          pointLabels: { color: textMuted, font: { size: 10 } },
        },
      },
    },
  });
}

async function renderHeatmap() {
  const c = document.getElementById('heatmapContainer');
  if (!c) return;
  if (!state.currentUser) { c.replaceChildren(); return; }

  await loadHeatmapFromApi();
  const days = state.heatmapData || [];

  const fragment = document.createDocumentFragment();
  days.forEach(day => {
    const p = Number(day.pages) || 0;
    let level = 0;
    if (p > 0) level = 1;
    if (p >= 10) level = 2;
    if (p >= 30) level = 3;
    if (p >= 50) level = 4;
    const cell = document.createElement('div');
    cell.className = `heatmap-cell level-${level}`;
    cell.dataset.date = String(day.date ?? '');
    cell.dataset.pages = String(p);
    cell.title = `${cell.dataset.date}: ${p} стр.`;
    cell.addEventListener('click', () => showHeatmapDayDetails(cell.dataset.date));
    fragment.appendChild(cell);
  });
  c.replaceChildren(fragment);
}

async function showHeatmapDayDetails(date) {
  // Открываем модалку с показом «Загрузка»
  const ex = document.getElementById('heatmapDayModal');
  if (ex) ex.remove();

  const modal = document.createElement('div');
  modal.id = 'heatmapDayModal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = `
    <div data-static-style="a451">
      <div data-static-style="a126">
        <h3 data-static-style="a127">${formatHeatmapDate(date)}</h3>
        <button id="heatmapDayCloseBtn" data-static-style="a452">✕</button>
      </div>
      <div id="heatmapDayContent" data-static-style="a453">Загрузка...</div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('heatmapDayCloseBtn').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  try {
    const data = await api.library.dayStats(date);
    document.getElementById('heatmapDayContent').innerHTML = renderHeatmapDayContent(data);
  } catch (e) {
    document.getElementById('heatmapDayContent').innerHTML = `<div data-static-style="a454">Не удалось загрузить статистику</div>`;
  }
}

function formatHeatmapDate(iso) {
  try {
    const d = new Date(iso + 'T00:00:00');
    const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
    const weekdays = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
    return `${weekdays[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch (_) { return iso; }
}

function renderHeatmapDayContent(data) {
  const hasActivity = data.pages_read > 0 || data.quiz_attempts > 0 || data.annotations_count > 0;

  if (!hasActivity) {
    return `
      <div data-static-style="a455">
        <div data-static-style="a456">💤</div>
        <div data-static-style="a457">В этот день активности не было</div>
      </div>
    `;
  }

  const statBox = (label, value, color = 'var(--accent)') => `
    <div data-static-style="a458">
      <div data-dynamic-style="${dynamicStyleToken`font-size:18px;font-weight:700;color:${color};font-family:'JetBrains Mono',monospace;`}">${value}</div>
      <div data-static-style="a344">${label}</div>
    </div>
  `;

  return `
    <div data-static-style="a459">
      ${statBox('Страниц', data.pages_read)}
      ${statBox('Тестов', data.quiz_attempts, '#a855f7')}
      ${statBox('Маркеров', data.highlights_count, '#fbbf24')}
      ${statBox('Заметок', data.notes_count, '#22c55e')}
    </div>

    ${data.books.length > 0 ? `
      <div data-static-style="a460">
        <div data-static-style="a461">КНИГИ В РАБОТЕ</div>
        <div data-static-style="a462">
          ${data.books.map(b => `
            <div data-static-style="a463">
              <div data-static-style="a464">${eh(b.title)}</div>
              <div data-static-style="a465">стр.${b.pages_at_end}</div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    ${data.quizzes.length > 0 ? `
      <div data-static-style="a466">
        <div data-static-style="a461">ТЕСТЫ</div>
        <div data-static-style="a462">
          ${data.quizzes.map(q => `
            <div data-static-style="a463">
              <div data-static-style="a464">${eh(q.book_title)}</div>
              <div data-dynamic-style="${dynamicStyleToken`color:${q.passed ? '#22c55e' : '#ef4444'};font-weight:700;font-size:11px;flex-shrink:0;`}">${q.percentage}%</div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
}
