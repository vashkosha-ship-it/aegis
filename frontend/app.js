// ========== EPUB RENDITION ==========
let epubRendition = null;
let epubBook = null;
let isEpubMode = false;

// ========== STATE ==========
const state = {
  currentUser: null, currentTab: 'login', currentScreen: 'auth', detailTab: 'info', aiOpen: false, catalogOpen: false,
  mylistTab: 'reading', mylistSort: 'date-desc', trainingTab: 'all',
  filters: { categories: [], sort: 'default', status: 'all' },
  books: [],
  readingProgress: {}, mylist: {}, reviews: {}, completedQuizzes: {},
  pendingAiAction: null,
  analyticsCache: null,
  heatmapData: null,
};
let pdfDoc = null, pdfCurrentPage = 1, pdfTotalPages = 0, currentBookId = null, lastSelection = null;
// Контроль параллельного рендера PDF: отменяем предыдущий рендер при быстром
// листании, иначе два page.render() в один canvas накладываются и страница
// получается перевёрнутой/искажённой (race condition).
let _pdfRenderTask = null;     // текущая задача pdf.js render()
let _pdfRenderToken = 0;       // токен последнего запроса рендера
let readerCurrentPageText = '';  // текст текущей страницы для AI-ассистента
let epubCurrentPage = 1, epubTotalPages = 0;
let currentQuiz = { bookId: null, questions: [], currentIndex: 0, score: 0, answers: [] };

function saveState() {
  // Раньше сохраняли state.userProfiles в localStorage.
  // После миграции профилей на бэк здесь больше ничего не делаем.
  // Функция оставлена как no-op, чтобы не править все места вызова.
}

state.gamification = {
  xp: 0,
  streakCount: 0,
  achievementsOwned: [],
  achievementsCatalog: [],
};

function getXpForLevel(level) { return level * 100; }
function calculateLevel(totalXp) {
  let level = 1, remaining = totalXp;
  while (remaining >= getXpForLevel(level)) {
    remaining -= getXpForLevel(level);
    level++;
  }
  return { level, currentLevelXp: remaining, nextLevelXp: getXpForLevel(level) };
}

async function loadGamificationFromApi() {
  if (!state.currentUser) return false;
  try {
    const me = await api.me();
    state.gamification.xp = me.xp || 0;
    state.gamification.streakCount = me.streak_count || 0;
    const [owned, catalog] = await Promise.all([
      api.library.myAchievements(),
      api.library.allAchievements(),
    ]);
    state.gamification.achievementsOwned = owned;
    state.gamification.achievementsCatalog = catalog;
    return true;
  } catch (err) {
    console.error('Не удалось загрузить геймификацию:', err);
    return false;
  }
}

async function refreshGamificationFromApi() {
  const before = state.gamification.achievementsOwned.map(a => a.code);
  await loadGamificationFromApi();
  const after = state.gamification.achievementsOwned;
  after.forEach(a => {
    if (!before.includes(a.code)) {
      showToast(`Достижение получено: ${a.name}!`);
    }
  });
  if (state.currentScreen === 'profile') {
    updateProfileXpDisplay();
    renderAchievementsInProfile();
  }
}

function updateProfileXpDisplay() {
  if (!state.currentUser) return;
  const xp = state.gamification.xp;
  const { level, currentLevelXp, nextLevelXp } = calculateLevel(xp);
  const el = id => document.getElementById(id);
  if (el('profileLevel')) el('profileLevel').textContent = level;
  if (el('profileXp')) el('profileXp').textContent = currentLevelXp;
  if (el('profileXpNext')) el('profileXpNext').textContent = nextLevelXp;
  if (el('xpBarFill')) el('xpBarFill').style.width = (currentLevelXp / nextLevelXp * 100) + '%';
}

function getStreak() {
  return state.gamification.streakCount || 0;
}

// Маппинг кодов достижений в SVG-иконки
function getAchievementIcon(code) {
  const map = {
    'ach_reading_1': ICONS.achReading,
    'ach_quiz_1':    ICONS.achQuiz,
    'xp_1000':       ICONS.achXp,
    'review_1':      ICONS.achReview,
    // новые
    'ach_finish_1':  ICONS.check,
    'books_5':       ICONS.book,
    'books_10':      ICONS.book,
    'finish_5':      ICONS.check,
    'ach_note_1':    ICONS.achReview,
    'quiz_5':        ICONS.achQuiz,
    'quiz_10':       ICONS.achQuiz,
    'quiz_perfect':  ICONS.star,
    'review_5':      ICONS.achReview,
    'xp_500':        ICONS.achXp,
    'xp_5000':       ICONS.achXp,
    'streak_3':      ICONS.fire,
    'streak_7':      ICONS.fire,
    'streak_30':     ICONS.fire,
    'ach_level_test': ICONS.target,
    // дополнительный набор
    'books_25':       ICONS.book,
    'finish_10':      ICONS.check,
    'finish_25':      ICONS.check,
    'quiz_25':        ICONS.achQuiz,
    'quiz_perfect_5': ICONS.star,
    'review_10':      ICONS.achReview,
    'streak_14':      ICONS.fire,
    'streak_100':     ICONS.fire,
    'xp_2500':        ICONS.achXp,
    'xp_10000':       ICONS.achXp,
  };
  return map[code] || ICONS.target;  // fallback на мишень, если код не знаем
}

function renderAchievementsInProfile() {
  const l = document.getElementById('achievementsList');
  if (!l) return;
  const owned = state.gamification.achievementsOwned || [];
  const catalog = state.gamification.achievementsCatalog || [];
  const ownedCodes = new Set(owned.map(a => a.code));

  if (!owned.length && !catalog.length) {
    l.innerHTML = '<span data-static-style="a099">Нет достижений</span>';
    return;
  }

  // Сначала полученные (ярко), затем остальные из каталога (приглушённо — как цели).
  const lockedList = catalog.filter(a => !ownedCodes.has(a.code));
  const ownedHtml = owned.map(a =>
    `<span class="achievement-badge ${a.tier}" title="${eh(a.description)}"><span data-static-style="a100">${getAchievementIcon(a.code)}</span>${eh(a.name)}</span>`
  ).join('');
  const lockedHtml = lockedList.map(a =>
    `<span class="achievement-badge ${a.tier} locked" title="${eh(a.description)}"><span data-static-style="a100">${getAchievementIcon(a.code)}</span>${eh(a.name)}</span>`
  ).join('');

  l.innerHTML = ownedHtml + lockedHtml;
}

// ===== Полнотекстовый поиск по содержимому книг (H) =====
async function runFullTextSearch() {
  const input = document.getElementById('searchInput');
  const q = (input?.value || '').trim();
  if (q.length < 2) { showToast('Введите минимум 2 символа'); return; }

  const container = document.getElementById('booksContainer') || document.getElementById('homeBooksGrid');
  // показываем оверлей результатов
  let panel = document.getElementById('fullTextResults');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'fullTextResults';
    panel.style.cssText = 'margin-top:14px;';
    const anchor = document.getElementById('sectionResume') || container;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor);
    else if (container) container.parentNode.insertBefore(panel, container);
  }
  panel.innerHTML = `<div data-static-style="a111">Ищу «${eh(q)}»…</div>`;

  try {
    const res = await api.library.searchBooks(q, 20);
    renderFullTextResults(res);
  } catch (e) {
    panel.innerHTML = `<div data-static-style="a112">Ошибка поиска. ${eh(e?.detail || '')}</div>`;
  }
}

function renderFullTextResults(res) {
  const panel = document.getElementById('fullTextResults');
  if (!panel) return;
  if (!res.hits || !res.hits.length) {
    panel.innerHTML = `
      <div data-static-style="a113">
        <div class="section-title">Поиск: «${eh(res.query)}»</div>
        <button data-onclick="clearFullTextSearch()" data-static-style="a114">Очистить</button>
      </div>
      <div data-static-style="a111">Ничего не найдено. Возможно, книги ещё не проиндексированы (админ → «Переиндексировать»).</div>`;
    return;
  }
  const matchLabel = { meta: 'в описании', content: 'в тексте', both: 'в описании и тексте' };
  panel.innerHTML = `
    <div data-static-style="a113">
      <div class="section-title">Найдено: ${res.total} по «${eh(res.query)}»</div>
      <button data-onclick="clearFullTextSearch()" data-static-style="a114">Очистить</button>
    </div>
    <div data-static-style="a115">
      ${res.hits.map(h => `
        <div data-onclick="openBookDetail(${h.book_id})" data-static-style="a116">
          <div data-static-style="a117">
            ${h.has_cover ? `<img src="${api.books.coverUrl(h.book_id)}" alt="" data-static-style="a118">` : `<div data-static-style="a119">📕</div>`}
          </div>
          <div data-static-style="a015">
            <div data-static-style="a120">${eh(h.title)}</div>
            <div data-static-style="a121">${eh(h.author)} · совпадение ${matchLabel[h.matched_in] || ''}</div>
            ${h.pages && h.pages.length ? h.pages.map(p => `
              <div data-static-style="a122">
                <span data-static-style="a123">с. ${p.page}:</span> …${p.snippet}…
                <button data-onclick="askAiAboutSnippet(${h.book_id}, ${p.page}, '${_encodeSnippet(p.snippet)}', '${_encodeSnippet(h.title)}')" data-stop="1" data-static-style="a124">✨ Спросить AI про этот фрагмент</button>
              </div>`).join('') : ''}
          </div>
        </div>`).join('')}
    </div>`;
}

// убирает <b>-теги и кодирует для безопасной передачи в onclick
function _encodeSnippet(s) {
  const clean = String(s || '').replace(/<\/?b>/g, '');
  return encodeURIComponent(clean).replace(/'/g, '%27');
}

function askAiAboutSnippet(bookId, page, encSnippet, encTitle) {
  const snippet = decodeURIComponent(encSnippet);
  const title = decodeURIComponent(encTitle);
  // переходим к ассистенту и задаём вопрос с контекстом фрагмента
  navigateTo('assistant');
  setTimeout(() => {
    const surface = assistantSurface('full');
    const prompt = `Объясни простыми словами этот фрагмент из книги «${title}» (стр. ${page}):\n\n«${snippet}»\n\nЧто это означает и почему это важно?`;
    assistantSend(surface, prompt);
  }, 150);
}

function clearFullTextSearch() {
  const panel = document.getElementById('fullTextResults');
  if (panel) panel.remove();
  const input = document.getElementById('searchInput');
  if (input) { input.value = ''; renderHome(); }
}


let _certExam = null; // {token, category, questions, answers, index}

async function renderMyCertificates() {
  const el = document.getElementById('certMineList');
  if (!el) return;
  try {
    const certs = await api.library.certMine();
    if (!certs.length) { el.innerHTML = ''; return; }
    el.innerHTML = certs.map(c => `
      <div data-static-style="a138">
        <div><span data-static-style="a139">${eh(c.category)}</span> <span data-static-style="a140">· ${c.score}%</span></div>
        <button data-onclick="downloadCertificate('${encodeURIComponent(c.category).replace(/'/g, '')}')" data-static-style="a141">Скачать PDF</button>
      </div>`).join('');
  } catch (_) { el.innerHTML = ''; }
}

async function downloadCertificate(categoryEnc) {
  const category = decodeURIComponent(categoryEnc);
  try {
    const blob = await api.library.certPdfBlob(category);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'sertifikat_' + category + '.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (e) { showToast('Не удалось скачать сертификат'); }
}

function certModalShell(inner) {
  let modal = document.getElementById('certModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'certModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:2500;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `<div data-static-style="a142">${inner}</div>`;
  return modal;
}

function closeCertModal() {
  const m = document.getElementById('certModal');
  if (m) m.remove();
  _certExam = null;
}

async function openCertificationModal() {
  certModalShell('<div data-static-style="a143">Загрузка тем…</div>');
  try {
    const cats = await api.library.certCategories();
    const options = cats.map(c => `<option value="${eh(c)}">${eh(c)}</option>`).join('');
    certModalShell(`
      <div data-static-style="a144">
        <h3 data-static-style="a145">Аттестация</h3>
        <button data-onclick="closeCertModal()" data-static-style="a146">✕</button>
      </div>
      <p data-static-style="a147">Выберите тему. Будет сгенерирован тест из 50 вопросов (это может занять до минуты). Для прохождения нужно 85% правильных.</p>
      <select id="certCategorySelect" data-static-style="a148">${options}</select>
      <button id="certStartBtn" data-static-style="a149">Начать тест</button>
    `);
    document.getElementById('certStartBtn').onclick = startCertExam;
  } catch (e) {
    certModalShell('<div data-static-style="a150">Не удалось загрузить темы<br><button data-onclick="closeCertModal()" data-static-style="a151">Закрыть</button></div>');
  }
}

async function startCertExam() {
  const category = document.getElementById('certCategorySelect').value;
  certModalShell(`<div data-static-style="a152">${loadingSpinnerHTML('')}<div data-static-style="a153">Генерируем тест по теме<br><b data-static-style="a154">${eh(category)}</b><br><span data-static-style="a155">Это может занять до минуты…</span></div></div>`);
  try {
    const data = await api.library.certStartExam(category);
    _certExam = { token: data.exam_token, category: data.category, questions: data.questions, answers: new Array(data.questions.length).fill(-1), index: 0 };
    renderCertQuestion();
  } catch (e) {
    const msg = (e && e.detail) || 'Не удалось сгенерировать тест';
    certModalShell(`<div data-static-style="a150">${eh(msg)}<br><button data-onclick="closeCertModal()" data-static-style="a151">Закрыть</button></div>`);
  }
}

function renderCertQuestion() {
  const ex = _certExam;
  if (!ex) return;
  const q = ex.questions[ex.index];
  const total = ex.questions.length;
  const opts = q.options.map((o, i) => `
    <button data-onclick="answerCertQuestion(${i})" style="display:block;width:100%;text-align:left;margin-bottom:8px;padding:11px 14px;border-radius:8px;border:1px solid ${ex.answers[ex.index] === i ? 'var(--accent)' : 'var(--border)'};background:${ex.answers[ex.index] === i ? 'rgba(0,212,255,0.12)' : 'var(--bg-card)'};color:var(--text-primary);cursor:pointer;font-family:inherit;font-size:13px;">${eh(o)}</button>`).join('');
  const answered = ex.answers.filter(a => a >= 0).length;
  certModalShell(`
    <div data-static-style="a156">
      <span data-static-style="a155">Вопрос ${ex.index + 1} из ${total}</span>
      <button data-onclick="closeCertModal()" data-static-style="a157">✕</button>
    </div>
    <div data-static-style="a158"><div style="height:100%;width:${(answered / total * 100)}%;background:var(--accent);"></div></div>
    <div data-static-style="a159">${eh(q.question)}</div>
    ${opts}
    <div data-static-style="a160">
      <button data-onclick="certNav(-1)" ${ex.index === 0 ? 'disabled' : ''} style="flex:1;background:var(--bg-card);border:1px solid var(--border);color:var(--text-primary);padding:10px;border-radius:8px;cursor:pointer;font-family:inherit;opacity:${ex.index === 0 ? '0.4' : '1'};">← Назад</button>
      ${ex.index < total - 1
        ? `<button data-onclick="certNav(1)" data-static-style="a161">Далее →</button>`
        : `<button data-onclick="submitCertExam()" data-static-style="a162">Завершить</button>`}
    </div>
  `);
}

function answerCertQuestion(i) {
  if (!_certExam) return;
  _certExam.answers[_certExam.index] = i;
  renderCertQuestion();
}

function certNav(d) {
  if (!_certExam) return;
  _certExam.index = Math.max(0, Math.min(_certExam.questions.length - 1, _certExam.index + d));
  renderCertQuestion();
}

async function submitCertExam() {
  const ex = _certExam;
  if (!ex) return;
  const unanswered = ex.answers.filter(a => a < 0).length;
  if (unanswered > 0 && !confirm(`Без ответа: ${unanswered}. Они будут засчитаны как неверные. Завершить?`)) return;
  certModalShell('<div data-static-style="a152">Проверяем ответы…</div>');
  try {
    const res = await api.library.certSubmitExam(ex.token, ex.answers);
    if (res.needs_full_name) {
      certModalShell(`
        <h3 data-static-style="a163">Заполните ФИО</h3>
        <p data-static-style="a147">Вы прошли тест (${res.score}%)! Для сертификата укажите ФИО — оно появится в документе.</p>
        <input type="text" id="certFullName" placeholder="Фамилия Имя Отчество" data-static-style="a164">
        <button id="certSaveNameBtn" data-static-style="a165">Сохранить и получить сертификат</button>
      `);
      document.getElementById('certSaveNameBtn').onclick = async () => {
        const fio = document.getElementById('certFullName').value.trim();
        if (fio.length < 3) return showToast('Введите ФИО');
        try {
          await api.updateMe({ full_name: fio });
          if (state.currentUser) state.currentUser.full_name = fio;
          // повторно отправляем экзамен — теперь ФИО есть
          const res2 = await api.library.certSubmitExam(ex.token, ex.answers);
          if (res2.passed && !res2.needs_full_name) {
            showCertResult(res2.score, ex.category);
          } else {
            showToast('Экзамен истёк, пройдите заново');
            closeCertModal();
          }
        } catch (e) { showToast('Не удалось сохранить'); }
      };
    } else if (res.passed) {
      showCertResult(res.score, ex.category);
    } else {
      certModalShell(`
        <div data-static-style="a166">
          <div data-static-style="a167">😔</div>
          <h3 data-static-style="a168">Не пройдено</h3>
          <p data-static-style="a169">Результат: ${res.score}% (${res.correct_count} из ${res.total})</p>
          <p data-static-style="a170">Для сертификата нужно 85%. Попробуйте ещё раз после изучения материалов.</p>
          <button data-onclick="closeCertModal()" data-static-style="a171">Закрыть</button>
        </div>`);
    }
  } catch (e) {
    showToast('Ошибка проверки');
    closeCertModal();
  }
}

function showCertResult(score, category) {
  certModalShell(`
    <div data-static-style="a166">
      <div data-static-style="a172">🎉</div>
      <h3 data-static-style="a173">Поздравляем!</h3>
      <p data-static-style="a169">Вы прошли аттестацию по теме<br><b data-static-style="a154">${eh(category)}</b></p>
      <p data-static-style="a174">${score}%</p>
      <button data-onclick="downloadCertificate('${encodeURIComponent(category).replace(/'/g, '')}');closeCertModal();renderMyCertificates()" data-static-style="a175">Скачать сертификат</button>
      <br><button data-onclick="closeCertModal();renderMyCertificates()" data-static-style="a176">Закрыть</button>
    </div>`);
}


// ========== ANNOTATIONS ==========
function _downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function _csvEscape(v) {
  const s = String(v == null ? '' : v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function exportAllUserData() {
  showToast('Собираю данные…');
  const u = state.currentUser || {};
  const out = {
    exported_at: new Date().toISOString(),
    format: 'aegis-user-data-v1',
    profile: {
      username: u.name, full_name: u.full_name || null, email: u.email || null,
      department: u.department || null, role: u.role || null,
      cyber_level: u.cyber_level || null, xp: state.gamification?.xp || 0,
      streak: state.gamification?.streakCount || 0,
    },
    mylist: [], reading_progress: [], achievements: [], quiz_attempts: [], annotations: [],
    settings: {
      theme: localStorage.getItem('aegis_app_theme') || 'dark',
      reading_goal: localStorage.getItem('aegis_reading_goal') || null,
      reader_font: localStorage.getItem('aegis_reader_font') || null,
      favorite_categories: getFavCategories(),
    },
  };

  // mylist + прогресс из state
  Object.entries(state.mylist || {}).forEach(([bid, status]) => {
    const b = (state.books || []).find(x => String(x.id) === String(bid));
    out.mylist.push({ book_id: Number(bid), title: b?.title || null, status });
  });
  Object.entries(state.readingProgress || {}).forEach(([bid, p]) => {
    out.reading_progress.push({ book_id: Number(bid), current_page: p.currentPage, total_pages: p.totalPages, started: p.started });
  });

  // ачивки
  (state.gamification?.achievementsOwned || []).forEach(a => out.achievements.push({ code: a.code, name: a.name || null }));

  // дозапрос с сервера: попытки тестов + аннотации по всем книгам из mylist
  try { out.quiz_attempts = (await api.library.myQuizAttempts()) || []; } catch (_) {}
  const bookIds = Object.keys(state.mylist || {});
  for (const bid of bookIds) {
    try {
      const ann = await api.library.annotations(Number(bid));
      (ann || []).forEach(a => out.annotations.push({
        book_id: Number(bid), page: a.page, type: a.type,
        text: a.selected_text, note: a.note_text || null,
      }));
    } catch (_) {}
  }

  _downloadBlob(JSON.stringify(out, null, 2), `aegis_my_data_${u.name || 'user'}.json`, 'application/json');
  if (navigator.vibrate) navigator.vibrate(15);
  showToast('Данные выгружены');
}

async function exportNotes() {
  if (!currentBookId) { showToast('Откройте книгу для экспорта заметок'); return; }
  const ann = await getAnnotations(currentBookId);
  if (!ann.length) { showToast('Нет заметок для экспорта'); return; }
  const ex = document.getElementById('exportFmtModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'exportFmtModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  const btn = (fmt, label, desc) => `<button data-onclick="doExportNotes('${fmt}')" data-static-style="a231">
    <span data-static-style="a232">${fmt.toUpperCase()}</span>
    <span><span data-static-style="a233">${label}</span><span data-static-style="a192">${desc}</span></span>
  </button>`;
  m.innerHTML = `<div data-static-style="a234">
    <div data-static-style="a126">
      <h3 data-static-style="a127">Экспорт заметок</h3>
      <button data-onclick="closeModal('exportFmtModal')" data-static-style="a128">&times;</button>
    </div>
    ${btn('pdf', 'PDF документ', 'Для печати и чтения')}
    ${btn('md', 'Markdown', 'Текст с разметкой')}
    ${btn('json', 'JSON', 'Для импорта в другие приложения')}
    ${btn('csv', 'CSV', 'Таблица для Excel')}
  </div>`;
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  document.body.appendChild(m);
}

async function doExportNotes(fmt) {
  const modal = document.getElementById('exportFmtModal');
  if (modal) modal.remove();
  const ann = await getAnnotations(currentBookId);
  const b = state.books.find(x => x.id === currentBookId);
  const title = b ? b.title : 'Книга';
  const safe = (title.replace(/[^a-z0-9а-яё]/gi, '_') || 'book');
  const sorted = [...ann].sort((a, b) => a.page - b.page);

  if (fmt === 'json') {
    const data = {
      book: title, author: b?.author || null,
      exported_at: new Date().toISOString(),
      annotations: sorted.map(a => ({ page: a.page, type: a.type, text: a.text, note: a.note || null })),
    };
    _downloadBlob(JSON.stringify(data, null, 2), `notes_${safe}.json`, 'application/json');
  } else if (fmt === 'csv') {
    let csv = 'Страница;Тип;Текст;Заметка\n';
    sorted.forEach(a => {
      csv += [a.page, a.type === 'note' ? 'Заметка' : 'Выделение', _csvEscape(a.text), _csvEscape(a.note || '')].join(';') + '\n';
    });
    _downloadBlob('\uFEFF' + csv, `notes_${safe}.csv`, 'text/csv;charset=utf-8');
  } else if (fmt === 'md') {
    let md = `# Заметки: ${title}\n\n`;
    sorted.forEach(a => {
      md += `## Стр. ${a.page}\n> ${a.text}\n\n`;
      if (a.type === 'note' && a.note) md += `Заметка: ${a.note}\n\n`;
      md += `---\n\n`;
    });
    _downloadBlob(md, `notes_${safe}.md`, 'text/markdown');
  } else if (fmt === 'pdf') {
    exportNotesPdf(title, b?.author, sorted);
  }
  if (navigator.vibrate) navigator.vibrate(12);
  if (fmt !== 'pdf') showToast('Заметки экспортированы!');
}

function exportNotesPdf(title, author, sorted) {
  const rows = sorted.map(a => `
    <div data-static-style="a235">
      <div data-static-style="a236">Страница ${a.page} &middot; ${a.type === 'note' ? 'Заметка' : 'Выделение'}</div>
      <div data-static-style="a237">${eh(a.text)}</div>
      ${a.type === 'note' && a.note ? `<div data-static-style="a238"><b>Заметка:</b> ${eh(a.note)}</div>` : ''}
    </div>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Заметки: ${eh(title)}</title>
    <style>body{font-family:Arial,sans-serif;color:#111;max-width:720px;margin:24px auto;padding:0 16px;}
    h1{font-size:22px;} .meta{color:#888;font-size:12px;margin-bottom:20px;}</style></head>
    <body><h1>Заметки: ${eh(title)}</h1>
    <div class="meta">${author ? eh(author) + ' &middot; ' : ''}Экспорт: ${new Date().toLocaleDateString('ru-RU')}</div>
    ${rows}
    <script>window.onload=()=>{window.print();}<\/script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { showToast('Разрешите всплывающие окна для PDF'); return; }
  w.document.write(html); w.document.close();
}

async function renderDetailNotes() {
  if (!currentBookId) return;
  const c = document.getElementById('detailTabNotes');
  showListSkeleton('detailTabNotes', 3);

  const ann = await getAnnotations(currentBookId);
  if (!ann.length) {
    c.innerHTML = `<div class="mylist-empty"><div class="icon" data-static-style="a239">${ICONS.bookmark}</div><p>Нет заметок</p></div>`;
    return;
  }

  // Разделяем по типу для статистики
  const highlights = ann.filter(a => a.type === 'highlight');
  const notes = ann.filter(a => a.type === 'note');

  const statsHtml = `
    <div data-static-style="a240">
      <div data-static-style="a241">
        <div data-static-style="a242">${highlights.length}</div>
        <div data-static-style="a243">Маркеров</div>
      </div>
      <div data-static-style="a244">
        <div data-static-style="a245">${notes.length}</div>
        <div data-static-style="a243">Заметок</div>
      </div>
    </div>
  `;

  const itemsHtml = ann.sort((a, b) => new Date(b.date) - new Date(a.date)).map(a => {
    const isNote = a.type === 'note';
    const stripColor = isNote ? 'var(--accent)' : '#fbbf24';
    const bgTint = isNote ? 'rgba(0,212,255,0.04)' : 'rgba(251,191,36,0.04)';
    const cfi = a.position && a.position.cfi;
    // Если есть CFI и сейчас не открыта книга — можно прыгнуть
    const goAction = cfi
      ? `onclick="goToEpubAnnotation(${currentBookId}, '${(cfi || '').replace(/'/g, '&#39;')}')"`
      : '';
    const cursor = cfi ? 'cursor:pointer;' : '';

    return `
      <div style="background:${bgTint};border:1px solid var(--border);border-left:3px solid ${stripColor};border-radius:8px;padding:12px;margin-bottom:8px;${cursor}" ${goAction}>
        <div data-static-style="a246">
          <div style="font-size:10px;color:${stripColor};font-weight:600;">
            ${isNote ? 'ЗАМЕТКА' : 'МАРКЕР'} · Стр.${a.page}
          </div>
          <button class="btn-sm danger" data-static-style="a247" data-onclick="deleteAnnotation(${currentBookId},${a.id})" data-nonce="${sensitiveNonce()}" data-stop="1">${ICONS.trash}</button>
        </div>
        <div data-static-style="a248">«${eh(a.text.substring(0, 200))}${a.text.length > 200 ? '…' : ''}»</div>
        ${a.note ? `
          <div data-static-style="a249">
            ${eh(a.note)}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  c.innerHTML = statsHtml + itemsHtml;
    const tabEl = document.querySelector('.detail-tab[data-dtab="notes"]');
  if (tabEl) {
    tabEl.textContent = `Заметки${ann.length ? ` (${ann.length})` : ''}`;
  }
}

// ========== AUTH ==========
document.querySelectorAll('.auth-tab').forEach(t => t.addEventListener('click', function () {
  document.querySelectorAll('.auth-tab').forEach(x => x.classList.remove('active'));
  this.classList.add('active');
  state.currentTab = this.dataset.tab;
  const isRegister = state.currentTab === 'register';
  document.getElementById('registerEmailField').classList.toggle('hidden', !isRegister);
  document.getElementById('registerDepartmentField').classList.toggle('hidden', !isRegister);
  document.getElementById('registerFirstNameField').classList.toggle('hidden', !isRegister);
  document.getElementById('registerLastNameField').classList.toggle('hidden', !isRegister);
  document.getElementById('authPass').required = !isRegister;
  // Обновляем текст кнопки и заголовка формы
  const submitText = document.getElementById('authSubmitText');
  if (submitText) submitText.textContent = isRegister ? 'Зарегистрироваться' : 'Войти';
  else if (document.querySelector('#authForm .btn')) document.querySelector('#authForm .btn').textContent = isRegister ? 'Зарегистрироваться' : 'Войти';
  const title = document.getElementById('authFormTitle');
  const subtitle = document.getElementById('authFormSubtitle');
  const forgotHint = document.getElementById('forgotPasswordHint');
  if (title) title.textContent = isRegister ? 'Создать аккаунт' : 'С возвращением';
  if (subtitle) subtitle.textContent = isRegister ? 'Заполните данные для регистрации' : 'Войдите в свой аккаунт';
  if (forgotHint) forgotHint.style.display = isRegister ? 'none' : '';
}));

function openForgotPassword() {
  let m = document.getElementById('forgotPasswordModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'forgotPasswordModal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:5000;display:flex;align-items:center;justify-content:center;padding:18px;';
    document.body.appendChild(m);
  }
  m.innerHTML = `
    <div data-static-style="a272">
      <div data-static-style="a273">
        <h3 data-static-style="a274">ÐÐ¾ÑÑÑÐ°Ð½Ð¾Ð²Ð»ÐµÐ½Ð¸Ðµ Ð¿Ð°ÑÐ¾Ð»Ñ</h3>
        <button data-onclick="closeModal('forgotPasswordModal')" data-static-style="a275">✕</button>
      </div>
      <div id="fpStep1">
        <p data-static-style="a276">Введите email, указанный при регистрации. Мы отправим код для сброса пароля.</p>
        <input type="email" id="fpEmail" placeholder="Email" data-static-style="a277">
        <button id="fpSendBtn" data-onclick="forgotPasswordSendCode()" data-static-style="a278">Отправить код</button>
      </div>
      <div id="fpStep2" data-static-style="a279">
        <p data-static-style="a276">Введите код из письма и новый пароль.</p>
        <input type="text" id="fpCode" placeholder="Код из письма" inputmode="numeric" data-static-style="a280">
        <input type="password" id="fpNewPass" placeholder="Новый пароль (мин. 8 символов)" data-static-style="a277">
        <button id="fpResetBtn" data-onclick="forgotPasswordReset()" data-static-style="a278">Сбросить пароль</button>
      </div>
      <p data-static-style="a281">При потере пароля доступ к ранее зашифрованным заметкам не восстанавливается.</p>
    </div>`;
}

async function forgotPasswordSendCode() {
  const email = document.getElementById('fpEmail').value.trim();
  if (!email || !email.includes('@')) { showToast('Введите корректный email'); return; }
  const btn = document.getElementById('fpSendBtn');
  btn.disabled = true; btn.textContent = 'Отправляю…';
  try {
    await api.forgotPassword(email);
    window._fpEmail = email;
    document.getElementById('fpStep1').style.display = 'none';
    document.getElementById('fpStep2').style.display = 'block';
    showToast('Если email зарегистрирован, код отправлен');
  } catch (e) {
    showToast('Не удалось отправить код, попробуйте позже');
    btn.disabled = false; btn.textContent = 'Отправить код';
  }
}

async function forgotPasswordReset() {
  const code = document.getElementById('fpCode').value.trim();
  const newPass = document.getElementById('fpNewPass').value;
  if (!code) { showToast('Введите код из письма'); return; }
  if (newPass.length < 8) { showToast('Пароль: минимум 8 символов'); return; }
  const btn = document.getElementById('fpResetBtn');
  btn.disabled = true; btn.textContent = 'Сбрасываю…';
  try {
    await api.resetPassword(window._fpEmail, code, newPass);
    showToast('Пароль изменён, выполняется вход…');
    document.getElementById('forgotPasswordModal').remove();
    const user = await api.me();
    if (typeof deriveNoteKey === 'function') await deriveNoteKey(newPass, user.username);
    location.reload();
  } catch (e) {
    const msg = (e && (e.detail || (e.body && e.body.detail))) || 'Неверный код или истёк срок';
    showToast(msg);
    btn.disabled = false; btn.textContent = 'Сбросить пароль';
  }
}

function togglePasswordVisibility() {
  const input = document.getElementById('authPass');
  const icon = document.getElementById('eyeIcon');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>';
  } else {
    input.type = 'password';
    if (icon) icon.innerHTML = '<path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/>';
  }
}

function socialAuth(provider) {
  if (provider === 'sberid') {
    showToast('Вход через Сбер ID скоро будет доступен');
  } else {
    showToast(`Вход через ${provider} ещё не реализован`);
  }
}

document.getElementById('authDepartment').addEventListener('change', function() {
  const other = document.getElementById('authDepartmentOther');
  if (this.value === '__other__') {
    other.classList.remove('hidden');
    other.focus();
  } else {
    other.classList.add('hidden');
    other.value = '';
  }
});

function adaptBookFromApi(b) {
  // Определяем наличие файла по всем возможным полям
  const hasPdf = b.has_pdf === true || b.has_pdf === 'true' || b.has_pdf === 1;
  const hasEpub = b.has_epub === true || b.has_epub === 'true' || b.has_epub === 1;
  const hasFile = b.has_file === true || b.has_file === 'true' || b.has_file === 1;
  const hasFormat = b.file_format === 'pdf' || b.file_format === 'epub';
  
  // Если API вернул has_file напрямую — верим ему. Иначе проверяем has_pdf/has_epub/file_format
  const has_file = hasFile || hasPdf || hasEpub || hasFormat;

  return {
    id: b.id,
    title: b.title,
    author: b.author,
    categories: b.categories || [],  // ← массив!
    rating: typeof b.rating === 'string' ? b.rating : Number(b.rating).toFixed(1),
    icon: b.icon || ICONS.bookCover,
    desc: b.description || '',
    has_file: !!(b.has_pdf || b.has_epub || b.has_file),
    has_cover: !!(b.has_cover || b.cover_url),
    file_format: b.file_format || 'pdf',
    total_pages: b.total_pages || 0,
    dateAdded: (b.created_at || '').split('T')[0],
    datePublished: b.date_published || null,
    popularity: b.popularity || 50,
    views: b.views || 0,
    downloads: b.downloads || 0,
  };
}

function ensureProgress(book) {
  if (!state.readingProgress[book.id]) {
    state.readingProgress[book.id] = {
      currentPage: 1,
      totalPages: book.total_pages > 0 ? book.total_pages : 20,
      started: false,
    };
  } else if (book.total_pages > 0 && state.readingProgress[book.id].totalPages !== book.total_pages) {
    state.readingProgress[book.id].totalPages = book.total_pages;
  }
}

async function loadBooksFromApi() {
  // Показываем скелетон-заглушки, пока книги грузятся (вместо пустого экрана)
  if (!state.books || state.books.length === 0) {
    showSkeleton('scrollPopular', 6);
    showSkeleton('scrollAll', 6);
  }
  try {
    const perPage = 100;
    let page = 1;
    let all = [];
    let total = Infinity;
    // догружаем страницы, пока не соберём все книги (защита: максимум 50 страниц = 5000 книг)
    while (all.length < total && page <= 50) {
      const data = await api.books.list({ per_page: perPage, page });
      if (typeof data.total === 'number') total = data.total;
      const items = data.items || [];
      all = all.concat(items);
      if (items.length < perPage) break; // последняя страница
      page++;
    }
    state.books = all.map(adaptBookFromApi);
    state.books.forEach(b => { ensureProgress(b); });
    saveState();
    return true;
  } catch (err) {
    console.error('Не удалось загрузить книги с API:', err);
    // Нет сети — показываем скачанные книги из оффлайн-хранилища вместо пустого экрана
    if (!navigator.onLine) {
      const ok = await loadBooksFromOffline();
      if (ok) { showToast('Офлайн-режим: показаны скачанные книги'); return true; }
    }
    showToast('Не удаётся загрузить книги с сервера');
    state.books = [];
    return false;
  }
}

function formatApiError(err) {
  if (!(err instanceof api.ApiError)) return 'Не удаётся связаться с сервером.';

  // Полезно для отладки: показываем точную причину от сервера в консоли
  try { console.warn('API error', err.status, err.detail, err.body); } catch (_) {}

  if (Array.isArray(err.detail) && err.detail.length > 0) {
    const first = err.detail[0];
    const field = first.loc?.[first.loc.length - 1] || 'поле';
    const fieldRu = { username: 'логин', password: 'пароль', email: 'email', full_name: 'имя', department: 'подразделение' }[field] || field;
    return `${fieldRu}: ${first.msg}`;
  }

  if (typeof err.detail === 'string' && err.detail) return err.detail;

  // Иногда сервер кладёт сообщение в другие поля тела
  if (err.body && typeof err.body === 'object') {
    if (typeof err.body.message === 'string') return err.body.message;
    if (typeof err.body.error === 'string') return err.body.error;
  }

  return `Ошибка ${err.status}`;
}

let pendingVerifyEmail = null;
let pendingVerifyCreds = null;

function showPendingApprovalScreen() {
  let overlay = document.getElementById('pendingApprovalOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pendingApprovalOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg-primary);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';
    document.body.appendChild(overlay);
  }
  const hasLevel = state.currentUser && state.currentUser.cyber_level;
  overlay.innerHTML = `
    <div data-static-style="a282">
      <div data-static-style="a283">⏳</div>
      <h2 data-static-style="a284">Заявка на рассмотрении</h2>
      <p data-static-style="a285">
        Ваш email подтверждён. Теперь администратор должен одобрить доступ к библиотеке —
        обычно это занимает до 24 часов. Мы пришлём письмо на вашу почту, как только откроем доступ,
        так что эту страницу можно закрыть.
      </p>
      <p data-static-style="a286">
        А пока вы можете пройти тест на уровень знаний — результат сохранится в вашем профиле.
      </p>
      ${hasLevel ? `
        <div data-static-style="a287">
          Вы уже прошли тест уровня. Дождитесь одобрения администратора.
        </div>` : `
        <button id="pendingStartTestBtn" data-static-style="a288">Пройти тест на уровень знаний</button>
      `}
      <button id="pendingRefreshBtn" data-static-style="a289">Проверить статус одобрения</button>
      <button id="pendingLogoutBtn" data-static-style="a176">Выйти</button>
      <div data-static-style="a290">
        При возникновении вопросов или проблем пишите на почту
        <a href="mailto:support@aegis-sec-library.ru" data-static-style="a291">support@aegis-sec-library.ru</a>
      </div>
    </div>`;

  const startBtn = document.getElementById('pendingStartTestBtn');
  if (startBtn) {
    startBtn.onclick = () => {
      overlay.style.display = 'none';
      renderLevelChoices();
      navigateTo('onboarding');
    };
  }
  document.getElementById('pendingRefreshBtn').onclick = async () => {
    const rbtn = document.getElementById('pendingRefreshBtn');
    rbtn.disabled = true;
    const orig = rbtn.textContent;
    rbtn.textContent = 'Проверяю…';
    try {
      const u = await api.me();
      if (u && u.is_approved === true) {
        overlay.remove();
        if (state.currentUser) state.currentUser.is_approved = true;
        showToast('Доступ одобрен! Добро пожаловать');
        // Подгружаем данные библиотеки перед входом
        try {
          await loadBooksFromApi();
          await loadMyListFromApi();
          await loadProgressFromApi();
        } catch (_) {}
        navigateTo(u.cyber_level ? 'home' : 'onboarding');
      } else {
        rbtn.disabled = false;
        rbtn.textContent = orig;
        showToast('Заявка пока на рассмотрении администратором');
      }
    } catch (err) {
      rbtn.disabled = false;
      rbtn.textContent = orig;
      showToast('Не удалось проверить статус, попробуйте ещё раз');
    }
  };
  document.getElementById('pendingLogoutBtn').onclick = async () => {
    try {
      await api.logout();
      overlay.remove();
      clearNoteKey(); stopSyncPolling();
      state.currentUser = null;
      navigateTo('auth');
    } catch (err) {
      showToast(err && err.detail ? err.detail : 'Не удалось завершить сеанс. Попробуйте ещё раз.');
    }
  };
}

function showVerifyEmailScreen(email) {
  let overlay = document.getElementById('verifyEmailOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'verifyEmailOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg-primary);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px;';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div data-static-style="a292">
      <div data-static-style="a293">✉️</div>
      <h2 data-static-style="a294">Подтвердите email</h2>
      <p data-static-style="a295">
        Мы отправили код подтверждения на<br><b data-static-style="a154">${eh(email)}</b><br>
        <span data-static-style="a192">Проверьте папку «Спам», если письма нет</span>
      </p>
      <input type="text" id="verifyCodeInput" inputmode="numeric" maxlength="6" placeholder="000000"
        data-static-style="a296">
      <button id="verifyCodeBtn" data-static-style="a297">Подтвердить</button>
      <div data-static-style="a298">
        <button id="verifyResendBtn" data-static-style="a299">Отправить код повторно</button>
        <button id="verifyBackBtn" data-static-style="a176">Назад</button>
      </div>
    </div>`;

  const input = document.getElementById('verifyCodeInput');
  input.focus();
  document.getElementById('verifyCodeBtn').onclick = submitVerifyCode;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submitVerifyCode(); });
  document.getElementById('verifyResendBtn').onclick = async () => {
    try {
      await api.resendCode(pendingVerifyEmail);
      showToast('Код отправлен повторно');
    } catch (err) {
      showToast(getAuthErrorMessage(err));
    }
  };
  document.getElementById('verifyBackBtn').onclick = () => {
    overlay.remove();
    pendingVerifyEmail = null;
    pendingVerifyCreds = null;
  };
}

async function submitVerifyCode() {
  const code = document.getElementById('verifyCodeInput').value.trim();
  if (code.length < 4) return showToast('Введите код из письма');
  const btn = document.getElementById('verifyCodeBtn');
  btn.disabled = true;
  btn.textContent = '...';
  try {
    await api.verifyEmail(pendingVerifyEmail, code);
    // Выводим ключ шифрования из сохранённого при регистрации пароля
    if (pendingVerifyCreds && pendingVerifyCreds.password) {
      await deriveNoteKey(pendingVerifyCreds.password, pendingVerifyCreds.username);
    }
    // Успех — токены сохранены, грузим пользователя
    const user = await api.me();
    state.currentUser = {
      name: user.username, role: user.role, id: user.id, email: user.email,
      full_name: user.full_name, has_avatar: user.has_avatar, cyber_level: user.cyber_level,
      topic_scores: user.topic_scores, level_assessed_at: user.level_assessed_at,
      department: user.department || null,
      is_approved: user.is_approved !== false,
    };
    await loadBooksFromApi();
    await loadMyListFromApi();
    await loadProgressFromApi();
    await loadCompletedQuizzesFromApi();
    await loadGamificationFromApi();
    await loadOfflineBookIds();
    const ov = document.getElementById('verifyEmailOverlay');
    if (ov) ov.remove();
    pendingVerifyEmail = null;
    pendingVerifyCreds = null;
    showToast('Email подтверждён! Добро пожаловать');
    if (state.currentUser && state.currentUser.is_approved === false) {
      showPendingApprovalScreen();
    } else if (!user.cyber_level) navigateTo('onboarding');
    else navigateTo('home');
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Подтвердить';
    showToast(getAuthErrorMessage(err));
  }
}

document.getElementById('authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const n = document.getElementById('authName').value.trim();
  const p = document.getElementById('authPass').value.trim();
  const email = document.getElementById('authEmail')?.value?.trim() || '';
  if (!n) return showToast('Введите логин');
  if (!p) return showToast('Введите пароль');

  if (state.currentTab === 'register') {
    if (n.length < 3) return showToast('Логин: минимум 3 символа');
    if (n.length > 64) return showToast('Логин: максимум 64 символа');
    if (!/^[a-zA-Z0-9_]+$/.test(n)) return showToast('Логин: только латиница, цифры и _');
    if (p.length < 8) return showToast('Пароль: минимум 8 символов');
    if (!email) return showToast('Email обязателен — на него придёт код подтверждения');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showToast('Введите корректный email (например, name@example.com)');
  }

  const submitBtn = document.getElementById('authSubmitBtn');
  const submitText = document.getElementById('authSubmitText');
  const submitSpinner = document.getElementById('authSubmitSpinner');
  const originalText = submitText ? submitText.textContent : submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.classList.add('loading');
  if (submitText) submitText.textContent = '...';
  else submitBtn.textContent = '...';
  if (submitSpinner) submitSpinner.classList.remove('hidden');

  try {
    if (state.currentTab === 'register') {
      const firstName = document.getElementById('authFirstName').value.trim();
      const lastName = document.getElementById('authLastName').value.trim();
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;
      // Собираем подразделение
      const depSelect = document.getElementById('authDepartment').value;
      let department = null;
      if (depSelect === '__other__') {
        department = document.getElementById('authDepartmentOther').value.trim() || null;
      } else if (depSelect) {
        department = depSelect;
      }
      await api.register(n, p, email, fullName, department);
      // Регистрация создаёт неподтверждённый аккаунт — показываем экран ввода кода
      pendingVerifyEmail = email;
      pendingVerifyCreds = { username: n, password: p };
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
      if (submitText) submitText.textContent = originalText;
      if (submitSpinner) submitSpinner.classList.add('hidden');
      showVerifyEmailScreen(email);
      return;
    } else {
      await api.login(n, p);
    }
    // Выводим ключ шифрования заметок из пароля (держится только в памяти)
    await deriveNoteKey(p, n);
    const user = await api.me();
    state.currentUser = {
        name: user.username,
        role: user.role,
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        has_avatar: user.has_avatar,
        cyber_level: user.cyber_level,
        topic_scores: user.topic_scores,
        level_assessed_at: user.level_assessed_at,
        department: user.department || null,
      is_approved: user.is_approved !== false,
      };
      await loadBooksFromApi();
      await loadMyListFromApi();
      await loadProgressFromApi();
      await loadCompletedQuizzesFromApi();
      await loadGamificationFromApi();
      await loadOfflineBookIds();
      maybeAutoPreload();

      saveState();
      document.getElementById('authForm').reset();

      // Не одобрен админом — показываем экран ожидания (с возможностью пройти тест уровня)
      if (state.currentUser && state.currentUser.is_approved === false) {
        showPendingApprovalScreen();
      } else if (state.currentTab === 'register' && !user.cyber_level) {
        renderLevelChoices();
        navigateTo('onboarding');
      } else {
        navigateTo('home');
      }
  } catch (err) {
    // Если вход заблокирован из-за неподтверждённого email — показываем экран кода
    const msg = (err && (err.detail || (err.body && err.body.detail))) || '';
    if (err && err.status === 403 && /not verified/i.test(msg)) {
      const loginName = document.getElementById('authName').value.trim();
      const loginPass = document.getElementById('authPass').value.trim();
      try {
        // Узнаём email по аккаунту нельзя без входа — просим ввести email для повторной отправки
        const emailForVerify = document.getElementById('authEmail')?.value?.trim();
        if (emailForVerify) {
          pendingVerifyEmail = emailForVerify;
          pendingVerifyCreds = { username: loginName, password: loginPass };
          await api.resendCode(emailForVerify);
          showVerifyEmailScreen(emailForVerify);
        } else {
          showToast('Подтвердите email. Введите его в поле email и попробуйте снова.');
        }
      } catch (_) {
        showToast('Подтвердите email перед входом');
      }
    } else {
      showToast(formatApiError(err));
      if (!(err instanceof api.ApiError)) console.error(err);
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading');
    if (submitText) submitText.textContent = originalText;
    else submitBtn.textContent = originalText;
    if (submitSpinner) submitSpinner.classList.add('hidden');
  }
});

function logout() {
  // Используем кастомный confirm вместо нативного — выглядит в стиле приложения
  showConfirmModal({
    title: 'Выход из аккаунта',
    message: 'Вы уверены, что хотите выйти?',
    confirmText: 'Выйти',
    cancelText: 'Отмена',
    danger: true,
    onConfirm: async () => {
      try {
        await api.logout();
        clearNoteKey(); stopSyncPolling();
        await clearUserScopedData();
        state.currentUser = null;
        navigateTo('auth');
        showToast('Вы вышли из аккаунта');
      } catch (err) {
        showToast(err && err.detail ? err.detail : 'Не удалось завершить сеанс. Попробуйте ещё раз.');
      }
    },
  });
}

async function tryAutoLogin() {
  // Access-токен живёт в памяти и после перезагрузки страницы пуст. Пробуем
  // получить новый по httpOnly-cookie: если её нет или она протухла — гость.
  if (!api.isAuthenticated()) {
    const restored = await api.restoreSession();
    if (!restored) return false;
  }
  try {
    const user = await api.me();
   state.currentUser = {
      name: user.username,
      role: user.role,
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      has_avatar: user.has_avatar,
      cyber_level: user.cyber_level,
      topic_scores: user.topic_scores,
      level_assessed_at: user.level_assessed_at,
      profile_visibility: user.profile_visibility || 'public',
      department: user.department || null,
      is_approved: user.is_approved !== false,
    };

    await loadBooksFromApi();
    await loadMyListFromApi();
    await loadProgressFromApi();
    await loadCompletedQuizzesFromApi();
    await loadGamificationFromApi();
    await loadOfflineBookIds();
      maybeAutoPreload();

    saveState();
    return true;
  } catch (err) {
    // Различаем «протухший токен» и «нет сети».
    // 401 → токен недействителен, разлогиниваем как раньше.
    // Сетевая ошибка/офлайн + есть кэш пользователя → НЕ разлогиниваем,
    // восстанавливаем сессию из кэша и показываем скачанные книги.
    const isAuthError = (err instanceof api.ApiError) && err.status === 401;
    const cached = getCachedUser();
    if (!isAuthError && cached && api.isAuthenticated()) {
      state.currentUser = cached;
      await loadOfflineBookIds();
      await loadBooksFromOffline();
      try { loadProgressFromApi(); } catch (_) {}  // прогресс берётся локально, сетевой вызов молча упадёт
      showToast('Офлайн-режим: вход по сохранённой сессии');
      return true;
    }
    try { await api.logout(); } catch (_) { api.tokens.clear(); }
    clearNoteKey(); stopSyncPolling();
    clearCachedUser();
    return false;
  }
}

// ========== HOME ==========
function renderHome() {
  if (!state.currentUser) return;
  updateAvatar('avatarHome');
  const isAdmin = state.currentUser.role === 'admin';
  document.getElementById('badgeHome').classList.toggle('hidden', !isAdmin);
  document.getElementById('btnAdminGo').classList.toggle('hidden', !isAdmin);
  updateFabVisibility();
  const sorted = getFilteredBooks(), q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const isSearching = q.trim().length > 0;

  const sectionResume = document.getElementById('sectionResume');
  const sectionContinue = document.getElementById('sectionContinue');
  const sectionFavCats = document.getElementById('sectionFavCategories');
  const sectionRecommend = document.getElementById('sectionRecommendations');
  const sectionGoal = document.getElementById('sectionBooksGoal');
  const booksTabs = document.querySelector('#sectionBooks .books-tabs');

  if (isSearching) {
    // Режим поиска: прячем рекомендации/продолжить/возобновить/цели/табы,
    // показываем только результаты поиска единым списком.
    if (sectionContinue) sectionContinue.style.display = 'none';
    if (sectionFavCats) sectionFavCats.style.display = 'none';
    if (sectionRecommend) sectionRecommend.style.display = 'none';
    if (sectionResume) sectionResume.style.display = 'none';
    if (sectionGoal) sectionGoal.style.display = 'none';
    if (booksTabs) booksTabs.style.display = 'none';
    const pop = document.getElementById('scrollPopular');
    const all = document.getElementById('scrollAll');
    if (pop) { pop.classList.add('hidden'); pop.innerHTML = ''; }
    if (all) all.classList.remove('hidden');
    const pager = document.getElementById('booksPager');
    if (sorted.length === 0) {
      // Ничего не найдено — дружелюбное сообщение вместо пустоты
      if (all) all.innerHTML = `
        <div data-static-style="a312">
          <div data-static-style="a313">🔍</div>
          <div data-static-style="a314">По запросу «${eh(q)}» ничего не найдено</div>
          <div data-static-style="a315">Попробуйте другие слова или проверьте раскладку клавиатуры</div>
        </div>`;
      if (pager) pager.innerHTML = '';
    } else {
      renderPaginatedBooks('scrollAll', sorted, q);
    }
    return;
  }

  // Обычный режим — возвращаем секции и табы
  if (sectionContinue) sectionContinue.style.display = '';
  if (booksTabs) booksTabs.style.display = '';

  renderContinueScroll(sorted, q);
  renderBookScroll('scrollPopular', [...sorted].sort((a, b) => b.popularity - a.popularity).slice(0, 5), q);
  renderPaginatedBooks('scrollAll', sorted, q);
  setHomeBooksTab(state.homeBooksTab || 'popular');
  renderBooksGoalWidget();
  renderFavCategories();
  renderRecommendations();
}

function setHomeBooksTab(tab) {
  state.homeBooksTab = tab;
  document.querySelectorAll('.books-tab').forEach(b => b.classList.toggle('active', b.dataset.btab === tab));
  const pop = document.getElementById('scrollPopular');
  const all = document.getElementById('scrollAll');
  if (pop) pop.classList.toggle('hidden', tab !== 'popular');
  if (all) all.classList.toggle('hidden', tab !== 'all');
  // Пагинатор показываем только на вкладке «Все книги»
  const pager = document.getElementById('booksPager');
  if (pager) pager.style.display = (tab === 'all') ? 'block' : 'none';
  // При переходе на «Все книги» сразу перерисовываем книги и пагинатор,
  // иначе панель страниц появляется с задержкой (scrollAll был hidden при первом рендере).
  if (tab === 'all') {
    const sorted = getFilteredBooks();
    const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
    renderPaginatedBooks('scrollAll', sorted, q);
  }
}

// ========== ЭКРАН НАСТРОЕК ==========

const USER_AGREEMENT_HTML = `
  <h2 data-static-style="a345">Пользовательское соглашение (EULA)</h2>
  <p data-static-style="a204">Пользовательское соглашение (далее — «Соглашение») регулирует отношения между Владельцем сервиса (далее — «Администрация») и физическим лицом (далее — «Пользователь») по использованию прогрессивного веб-приложения «Aegis» (далее — «Сервис»), представляющего собой библиотеку материалов по кибербезопасности.</p>

  <h3 data-static-style="a346">1. Общие положения</h3>
  <p data-static-style="a347">1.1. <strong>Aegis</strong> — это PWA-сервис, предоставляющий доступ к структурированной библиотеке книг, статей, гайдов и исследовательских материалов в области информационной безопасности.</p>
  <p data-static-style="a347">1.2. Использование Сервиса регулируется настоящим Соглашением, а также Политикой конфиденциальности.</p>
  <p data-static-style="a347">1.3. Начиная использовать Сервис (установка PWA на устройство, авторизация или просмотр контента), Пользователь считается безоговорочно принявшим условия настоящего Соглашения. Если вы не согласны с условиями, вы обязаны прекратить использование Сервиса.</p>

  <h3 data-static-style="a346">2. Предмет соглашения и статус контента</h3>
  <p data-static-style="a347">2.1. <strong>Образовательная цель:</strong> Сервис предоставляет материалы исключительно в образовательных, исследовательских и ознакомительных целях для специалистов и энтузиастов сферы кибербезопасности.</p>
  <p data-static-style="a347">2.2. <strong>Авторские права:</strong> Весь контент, размещенный в библиотеке (тексты, обложки, дизайн, программный код PWA), является объектом интеллектуальной собственности Администрации или используется на основании лицензионных договоров с правообладателями.</p>
  <p data-static-style="a347">2.3. <strong>Ограничения использования контента:</strong></p>
  <p data-static-style="a348">— Пользователь вправе читать и цитировать материалы в личных образовательных целях в объемах, оправданных целью цитирования.<br>— <strong>Строго запрещается:</strong> воспроизведение, копирование, распространение, сдача в прокат, публичное воспроизведение материалов Сервиса или их фрагментов без письменного разрешения Администрации.</p>
  <p data-static-style="a347">2.4. <strong>Пользовательский контент:</strong> Если функционал Сервиса позволяет оставлять комментарии или заметки (Пользовательский контент), Пользователь гарантирует, что этот контент не нарушает законодательство и права третьих лиц.</p>

  <h3 data-static-style="a346">3. Функциональность PWA и офлайн-доступ</h3>
  <p data-static-style="a347">3.1. Сервис использует технологии Progressive Web App (Service Workers, Cache API) для обеспечения офлайн-доступа к ранее открытым материалам.</p>
  <p data-static-style="a347">3.2. Пользователь уведомлен, что:</p>
  <p data-static-style="a348">— Офлайн-режим работает исключительно с кэшированными данными.<br>— Для синхронизации прогресса чтения и получения обновлений библиотеки требуется активное подключение к сети Интернет.<br>— Администрация не несет ответственности за потерю кэшированных данных при очистке памяти браузера Пользователем или сбое файловой системы устройства.</p>

  <h3 data-static-style="a346">4. Права и обязанности сторон</h3>
  <p data-static-style="a347"><strong>Пользователь обязуется:</strong></p>
  <p data-static-style="a347">4.1. Использовать полученные знания исключительно в законных целях. <strong>Пользователь осознает, что применение техник и инструментов, описанных в материалах библиотеки, для несанкционированного доступа к чужим информационным системам является уголовно наказуемым деянием.</strong></p>
  <p data-static-style="a347">4.2. Не предпринимать действий, направленных на взлом, реверс-инжиниринг кода Сервиса, обход ограничений доступа (DRM/Tests) или нарушение нормальной работы PWA.</p>
  <p data-static-style="a347">4.3. Не использовать автоматизированные скрипты (парсинг, граббинг) для массовой загрузки материалов библиотеки.</p>
  <p data-static-style="a347"><strong>Администрация имеет право:</strong></p>
  <p data-static-style="a347">4.4. Модерировать и удалять Пользовательский контент без объяснения причин.</p>
  <p data-static-style="a347">4.5. Вносить изменения в каталог библиотеки, удалять или добавлять книги без предварительного уведомления Пользователя.</p>
  <p data-static-style="a347">4.6. Ограничить доступ к Сервису для Пользователя в случае нарушения условий настоящего Соглашения.</p>

  <h3 data-static-style="a346">5. Отказ от ответственности</h3>
  <p data-static-style="a347">5.1. <strong>«Как есть»:</strong> Сервис предоставляется на условиях «как есть» (as is). Администрация не предоставляет гарантий безошибочной и бесперебойной работы PWA.</p>
  <p data-static-style="a347">5.2. <strong>Не гарантируется:</strong> Администрация не гарантирует, что материалы библиотеки подходят для достижения конкретных практических целей Пользователя. Техническая информация может устаревать ввиду быстрого развития технологий.</p>
  <p data-static-style="a347">5.3. <strong>Ограничение ответственности:</strong> Администрация ни при каких обстоятельствах не несет ответственности за прямой или косвенный ущерб, причиненный Пользователю или третьим лицам в результате:</p>
  <p data-static-style="a348">— Незаконного использования Пользователем информации, полученной в Сервисе (включая уголовное преследование за хакерскую деятельность);<br>— Ошибок и уязвимостей в программном обеспечении, описанном в книгах библиотеки.</p>

  <h3 data-static-style="a346">6. Заключительные положения</h3>
  <p data-static-style="a347">6.1. Администрация оставляет за собой право в одностороннем порядке изменять текст настоящего Соглашения. Изменения вступают в силу с момента их публикации в Сервисе.</p>
  <p data-static-style="a349">6.2. Продолжение использования Сервиса после внесения изменений означает согласие Пользователя с новой редакцией Соглашения.</p>
`;

const PRIVACY_POLICY_HTML = `
  <h2 data-static-style="a345">Политика конфиденциальности</h2>
  <p data-static-style="a347"><strong>Прогрессивное веб-приложение «Aegis»</strong></p>
  <p data-static-style="a347">Настоящая Политика конфиденциальности (далее — «Политика») определяет, какие данные собирает и обрабатывает сервис «Aegis» (далее — «Сервис» или «PWA»), как они используются и защищаются.</p>
  <p data-static-style="a204">Мы серьезно относимся к конфиденциальности, особенно с учетом образовательной направленности нашего продукта в сфере кибербезопасности.</p>

  <h3 data-static-style="a346">1. Основные понятия</h3>
  <p data-static-style="a347">1.1. <strong>PWA (Progressive Web App)</strong> — веб-приложение, которое работает в браузере Пользователя и может быть установлено на устройство для офлайн-доступа.</p>
  <p data-static-style="a347">1.2. <strong>Персональные данные</strong> — любая информация, относящаяся к прямо или косвенно определенному или определяемому физическому лицу.</p>
  <p data-static-style="a347">1.3. <strong>Обезличенные данные</strong> — данные, которые не могут быть использованы для идентификации конкретного Пользователя без дополнительной информации.</p>
  <p data-static-style="a347">1.4. <strong>Service Worker</strong> — программный скрипт, работающий в фоновом режиме браузера и отвечающий за кэширование контента для офлайн-доступа.</p>

  <h3 data-static-style="a346">2. Какие данные мы собираем и зачем</h3>
  <p data-static-style="a347">2.1. <strong>Данные для работы аккаунта (опционально):</strong> адрес электронной почты, никнейм, хэшированный пароль. Цель — идентификация Пользователя, синхронизация прогресса чтения и закладок между устройствами. Основание — исполнение договора.</p>
  <p data-static-style="a347">2.2. <strong>Данные о прогрессе чтения:</strong> список прочитанных книг, страницы, закладки и текстовые заметки. Цель — продолжить чтение с того же места. Хранение — локально на устройстве (IndexedDB / LocalStorage); при использовании аккаунта — на сервере в зашифрованном виде.</p>
  <p data-static-style="a347">2.3. <strong>Данные, собираемые автоматически (обезличенные):</strong> логи сервера (IP-адрес, тип браузера, дата и время запроса, HTTP-статус, объем данных) хранятся до 14 дней; данные PWA-кэша (манифест, иконки, шрифты). Аналитика: мы не используем Google Analytics или Яндекс.Метрику, не используем cookie слежения и не создаём цифровой отпечаток.</p>
  <p data-static-style="a347">2.4. <strong>Данные для офлайн-доступа:</strong> текст, разметка и изображения открытых книг сохраняются в Cache API. Это техническая основа работы PWA. Вы можете очистить кэш через настройки браузера.</p>

  <h3 data-static-style="a346">3. Правовые основания обработки (GDPR / 152-ФЗ)</h3>
  <p data-static-style="a348">— <strong>Согласие:</strong> при первой установке PWA или первом открытии книги.<br>— <strong>Исполнение договора:</strong> для сохранения закладок и прогресса.<br>— <strong>Законный интерес:</strong> базовая безопасность и обезличенная статистика.</p>

  <h3 data-static-style="a346">4. Cookie и Web Storage</h3>
  <p data-static-style="a347">4.1. Сервис использует технические сессионные данные, необходимые для работы интерфейса.</p>
  <p data-static-style="a347">4.2. <strong>Мы принципиально не используем:</strong> сторонние рекламные и трекинговые cookie; скрытый майнинг; сбор данных из буфера обмена без вашего действия.</p>
  <p data-static-style="a347">4.3. Вы можете запретить Local Storage в настройках браузера, но это нарушит работу приложения (офлайн-чтение и сохранение прогресса).</p>

  <h3 data-static-style="a346">5. Передача данных третьим лицам</h3>
  <p data-static-style="a347">5.1. Мы не продаем, не передаем и не раскрываем информацию о том, какие книги вы читаете и какие заметки оставляете.</p>
  <p data-static-style="a347">5.2. <strong>Исключения:</strong> по законному запросу государственных органов РФ; хостинг- и CDN-провайдеру (исключительно для доставки файлов на ваше устройство).</p>

  <h3 data-static-style="a346">6. Безопасность данных</h3>
  <p data-static-style="a347">6.1. Обмен данными по HTTPS (TLS 1.3); внедрены заголовки безопасности (CSP, HSTS); инфраструктура регулярно сканируется на уязвимости.</p>
  <p data-static-style="a347">6.2. 100% безопасности в сети не существует. Рекомендуем использовать сложные пароли и не хранить чувствительную информацию в публичных заметках.</p>

  <h3 data-static-style="a346">7. Права Пользователя</h3>
  <p data-static-style="a348">1. <strong>На доступ:</strong> запросить перечень хранимых данных.<br>2. <strong>На удаление:</strong> потребовать удалить аккаунт и связанные данные.<br>3. <strong>На возражение:</strong> отказаться от уведомлений.<br>4. <strong>На локальное удаление:</strong> стереть данные PWA через «Очистить историю» → «Данные сайтов».</p>
  <p data-static-style="a347">Для реализации прав напишите на <strong>support@aegis-sec-library.ru</strong> с темой «Запрос конфиденциальности». Мы ответим в течение 10 рабочих дней. Возможно, потребуется подтвердить вашу личность.</p>

  <h3 data-static-style="a346">8. Изменения Политики</h3>
  <p data-static-style="a347">8.1. Мы можем вносить изменения. При существенных изменениях уведомим через интерфейс приложения.</p>
  <p data-static-style="a349">8.2. Новая редакция вступает в силу с момента публикации.</p>
`;

const SETTINGS_TABS = [
  { id: 'info',            label: 'Информация',     icon: 'iconUser' },
  { id: 'security',        label: 'Безопасность',   icon: 'iconLock' },
  { id: 'privacy',         label: 'Приватность',    icon: 'iconEye' },
  { id: 'storage',         label: 'Данные и память', icon: 'iconDatabase' },
  { id: 'personalization', label: 'Персонализация', icon: 'iconPalette' },
  { id: 'help',            label: 'Помощь',          icon: 'iconHelp' },
];

let settingsCurrentTab = 'info';

function renderSettingsScreen() {
  // Заполнить навигацию (один раз)
  document.querySelectorAll('.settings-tab').forEach(btn => {
    const tabId = btn.dataset.stab;
    const tab = SETTINGS_TABS.find(t => t.id === tabId);
    if (!tab) return;
    if (!btn.innerHTML.trim()) {
      btn.innerHTML = `${ICONS[tab.icon]}<span>${tab.label}</span>`;
    }
    btn.classList.toggle('active', tabId === settingsCurrentTab);
  });

  // Иконка для кнопки выхода
  const logoutIc = document.getElementById('logoutIcon');
  if (logoutIc && !logoutIc.innerHTML.trim()) logoutIc.innerHTML = ICONS.iconLogout;

  renderSettingsTabContent();
}

function openSettingsTab(tabId) {
  settingsCurrentTab = tabId;
  document.querySelectorAll('.settings-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.stab === tabId);
  });
  renderSettingsTabContent();
}

async function renderSettingsStorageTab(c) {
  c.innerHTML = `
    <h3 data-static-style="a350">Данные и память</h3>
    <div id="storageStatsContent" data-static-style="a351">
      ${ICONS.iconDatabase}
      <div data-static-style="a352">Подсчёт...</div>
    </div>
  `;

  const stats = await getStorageStats();
  const cont = document.getElementById('storageStatsContent');
  if (!cont) return;

  const usedPct = stats.quota > 0 ? Math.round((stats.used / stats.quota) * 100) : 0;
  const wifiOnly = isWifiOnlyEnabled();

  cont.style.textAlign = 'left';
  cont.style.padding = '0';
  cont.innerHTML = `
    <div data-static-style="a353">
      <div data-static-style="a354">
        <div data-static-style="a355">ИСПОЛЬЗОВАНО</div>
        <div data-static-style="a356">${formatBytes(stats.used)}</div>
      </div>
      <div data-static-style="a357">
        <div style="height:100%;width:${usedPct}%;background:var(--accent-gradient);transition:width 0.3s;"></div>
      </div>
      <div data-static-style="a358">
        <span>${usedPct}% от доступного</span>
        <span>из ${formatBytes(stats.quota)}</span>
      </div>
    </div>

    <div data-static-style="a359">
      <div data-static-style="a360">
        <div data-static-style="a361">${formatBytes(stats.cacheSize)}</div>
        <div data-static-style="a344">Кэш приложения</div>
      </div>
      <div data-static-style="a360">
        <div data-static-style="a362">${stats.cacheCount}</div>
        <div data-static-style="a344">Файлов в кэше</div>
      </div>
    </div>

    <!-- Тумблер «только Wi-Fi» -->
    <div class="set-row" data-static-style="a363">
      <div data-static-style="a364">
        <div data-static-style="a004">
          <div data-static-style="a365">Скачивать только по Wi-Fi</div>
          <div data-static-style="a099">Экономия мобильного трафика</div>
        </div>
        <label class="toggle-switch" data-static-style="a366">
          <input type="checkbox" id="wifiOnlyToggle" ${wifiOnly ? 'checked' : ''} data-onchange="onWifiOnlyToggle()" data-args="this" data-static-style="a367">
          <span class="toggle-slider" style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${wifiOnly ? 'var(--accent)' : 'var(--bg-card-hover)'};transition:0.2s;border-radius:24px;pointer-events:none;">
            <span style="position:absolute;height:18px;width:18px;left:${wifiOnly ? '21px' : '3px'};bottom:3px;background:#fff;transition:0.2s;border-radius:50%;"></span>
          </span>
        </label>
      </div>
    </div>

    <!-- Тумблер автопредзагрузки -->
    <div class="set-row" data-static-style="a363">
      <div data-static-style="a364">
        <div data-static-style="a004">
          <div data-static-style="a365">Автосохранение книг офлайн</div>
          <div data-static-style="a099">Начатые книги автоматически скачиваются по Wi-Fi</div>
        </div>
        <label class="toggle-switch" data-static-style="a366">
          <input type="checkbox" id="autoPreloadToggle" ${isAutoPreloadEnabled() ? 'checked' : ''} data-onchange="onAutoPreloadToggle()" data-args="this" data-static-style="a367">
          <span class="toggle-slider" style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${isAutoPreloadEnabled() ? 'var(--accent)' : 'var(--bg-card-hover)'};transition:0.2s;border-radius:24px;pointer-events:none;">
            <span style="position:absolute;height:18px;width:18px;left:${isAutoPreloadEnabled() ? '21px' : '3px'};bottom:3px;background:#fff;transition:0.2s;border-radius:50%;"></span>
          </span>
        </label>
      </div>
    </div>

    <button class="set-save-btn" data-onclick="exportAllUserData()" data-nonce="${sensitiveNonce()}" data-static-style="a368">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      <span>Скачать все мои данные</span>
    </button>
    <div data-static-style="a369">
      Выгрузка всех ваших данных (профиль, списки, заметки, прогресс, результаты тестов) одним JSON-файлом.
    </div>

    <button class="set-save-btn" data-onclick="confirmClearCache()" data-static-style="a370">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
      <span>Очистить кэш</span>
    </button>

    <div data-static-style="a371">
      После очистки книги придётся скачать заново при следующем чтении. Прогресс чтения, заметки и достижения сохранятся.
    </div>
  `;
}

function confirmClearCache() {
  showConfirmModal({
    title: 'Очистить кэш приложения?',
    message: 'Все скачанные книги будут удалены из кэша. Прогресс, заметки и достижения сохранятся.',
    confirmText: 'Очистить',
    cancelText: 'Отмена',
    danger: true,
    onConfirm: async () => {
      try {
        await clearAllAppCache();
        showToast('Кэш очищен');
        // Перерисуем вкладку
        renderSettingsStorageTab(document.getElementById('settingsContent'));
      } catch (e) {
        showToast('Не удалось очистить кэш');
        console.error(e);
      }
    },
  });
}

function renderSettingsTabContent() {
  const c = document.getElementById('settingsContent');
  if (!c || !state.currentUser) return;

  if (settingsCurrentTab === 'info') {
    renderSettingsInfoTab(c);
  } else if (settingsCurrentTab === 'security') {
    renderSettingsSecurityTab(c);
  } else if (settingsCurrentTab === 'personalization') {
    renderSettingsPersonalizationTab(c); 
  } else if (settingsCurrentTab === 'privacy') {
    renderSettingsPrivacyTab(c);
  } else if (settingsCurrentTab === 'storage') {
    renderSettingsStorageTab(c);
  } else if (settingsCurrentTab === 'help') {
    renderSettingsHelpTab(c);
  }else {
    const tab = SETTINGS_TABS.find(t => t.id === settingsCurrentTab);
    c.innerHTML = `
      <div data-static-style="a372">
        <div data-static-style="a373">${tab ? tab.label : ''}</div>
        <div data-static-style="a253">Раздел будет доступен в ближайшее время</div>
      </div>
    `;
  }
}

function renderSettingsHelpTab(c) {
  c.innerHTML = `
    <div data-static-style="a374">
      <div data-static-style="a375">
        <div data-static-style="a376">Знакомство с приложением</div>
        <p data-static-style="a377">
          Короткий тур по основным разделам: библиотека, тестирование, AI-ассистент и схемы атак.
        </p>
        <button data-onclick="replayOnboardingTour()" data-static-style="a378">
          Пройти обучение заново
        </button>
      </div>

      <div data-static-style="a375">
        <div data-static-style="a376">Установка приложения</div>
        <p data-static-style="a377">
          Установите Aegis на телефон или планшет для быстрого доступа с домашнего экрана.
        </p>
        <button data-onclick="triggerInstall()" data-static-style="a379">
          Установить приложение
        </button>
      </div>

      <div data-static-style="a375">
        <div data-static-style="a380">Связь с поддержкой</div>
        <p data-static-style="a377">
          При возникновении вопросов или проблем пишите на почту:
        </p>
        <a href="mailto:support@aegis-sec-library.ru" data-static-style="a381">
          support@aegis-sec-library.ru
        </a>
      </div>

      <div data-static-style="a382">
        <div data-static-style="a376">Правовые документы</div>
        <p data-static-style="a377">
          Условия использования платформы Aegis и порядок обработки данных.
        </p>
        <div data-static-style="a093">
          <button data-onclick="openUserAgreement()" data-static-style="a383">
            Пользовательское соглашение
          </button>
          <button data-onclick="openPrivacyPolicy()" data-static-style="a383">
            Политика конфиденциальности
          </button>
        </div>
      </div>
    </div>`;
}

function _openLegalModal(titleText, html) {
  let m = document.getElementById('legalDocModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'legalDocModal';
    m.style.cssText = 'position:fixed;inset:0;background:var(--bg-primary);z-index:4000;display:flex;flex-direction:column;';
    document.body.appendChild(m);
  }
  m.innerHTML = `
    <div data-static-style="a384">
      <div data-static-style="a385">${eh(titleText)}</div>
      <button data-onclick="closeModal('legalDocModal')" data-static-style="a386">✕</button>
    </div>
    <div data-static-style="a387">
      ${html}
    </div>
    <div data-static-style="a388">
      <button data-onclick="closeModal('legalDocModal')" data-static-style="a389">Закрыть</button>
    </div>`;
}

function openUserAgreement() {
  _openLegalModal('Пользовательское соглашение', USER_AGREEMENT_HTML);
}

function openPrivacyPolicy() {
  _openLegalModal('Политика конфиденциальности', PRIVACY_POLICY_HTML);
}

function renderSettingsPrivacyTab(c) {
  const u = state.currentUser;
  const current = u.profile_visibility || 'public';

  const options = [
    { value: 'public',     label: 'Публичный',         desc: 'Профиль доступен всем авторизованным пользователям' },
    { value: 'colleagues', label: 'Только для коллег', desc: 'Видят только пользователи твоего подразделения' },
    { value: 'private',    label: 'Приватный',         desc: 'Профиль скрыт от всех, кроме тебя' },
  ];

  c.innerHTML = `
    <h3 data-static-style="a350">Приватность</h3>

    <div data-static-style="a390">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-static-style="a391"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <div data-static-style="a392">
        В публичном профиле ваш email показывается замаскированным (например i***n@mail.ru). Приватный профиль скрыт от всех.
      </div>
    </div>

    <div class="set-row">
      <label>Отображение профиля</label>
      <div data-static-style="a393">
        ${options.map(opt => `
          <button data-onclick="setPrivacyVisibility('${opt.value}')" style="text-align:left;display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:${current === opt.value ? 'var(--accent-gradient)' : 'transparent'};border:none;border-radius:8px;cursor:pointer;font-family:inherit;color:${current === opt.value ? '#fff' : 'var(--text-primary)'};">
            <div style="width:18px;height:18px;border-radius:50%;border:2px solid ${current === opt.value ? '#fff' : 'var(--border-light)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">
              ${current === opt.value ? '<div data-static-style="a394"></div>' : ''}
            </div>
            <div data-static-style="a004">
              <div data-static-style="a395">${opt.label}</div>
              <div data-static-style="a396">${opt.desc}</div>
            </div>
          </button>
        `).join('')}
      </div>
    </div>

    <div data-static-style="a397">
      <label data-static-style="a398">Опасная зона</label>
      <button data-onclick="confirmDeleteAccount()" data-nonce="${sensitiveNonce()}" class="set-save-btn" data-static-style="a399">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        <span>Удалить аккаунт</span>
      </button>
      <div data-static-style="a369">
        Безвозвратно удаляет аккаунт и все данные: списки, заметки, прогресс, результаты тестов, коллекции.
      </div>
    </div>
  `;
}

function confirmDeleteAccount() {
  const ex = document.getElementById('deleteAccModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'deleteAccModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  m.innerHTML = `<div data-static-style="a400">
    <h3 data-static-style="a401">Удалить аккаунт?</h3>
    <p data-static-style="a402">Это действие необратимо. Все ваши данные будут удалены навсегда. Для подтверждения введите пароль и слово <b data-static-style="a154">УДАЛИТЬ</b>.</p>
    <input id="delAccPassword" type="password" placeholder="Пароль" data-static-style="a403">
    <input id="delAccConfirm" type="text" placeholder="Введите УДАЛИТЬ" data-static-style="a404">
    <div data-static-style="a108">
      <button data-onclick="closeModal('deleteAccModal')" data-static-style="a405">Отмена</button>
      <button data-onclick="doDeleteAccount()" data-nonce="${sensitiveNonce()}" data-static-style="a406">Удалить</button>
    </div>
  </div>`;
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  document.body.appendChild(m);
}

async function doDeleteAccount() {
  const pwd = document.getElementById('delAccPassword')?.value || '';
  const conf = document.getElementById('delAccConfirm')?.value || '';
  if (!pwd || !conf) { showToast('Заполните оба поля'); return; }
  try {
    await api.library.deleteAccount(pwd, conf);
    const m = document.getElementById('deleteAccModal');
    if (m) m.remove();
    showToast('Аккаунт удалён');
    // Аккаунт уже удалён сервером, поэтому отдельный отзыв сессии здесь
    // может закономерно вернуть 401. Локальные данные всё равно очищаем.
    try { await api.logout(); } catch (_) { api.tokens.clear(); }
    clearNoteKey(); stopSyncPolling();
    setTimeout(() => location.reload(), 800);
  } catch (err) {
    const msg = err && err.detail ? err.detail : (err && err.status ? 'Ошибка ' + err.status : 'Не удалось удалить');
    showToast(msg);
  }
}

async function setPrivacyVisibility(value) {
  try {
    const updated = await api.updateMe({ profile_visibility: value });
    state.currentUser.profile_visibility = updated.profile_visibility;
    renderSettingsPrivacyTab(document.getElementById('settingsContent'));
    showToast('Настройка сохранена');
  } catch (e) {
    console.error(e);
    showToast('Не удалось сохранить');
  }
}

// --- Размер шрифта читалки (масштаб PDF/EPUB-текста) ---
const READER_FONT_KEY = 'aegis_reader_font';
function getReaderFontScale() { return parseInt(localStorage.getItem(READER_FONT_KEY) || '100', 10); }
function setReaderFontScale(pct) {
  localStorage.setItem(READER_FONT_KEY, String(pct));
  renderSettingsPersonalizationTab(document.getElementById('settingsContent'));
  showToast(`Шрифт читалки: ${pct}%`);
}

function renderSettingsPersonalizationTab(c) {
  const currentTheme = getAppTheme();
  const currentGrid = getGridSize();
  const goal = getReadingGoal();
  const fontScale = getReaderFontScale();

  c.innerHTML = `
    <h3 data-static-style="a350">Персонализация</h3>

    <!-- Тема -->
    <div class="set-row">
      <label>Тема приложения</label>
      <div data-static-style="a407">
        <button data-onclick="setAppTheme('dark');renderSettingsPersonalizationTab(document.getElementById('settingsContent'))" class="app-theme-btn ${currentTheme === 'dark' ? 'active' : ''}" style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:${currentTheme === 'dark' ? 'var(--accent-gradient)' : 'transparent'};border:none;color:${currentTheme === 'dark' ? '#fff' : 'var(--text-secondary)'};border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;">
          ${ICONS.themeMoon}<span>Тёмная</span>
        </button>
        <button data-onclick="setAppTheme('light');renderSettingsPersonalizationTab(document.getElementById('settingsContent'))" class="app-theme-btn ${currentTheme === 'light' ? 'active' : ''}" style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:${currentTheme === 'light' ? 'var(--accent-gradient)' : 'transparent'};border:none;color:${currentTheme === 'light' ? '#fff' : 'var(--text-secondary)'};border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;">
          ${ICONS.themeSun}<span>Светлая</span>
        </button>
      </div>
    </div>

    <!-- Карточек в ряд -->
    <div class="set-row">
      <label>Карточек книг в ряд</label>
      <div data-static-style="a407">
        ${[2, 3, 4].map(n => `
          <button data-onclick="setGridSize(${n})" style="flex:1;padding:10px;background:${currentGrid === n ? 'var(--accent-gradient)' : 'transparent'};border:none;color:${currentGrid === n ? '#fff' : 'var(--text-secondary)'};border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;font-family:'JetBrains Mono',monospace;">
            ${n}
          </button>
        `).join('')}
      </div>
    </div>

    <!-- Предпросмотр -->
    <div class="set-row">
      <label>Предпросмотр</label>
      <div data-static-style="a408">
        <div id="gridPreview" style="display:grid;grid-template-columns:repeat(${currentGrid},1fr);gap:6px;">
          ${Array.from({length: currentGrid * 2}, () => `
            <div data-static-style="a409">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
            </div>
          `).join('')}
        </div>
      </div>
      <div data-static-style="a410">Изменения применяются ко всему каталогу</div>
    </div>

    <!-- Цель чтения -->
    <div class="set-row">
      <label>Цель чтения (страниц в день)</label>
      <div data-static-style="a407">
        ${[10, 20, 30, 50].map(n => `
          <button data-onclick="setReadingGoal(${n})" style="flex:1;padding:10px;background:${goal === n ? 'var(--accent-gradient)' : 'transparent'};border:none;color:${goal === n ? '#fff' : 'var(--text-secondary)'};border-radius:8px;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;">
            ${n}
          </button>
        `).join('')}
      </div>
      <div data-static-style="a410">Цель отображается в профиле и тепловой карте</div>
    </div>

    <!-- Цель по книгам за период -->
    <div class="set-row">
      <label>Цель: сколько книг прочитать</label>
      <div data-static-style="a411">Выберите количество книг и период</div>

      <div data-static-style="a412">Количество книг</div>
      <div data-static-style="a413">
        ${[5, 10, 15, 20, 30].map(n => {
          const sel = (getBooksGoal()?.count) === n;
          return `<button type="button" data-onclick="selectBooksGoalCount(${n})" data-args="this" class="bg-count-btn" style="min-width:52px;padding:12px 10px;border-radius:10px;border:1px solid ${sel ? 'transparent' : 'var(--border)'};background:${sel ? 'var(--accent-gradient)' : 'var(--bg-primary)'};color:${sel ? '#fff' : 'var(--text-secondary)'};cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:700;">${n}</button>`;
        }).join('')}
      </div>

      <div data-static-style="a412">Или своё число</div>
      <input id="booksGoalCount" type="number" inputmode="numeric" min="1" max="200" value="${(getBooksGoal()?.count) || ''}" placeholder="например, 12" data-static-style="a414">

      <div data-static-style="a412">За какой период</div>
      <div data-static-style="a415">
        ${[{v:'month',l:'Месяц'},{v:'quarter',l:'Квартал'},{v:'year',l:'Год'}].map(o => {
          const cur = getBooksGoal()?.period || 'quarter';
          const sel = cur === o.v;
          return `<button type="button" data-onclick="selectBooksGoalPeriod('${o.v}')" data-args="this" class="bg-period-btn" style="flex:1;padding:13px 8px;border-radius:10px;border:1px solid ${sel ? 'transparent' : 'var(--border)'};background:${sel ? 'var(--accent-gradient)' : 'var(--bg-primary)'};color:${sel ? '#fff' : 'var(--text-secondary)'};cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;">${o.l}</button>`;
        }).join('')}
      </div>

      <button data-onclick="saveBooksGoalFromUI()" class="set-save-btn" data-static-style="a416">Сохранить цель</button>
      ${getBooksGoal() ? `<button data-onclick="setBooksGoal(0)" class="set-save-btn" data-static-style="a417">Снять цель</button>` : ''}
      <div data-static-style="a418">Прогресс-бар появится на главной странице</div>
    </div>

    <!-- Размер шрифта читалки -->
    <div class="set-row">
      <label>Размер шрифта в читалке</label>
      <div data-static-style="a407">
        ${[{p:90,l:'А-'},{p:100,l:'А'},{p:115,l:'А+'},{p:130,l:'А++'}].map(o => `
          <button data-onclick="setReaderFontScale(${o.p})" style="flex:1;padding:10px;background:${fontScale === o.p ? 'var(--accent-gradient)' : 'transparent'};border:none;color:${fontScale === o.p ? '#fff' : 'var(--text-secondary)'};border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;">
            ${o.l}
          </button>
        `).join('')}
      </div>
      <div data-static-style="a410">Масштаб страницы при открытии книги</div>
    </div>
  `;
}

function setGridSize(n) {
  applyGridSize(n);
  // Перерисуем экран настроек чтобы обновить активную кнопку и предпросмотр
  renderSettingsPersonalizationTab(document.getElementById('settingsContent'));
  // Если открыта главная — перерисуем каталог
  if (state.currentScreen === 'home') renderHome();
  showToast(`Карточек в ряд: ${n}`);
}

function renderSettingsSecurityTab(c) {
  c.innerHTML = `
    <h3 data-static-style="a350">Смена пароля</h3>

    <div data-static-style="a419">
      Для смены пароля введи текущий пароль и новый пароль. Новый пароль должен быть не короче 8 символов и отличаться от текущего.
    </div>

    <div class="set-row">
      <label>Текущий пароль</label>
      <input type="password" id="setCurrentPassword" autocomplete="current-password" placeholder="Введите текущий пароль" maxlength="128">
    </div>

    <div class="set-row">
      <label>Новый пароль</label>
      <input type="password" id="setNewPassword" autocomplete="new-password" placeholder="Минимум 8 символов" maxlength="128">
    </div>

    <div class="set-row">
      <label>Повторите новый пароль</label>
      <input type="password" id="setNewPasswordConfirm" autocomplete="new-password" placeholder="Ещё раз новый пароль" maxlength="128">
    </div>

    <div id="setPasswordError" data-static-style="a420"></div>

    <button class="set-save-btn" data-onclick="saveSettingsPassword()">
      ${ICONS.iconSave}<span>Изменить пароль</span>
    </button>

    <div data-static-style="a421">
      <h3 data-static-style="a422">Смена email</h3>
      <div data-static-style="a423">
        Текущий email: <strong data-static-style="a424">${eh(state.currentUser?.email || 'не указан')}</strong>.
        На новый адрес придёт код подтверждения.
      </div>

      <div id="emailStep1">
        <div class="set-row">
          <label>Новый email</label>
          <input type="email" id="setNewEmail" autocomplete="email" placeholder="new@example.com">
        </div>
        <div class="set-row">
          <label>Пароль (для подтверждения)</label>
          <input type="password" id="setEmailPassword" autocomplete="current-password" placeholder="Ваш пароль">
        </div>
        <div id="setEmailError" data-static-style="a420"></div>
        <button class="set-save-btn" data-onclick="requestEmailChangeUI()">Отправить код подтверждения</button>
      </div>

      <div id="emailStep2" data-static-style="a279">
        <div data-static-style="a425">Код отправлен на новый адрес. Введите его ниже.</div>
        <div class="set-row">
          <label>Код из письма</label>
          <input type="text" inputmode="numeric" id="setEmailCode" placeholder="6-значный код" maxlength="6">
        </div>
        <div id="setEmailError2" data-static-style="a420"></div>
        <button class="set-save-btn" data-onclick="confirmEmailChangeUI()">Подтвердить смену email</button>
        <button class="set-save-btn" data-onclick="renderSettingsSecurityTab(document.getElementById('settingsContent'))" data-static-style="a426">Отмена</button>
      </div>
    </div>

  `;
}

async function requestEmailChangeUI() {
  const email = (document.getElementById('setNewEmail').value || '').trim();
  const pwd = (document.getElementById('setEmailPassword').value || '');
  const err = document.getElementById('setEmailError');
  err.textContent = '';
  if (!email || !email.includes('@')) { err.textContent = 'Введите корректный email'; return; }
  if (!pwd) { err.textContent = 'Введите пароль'; return; }
  try {
    await api.requestEmailChange(email, pwd);
    document.getElementById('emailStep1').style.display = 'none';
    document.getElementById('emailStep2').style.display = 'block';
    showToast('Код отправлен на новый адрес');
  } catch (e) {
    err.textContent = e && e.detail ? e.detail : 'Не удалось отправить код';
  }
}

async function confirmEmailChangeUI() {
  const code = (document.getElementById('setEmailCode').value || '').trim();
  const err = document.getElementById('setEmailError2');
  err.textContent = '';
  if (!code) { err.textContent = 'Введите код'; return; }
  try {
    const updated = await api.confirmEmailChange(code);
    state.currentUser.email = updated.email;
    showToast('Email изменён');
    renderSettingsSecurityTab(document.getElementById('settingsContent'));
  } catch (e) {
    err.textContent = e && e.detail ? e.detail : 'Неверный код';
  }
}

async function saveSettingsPassword() {
  const current = (document.getElementById('setCurrentPassword').value || '');
  const newp = (document.getElementById('setNewPassword').value || '');
  const confirm = (document.getElementById('setNewPasswordConfirm').value || '');
  const errEl = document.getElementById('setPasswordError');
  errEl.textContent = '';

  if (!current) { errEl.textContent = 'Введите текущий пароль'; return; }
  if (newp.length < 8) { errEl.textContent = 'Новый пароль должен быть не короче 8 символов'; return; }
  if (newp !== confirm) { errEl.textContent = 'Новые пароли не совпадают'; return; }
  if (newp === current) { errEl.textContent = 'Новый пароль должен отличаться от текущего'; return; }

  try {
    await api.changePassword(current, newp);
    showToast('Пароль изменён');
    // Чистим поля для безопасности
    document.getElementById('setCurrentPassword').value = '';
    document.getElementById('setNewPassword').value = '';
    document.getElementById('setNewPasswordConfirm').value = '';
  } catch (e) {
    if (e.status === 401) {
      errEl.textContent = 'Текущий пароль неверный';
    } else if (e.status === 400) {
      errEl.textContent = e.detail || 'Ошибка при смене пароля';
    } else {
      errEl.textContent = 'Не удалось изменить пароль. Попробуйте позже.';
      console.error(e);
    }
  }
}

function renderSettingsInfoTab(c) {
  const u = state.currentUser;
  c.innerHTML = `
    <h3 data-static-style="a350">Информация о профиле</h3>

    <!-- Аватар -->
    <div data-static-style="a428">
      <div class="profile-avatar-lg" data-static-style="a429" data-onclick="clickElement('settingsAvatarUpload')">
        <span id="settingsAvatarText">U</span>
        <img id="settingsAvatarImg" data-static-style="a279">
      </div>
      <input type="file" id="settingsAvatarUpload" accept="image/*" data-static-style="a279" data-onchange="uploadAvatar()" data-args="event">
      <div data-static-style="a430">
        Кликни на аватар чтобы загрузить новое фото<br>
        (JPEG/PNG/WEBP, до 2 МБ)
      </div>
    </div>

    <!-- Никнейм (только просмотр пока) -->
    <div class="set-row">
      <label>Никнейм (логин)</label>
      <input type="text" id="setUsername" value="${eh(u.name || '')}" disabled data-static-style="a431">
      <div data-static-style="a410">Изменение никнейма пока не поддерживается</div>
    </div>

    <!-- ФИО -->
    <div class="set-row">
      <label>ФИО</label>
      <input type="text" id="setFullName" value="${eh(u.full_name || '')}" placeholder="Иванов Иван Иванович" maxlength="128">
    </div>

    <!-- Подразделение -->
    <div class="set-row">
      <label>Подразделение</label>
      <select id="setDepartment">
        <option value="">— Не указано —</option>
        <option value="ЦКЗ">ЦКЗ</option>
        <option value="ДПМ">ДПМ</option>
        <option value="УБД">УБД</option>
        <option value="УКИИ">УКИИ</option>
        <option value="УКАИ">УКАИ</option>
        <option value="УМК">УМК</option>
        <option value="УЭК">УЭК</option>
        <option value="ЦКГ">ЦКГ</option>
        <option value="ЦУПКБ">ЦУПКБ</option>
        <option value="ЦВВ">ЦВВ</option>
        <option value="__other__">Другое...</option>
      </select>
      <input type="text" id="setDepartmentOther" placeholder="Введите название" maxlength="64" data-static-style="a432">
    </div>

    <button class="set-save-btn" data-onclick="saveSettingsInfo()">
      ${ICONS.iconSave}<span>Сохранить изменения</span>
    </button>
  `;

  // Применяем аватар
  updateAvatar('settingsAvatarImg');
  const avatarText = document.getElementById('settingsAvatarText');
  if (avatarText) {
    avatarText.textContent = (u.name || 'U').charAt(0).toUpperCase();
    const img = document.getElementById('settingsAvatarImg');
    if (img && img.src && !img.src.endsWith('undefined') && img.style.display !== 'none') {
      avatarText.style.display = 'none';
    }
  }

  // Подставляем текущее подразделение
  const depSelect = document.getElementById('setDepartment');
  const depOther = document.getElementById('setDepartmentOther');
  const KNOWN_DEPS = ['ЦКЗ','ДПМ','УБД','УКИИ','УКАИ','УМК','УЭК','ЦКГ','ЦУПКБ','ЦВВ'];
  if (u.department) {
    if (KNOWN_DEPS.includes(u.department)) {
      depSelect.value = u.department;
      depOther.style.display = 'none';
    } else {
      depSelect.value = '__other__';
      depOther.value = u.department;
      depOther.style.display = 'block';
    }
  }

  depSelect.addEventListener('change', () => {
    if (depSelect.value === '__other__') {
      depOther.style.display = 'block';
      depOther.focus();
    } else {
      depOther.style.display = 'none';
      depOther.value = '';
    }
  });
}

async function saveSettingsInfo() {
  const fullName = (document.getElementById('setFullName').value || '').trim();
  const depSelect = document.getElementById('setDepartment').value;
  let department = null;
  if (depSelect === '__other__') {
    department = (document.getElementById('setDepartmentOther').value || '').trim();
  } else if (depSelect) {
    department = depSelect;
  }

  try {
    const updated = await api.updateMe({
      full_name: fullName || null,
      department: department || null,
    });
    // Обновим state
    state.currentUser.full_name = updated.full_name;
    state.currentUser.department = updated.department;
    showToast('Изменения сохранены');
    renderProfile();
  } catch (e) {
    console.error(e);
    showToast('Ошибка: ' + (e.detail || e.message));
  }
}

// ========== EDIT PROFILE MODAL ==========
function openEditProfileModal() {
  if (!state.currentUser) return;
  const currentName = state.currentUser.full_name || '';
  document.getElementById('editFullName').value = currentName;
  // Кнопка «Удалить аватар» только если он есть
  const avatarSection = document.getElementById('editAvatarSection');
  if (avatarSection) {
    avatarSection.style.display = state.currentUser.has_avatar ? 'block' : 'none';
  }
  document.getElementById('editProfileModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('editFullName').focus(), 100);
}

function closeEditProfileModal() {
  document.getElementById('editProfileModal').classList.add('hidden');
}

async function saveProfileEdits() {
  const fullName = document.getElementById('editFullName').value.trim();
  const btn = document.getElementById('saveProfileBtn');
  btn.disabled = true;
  btn.textContent = 'Сохранение...';
  try {
    const updated = await api.updateMe({ full_name: fullName || null });
    // Обновляем state.currentUser
    state.currentUser.full_name = updated.full_name;
    state.currentUser.has_avatar = updated.has_avatar;
    closeEditProfileModal();
    renderProfile();
    updateAvatar('avatarHome');
    updateAvatar('avatarMylist');
    updateAvatar('avatarTraining');
    showToast('Имя обновлено');
  } catch (err) {
    if (err instanceof api.ApiError) {
      showToast('Ошибка: ' + (err.detail || err.status));
    } else {
      showToast('Сервер недоступен');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Сохранить';
  }
}
async function deleteCurrentAvatar() {
  if (!confirm('Удалить аватар? Будет показываться буква.')) return;
  const btn = document.getElementById('deleteAvatarBtn');
  btn.disabled = true;
  btn.textContent = 'Удаление...';
  try {
    const updated = await api.deleteAvatar();
    state.currentUser.has_avatar = updated.has_avatar;
    closeEditProfileModal();
    renderProfile();
    updateAvatar('avatarHome');
    updateAvatar('avatarMylist');
    updateAvatar('avatarTraining');
    showToast('Аватар удалён');
  } catch (err) {
    if (err instanceof api.ApiError) {
      showToast('Ошибка: ' + (err.detail || err.status));
    } else {
      showToast('Сервер недоступен');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Удалить аватар';
  }
}
async function uploadAvatar(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 2 * 1024 * 1024) {
    showToast('Файл слишком большой (макс 2 МБ)');
    e.target.value = '';
    return;
  }
  showToast('Загружаем аватар...');
  try {
    const updated = await api.uploadAvatar(f);
    state.currentUser.has_avatar = updated.has_avatar;
    renderProfile();
    updateAvatar('avatarHome');
    updateAvatar('avatarMylist');
    updateAvatar('avatarTraining');
    showToast('Аватар обновлён');
  } catch (err) {
    if (err instanceof api.ApiError) {
      showToast('Ошибка: ' + (err.detail || err.status));
    } else {
      showToast('Сервер недоступен');
    }
  } finally {
    e.target.value = '';
  }
}

async function showMyStatsModal() {
  const ex = document.getElementById('myStatsModal');
  if (ex) ex.remove();

  const modal = document.createElement('div');
  modal.id = 'myStatsModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = `<div data-static-style="a433">
    <div data-static-style="a434">
      <h2 data-static-style="a435">Моя статистика</h2>
      <button id="myStatsClose" data-static-style="a436">✕</button>
    </div>
    <div id="myStatsBody" data-static-style="a437">Считаю…</div>
  </div>`;
  document.body.appendChild(modal);
  document.getElementById('myStatsClose').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  // Подгружаем свежие данные
  try { await loadHeatmapFromApi(); } catch (_) {}
  let attempts = [];
  try { attempts = await api.library.myQuizAttempts(); } catch (_) {}

  const days = state.heatmapData || [];
  const totalPages = days.reduce((s, d) => s + (d.pages || 0), 0);
  const activeDays = days.filter(d => (d.pages || 0) > 0).length;
  // Оценка часов: ~1.8 мин на страницу
  const hours = Math.round((totalPages * 1.8 / 60) * 10) / 10;
  const goal = (typeof getReadingGoal === 'function') ? getReadingGoal() : 20;

  // Любимые категории — из mylist + books
  const catCount = {};
  Object.keys(state.mylist || {}).forEach(bid => {
    const b = (state.books || []).find(x => String(x.id) === String(bid));
    if (b) (b.categories || []).forEach(c => { catCount[c] = (catCount[c] || 0) + 1; });
  });
  const topCats = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Средний балл тестов
  const avgQuiz = attempts.length
    ? Math.round(attempts.reduce((s, a) => s + (a.percentage || 0), 0) / attempts.length)
    : null;
  const passedCount = attempts.filter(a => (a.percentage || 0) >= 60).length;

  // Динамика по неделям (последние ~12 недель)
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    weeks.push(chunk.reduce((s, d) => s + (d.pages || 0), 0));
  }
  const maxWeek = Math.max(1, ...weeks);

  // Статусы книг
  const statuses = Object.values(state.mylist || {});
  const reading = statuses.filter(s => s === 'reading').length;
  const completed = statuses.filter(s => s === 'completed').length;
  const planned = statuses.filter(s => s === 'planned').length;

  const card = (val, label, color) => `
    <div data-static-style="a438">
      <div style="font-size:24px;font-weight:800;color:${color};font-family:'JetBrains Mono',monospace;">${val}</div>
      <div data-static-style="a439">${label}</div>
    </div>`;

  const body = document.getElementById('myStatsBody');
  if (!body) return;
  body.style.textAlign = 'left';
  body.style.padding = '0';
  body.style.color = 'var(--text-primary)';
  body.innerHTML = `
    <div data-static-style="a440">
      ${card(totalPages, 'страниц прочитано', 'var(--accent)')}
      ${card(hours + ' ч', 'примерно времени', '#a855f7')}
      ${card(activeDays, 'активных дней', '#10b981')}
      ${card(avgQuiz !== null ? avgQuiz + '%' : '—', 'средний балл тестов', '#f59e0b')}
    </div>

    <div data-static-style="a441">
      <div data-static-style="a442">Динамика по неделям</div>
      <div data-static-style="a443">
        ${weeks.map(w => `<div title="${w} стр." style="flex:1;min-width:4px;height:${Math.max(4, Math.round(w / maxWeek * 70))}px;background:var(--accent-gradient);border-radius:3px 3px 0 0;"></div>`).join('') || '<div data-static-style="a444">Нет данных</div>'}
      </div>
      <div data-static-style="a410">Сумма страниц за каждую неделю (90 дней)</div>
    </div>

    <div data-static-style="a441">
      <div data-static-style="a442">Любимые категории</div>
      ${topCats.length ? topCats.map(([cat, n]) => {
        const pct = Math.round(n / topCats[0][1] * 100);
        return `<div data-static-style="a347">
          <div data-static-style="a445"><span>${eh(cat)}</span><span data-static-style="a243">${n}</span></div>
          <div data-static-style="a446"><div style="height:100%;width:${pct}%;background:var(--accent-gradient);"></div></div>
        </div>`;
      }).join('') : '<div data-static-style="a192">Добавь книги в список, чтобы увидеть категории</div>'}
    </div>

    <div data-static-style="a447">
      ${card(reading, 'читаю', '#3b82f6')}
      ${card(completed, 'прочитано', '#10b981')}
      ${card(planned, 'в планах', '#a855f7')}
    </div>

    <div data-static-style="a448">
      Тестов пройдено: ${passedCount} из ${attempts.length} · Цель: ${goal} стр./день
    </div>
  `;
}

function updateAvatar(id) {
  const el = document.getElementById(id);
  if (!el || !state.currentUser) return;
  const u = state.currentUser;
  const displayName = u.full_name || u.name;
  if (u.has_avatar) {
    const img = document.createElement('img');
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    img.src = api.users.avatarUrl(u.id) + '?t=' + Date.now();
    img.onerror = () => { el.textContent = displayName.charAt(0).toUpperCase(); };
    el.innerHTML = '';
    el.appendChild(img);
  } else {
    el.innerHTML = displayName.charAt(0).toUpperCase();
  }
}

// ========== DETAIL ==========
document.getElementById('detailTabs')?.addEventListener('click', e => {
  const t = e.target.closest('.detail-tab');
  if (!t) return;
  state.detailTab = t.dataset.dtab;
  document.querySelectorAll('.detail-tab').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  document.querySelectorAll('.detail-tab-content').forEach(x => x.classList.add('hidden'));
  const tabId = 'detailTab' + t.dataset.dtab.charAt(0).toUpperCase() + t.dataset.dtab.slice(1);
  const el = document.getElementById(tabId);
  if (el) el.classList.remove('hidden');
  if (state.detailTab === 'reviews') { reviewRating = 0; renderReviews(); }
  if (state.detailTab === 'discussion') renderDiscussion();
  if (state.detailTab === 'training') renderDetailTraining();
  if (state.detailTab === 'notes') renderDetailNotes();
});

function openBookDetail(bookId) {
  const b = state.books.find(x => x.id === bookId);
  if (!b) return;
  state.currentBook = b;
  currentBookId = bookId;
  state.detailTab = 'info';
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.toggle('active', t.dataset.dtab === 'info'));
  document.querySelectorAll('.detail-tab-content').forEach(x => x.classList.add('hidden'));
  document.getElementById('detailTabInfo').classList.remove('hidden');
  navigateTo('detail');
  renderBookInfo();
  refreshBookFromApi(bookId).then(() => {
    if (state.currentScreen === 'detail' && currentBookId === bookId) renderBookInfo();
  });
}

function renderBookInfo() {
  const b = state.books.find(x => x.id === currentBookId);
  if (!b) return;
  const isAdmin = state.currentUser?.role === 'admin';
  const views = b.views || 0;
  const downloads = b.downloads || 0;
  const formatLabel = (b.file_format || 'pdf').toUpperCase();
  let adminStats = '';
  if (isAdmin) {
    adminStats = `<div class="admin-book-stats"><span>${ICONS.eye} ${views} просмотров</span><span>${ICONS.download} ${downloads} скачиваний</span><span>${ICONS.fileText} ${formatLabel}</span></div>`;
  }
  document.getElementById('detailTabInfo').innerHTML = `
    <div class="detail-content">
      <div class="detail-cover">${b.has_cover ? `<img src="${api.books.coverUrl(b.id)}" alt="" data-static-style="a467" data-onerror="replaceWithFallback()" data-args="this" data-fallback="cover">` : ICONS.bookCover}</div>
      <div class="detail-info">
        <div class="detail-title">${eh(b.title)}</div>
        <div class="detail-author">${eh(b.author)}</div>
        <div class="detail-rating">${ICONS.star} ${b.rating}</div>
        <div class="detail-category">${bookCategoriesText(b)} • ${formatLabel}</div>
        <div class="detail-desc">${eh(b.desc)}</div>
        ${adminStats}
        <select class="mylist-status-select" data-onchange="onBookStatusChange(${b.id})" data-args="this">
          <option value="">Не в списке</option>
          <option value="reading" ${state.mylist[currentBookId] === 'reading' ? 'selected' : ''}>Читаю</option>
          <option value="planned" ${state.mylist[currentBookId] === 'planned' ? 'selected' : ''}>В планах</option>
          <option value="dropped" ${state.mylist[currentBookId] === 'dropped' ? 'selected' : ''}>Брошено</option>
          <option value="completed" ${state.mylist[currentBookId] === 'completed' ? 'selected' : ''}>Прочитано</option>
          <option value="liked" ${state.mylist[currentBookId] === 'liked' ? 'selected' : ''}>Избранное</option>
        </select>
        <div class="detail-actions">
          <button class="btn-detail" data-onclick="openReader(${b.id})">${ICONS.book} Читать</button>
          ${b.has_file ? (offlineBookIds.has(b.id)
            ? `<button class="btn-detail offline-btn-saved" data-onclick="removeBookOffline(${b.id})">${ICONS.cloudCheck} Удалить из оффлайн</button>`
            : `<button class="btn-detail offline-btn-save" data-onclick="saveBookOffline(${b.id})">${ICONS.cloudDownload} Сохранить оффлайн</button>`) : ''}
          ${(() => {
            const stage = findKillChainStageForBook(b);
            if (!stage) return '';
            return `<button class="btn-detail" data-static-style="a468" data-onclick="openARWithScheme('killchain', ${stage.id})" title="Открыть схему Cyber Kill Chain на этапе «${eh(stage.nameRu)}»">${ICONS.target} Смотреть схему атаки</button>`;
          })()}
          ${isAdmin ? `<button class="btn-detail" data-static-style="a469" data-onclick="openAdminBookModal(${b.id})">${ICONS.settings} Управление</button>` : ''}
          <button class="btn-detail" data-static-style="a470" data-onclick="openAddToCollection(${b.id})">${ICONS.bookmark || ''} В коллекцию</button>
        </div>
      </div>
    </div>
    <div id="alsoReadSection" data-static-style="a471"></div>`;
  loadAlsoRead(currentBookId);
}

// ========== EPUB READER ==========
async function loadEpub(b) {
  isEpubMode = true;
  document.getElementById('pdfViewport').classList.add('hidden');
  document.getElementById('epubViewport').classList.remove('hidden');
  document.getElementById('annotationLayer').innerHTML = '';

  const container = document.getElementById('epubContainer');
  container.innerHTML = loadingSpinnerHTML('Загрузка книги…');

  // Лениво подгружаем epub.js при первом открытии EPUB
  try {
    await ensureEpubLoaded();
  } catch (e) {
    container.innerHTML = '<div data-static-style="a507">Не удалось загрузить EPUB-движок. Проверьте соединение.</div>';
    return;
  }

  try {
    let epubData = null;
    let fromOffline = false;

    // 1. Сначала пробуем IndexedDB
    if (offlineBookIds.has(b.id)) {
      try {
        const blob = await offlineStorage.getFile(b.id, 'epub');
        if (blob) {
          epubData = await blob.arrayBuffer();
          fromOffline = true;
        }
      } catch (e) {
        console.warn('Не удалось прочитать EPUB из IndexedDB:', e);
      }
    }

    // 2. Если в IndexedDB нет — пробуем API
    if (!epubData) {
      if (!b.has_file) {
        showToast('EPUB-файл не найден');
        closeReader();
        return;
      }
      try {
        const resp = await api.request('/books/' + b.id + '/pdf', { raw: true });
        epubData = await resp.arrayBuffer();
      } catch (err) {
        showToast('Нет связи. Сохраните книгу оффлайн заранее.');
        closeReader();
        return;
      }
    }

    // 3. Рендерим EPUB
    if (typeof ePub === 'undefined') {
      showToast('EPUB-движок не загрузился. Проверьте интернет/доступ к CDN.');
      closeReader();
      return;
    }
    epubBook = ePub(epubData);
    epubRendition = epubBook.renderTo(container, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
    });
    // Применяем тему после создания rendition
  setTimeout(() => applyReaderTheme(getReaderTheme()), 100);

    const location = await epubBook.locations.generate(1000);
    epubRendition.display();

    epubTotalPages = location.total || 1;
    epubCurrentPage = Math.min(state.readingProgress[b.id]?.currentPage || 1, epubTotalPages);

    if (!state.readingProgress[b.id]) {
      state.readingProgress[b.id] = { currentPage: 1, totalPages: epubTotalPages, started: false };
    } else {
      state.readingProgress[b.id].totalPages = epubTotalPages;
    }

    updatePageIndicator();
    container.innerHTML = '';
    epubRendition.display(epubCurrentPage - 1);

    epubRendition.on('relocated', (loc) => {
      const current = epubBook.locations.locationFromCfi(loc.start);
      if (current !== null && current !== undefined) {
        epubCurrentPage = current + 1;
        if (state.currentBook) {
          state.readingProgress[state.currentBook.id].currentPage = epubCurrentPage;
          scheduleProgressSave(state.currentBook.id);
        }
        updatePageIndicator();
      }
    });
// === Выделение текста в EPUB ===
    epubRendition.on('selected', (cfiRange, contents) => {
      handleEpubSelection(cfiRange, contents);
    });

    // Подгружаем уже сохранённые highlights и рендерим их поверх текста
    await loadAndApplyEpubHighlights();

    saveState();
    if (fromOffline) showToast('Читаем из оффлайн-хранилища');
  } catch (err) {
    console.error('Ошибка загрузки EPUB:', err);
    showToast('Не удалось загрузить EPUB');
    closeReader();
  }
}

// ========== PDF READER ==========
let _pdfLoadToken = 0;          // защита от параллельных/повторных загрузок книги
let _pdfLoadingTask = null;     // текущая задача pdf.js, чтобы отменить прошлую

async function loadPdf(b) {
  // Повторный вызов (двойной тап, перерисовка) не должен перетирать уже
  // открытую книгу — актуальность загрузки проверяем по токену.
  //
  // ВАЖНО: не вызывать destroy() у предыдущей задачи. pdf.js использует один
  // общий worker на все документы, и destroy() убивает его целиком — следующая
  // книга падает с «Worker was terminated» и висит на спиннере навсегда.
  const myToken = ++_pdfLoadToken;
  isEpubMode = false;
  document.getElementById('epubViewport').classList.add('hidden');
  document.getElementById('pdfViewport').classList.remove('hidden');

  const c = document.getElementById('pdfCanvas');
  const pl = document.getElementById('pdfPlaceholder');

  pl.classList.remove('hidden');
  pl.innerHTML = loadingSpinnerHTML('Загрузка книги…');
  c.classList.add('hidden');

  // Если загрузка затянулась (большой PDF) — обновляем подпись, чтобы человек
  // понимал, что всё идёт штатно, просто книга большая.
  if (window._bookLoadHintTimer) clearTimeout(window._bookLoadHintTimer);
  window._bookLoadHintTimer = setTimeout(() => {
    const sp = document.getElementById('pdfPlaceholder');
    if (sp && sp.querySelector('.aegis-spinner')) {
      sp.innerHTML = loadingSpinnerHTML('Загружаем большую книгу, ещё несколько секунд…');
    }
  }, 3000);

  // Лениво подгружаем pdf.js при первом открытии PDF
  try {
    await ensurePdfLoaded();
  } catch (e) {
    pl.innerHTML = 'Не удалось загрузить PDF-движок. Проверьте соединение.';
    return;
  }

  // Сначала пробуем IndexedDB (оффлайн-книги — читаем из байтов)
  let bytes = null;
  let fromOffline = false;
  if (offlineBookIds.has(b.id)) {
    try {
      const blob = await offlineStorage.getFile(b.id, 'pdf');
      if (blob) {
        bytes = await blob.arrayBuffer();
        fromOffline = true;
      }
    } catch (e) {
      console.warn('Не удалось прочитать PDF из IndexedDB:', e);
    }
  }

  if (typeof pdfjsLib === 'undefined') {
    showToast('PDF-движок не загрузился. Проверьте интернет/доступ к CDN.');
    return;
  }

  // Если не оффлайн — грузим ПРОГРЕССИВНО по URL (pdf.js тянет страницы по частям,
  // первая страница появляется почти сразу, не дожидаясь всего файла).
  try {
    let loadingTask;
    if (fromOffline && bytes) {
      loadingTask = pdfjsLib.getDocument({ data: bytes });
    } else {
      if (!b.has_file) {
        pl.classList.remove('hidden');
        c.classList.add('hidden');
        generateDemoPdf(b);
        return;
      }
      const cfg = api.books.pdfStreamConfig(b.id);
      loadingTask = pdfjsLib.getDocument({
        url: cfg.url,
        httpHeaders: cfg.httpHeaders,
        withCredentials: cfg.withCredentials,
        rangeChunkSize: 1048576,       // 1 МБ на чанк — меньше round-trip'ов
        // true — качаем только то, что нужно показанным страницам.
        // При false pdf.js берёт первую страницу через Range, показывает
        // её, а потом фоном дотягивает файл целиком: для сканов на сотню
        // мегабайт это и есть «Загрузка книги… 0%» на несколько минут.
        disableAutoFetch: true,
        // Ключевое для больших книг: без этого pdf.js открывает полный поток
        // и тянет весь файл (144 МБ), несмотря на Range-поддержку сервера.
        disableStream: true,
        disableRange: false,
      });
    }

    // Прогресс загрузки: на медленной сети показываем проценты вместо
    // бесконечного спиннера.
    _pdfLoadingTask = loadingTask;
    loadingTask.onProgress = ({ loaded, total }) => {
      if (myToken !== _pdfLoadToken) return;   // загрузка устарела
      const box = document.getElementById('pdfPlaceholder');
      if (!box || box.classList.contains('hidden')) return;
      if (total && total > 0) {
        const pct = Math.min(99, Math.round(loaded / total * 100));
        box.innerHTML = loadingSpinnerHTML(`Загрузка книги… ${pct}%`);
      }
    };

    const loadedDoc = await loadingTask.promise;
    if (myToken !== _pdfLoadToken) return;   // пока грузили, открыли другую книгу
    pdfDoc = loadedDoc;

    pdfTotalPages = pdfDoc.numPages;
    const prevProgress = state.readingProgress[b.id];
    if (!prevProgress) {
      state.readingProgress[b.id] = { currentPage: 1, totalPages: pdfTotalPages, started: false };
    } else {
      // Если в базе осталось неверное число страниц (например, 10 от старого
      // аварийного фолбэка), чиним его: отправляем серверу реальное значение.
      const wasWrong = prevProgress.totalPages !== pdfTotalPages;
      prevProgress.totalPages = pdfTotalPages;
      if (wasWrong) {
        const page = Math.min(prevProgress.currentPage || 1, pdfTotalPages);
        api.library.updateProgress(b.id, page, pdfTotalPages)
          .catch(() => { /* не критично: поправится при следующем открытии */ });
      }
    }
    pdfCurrentPage = Math.min(state.readingProgress[b.id].currentPage || 1, pdfTotalPages);

    if (window._bookLoadHintTimer) { clearTimeout(window._bookLoadHintTimer); window._bookLoadHintTimer = null; }
    pl.classList.add('hidden');
    c.classList.remove('hidden');
    updatePageIndicator();
    
    // Ждём, пока canvas станет видимым
    setTimeout(async () => {
      await renderPdfPage(pdfCurrentPage);
    }, 100);
    
    if (fromOffline) showToast('Читаем из оффлайн-хранилища');
  } catch (err) {
    console.error('Ошибка рендеринга PDF:', err);
    showToast('Ошибка: ' + err.message);
    generateDemoPdf(b);
  }
}

function generateDemoPdf(b) {
  pdfTotalPages = state.readingProgress[b.id]?.totalPages || 10;
  pdfCurrentPage = Math.min(state.readingProgress[b.id]?.currentPage || 1, pdfTotalPages);
  updatePageIndicator();
  document.getElementById('pdfPlaceholder').innerHTML = `<div data-static-style="a239">${ICONS.bookCover}</div><p>${eh(b.title)}</p><p>Стр.${pdfCurrentPage}/${pdfTotalPages}</p>`;
  renderAnnotations();
}

async function renderPdfPage(pn) {
  if (!pdfDoc) return;

  // Защита от гонки при быстром листании: помечаем этот запрос токеном и
  // отменяем предыдущий незавершённый рендер (иначе два рендера в один canvas
  // накладываются → перевёрнутые/битые страницы).
  const myToken = ++_pdfRenderToken;
  if (_pdfRenderTask) {
    try { _pdfRenderTask.cancel(); } catch (e) {}
    _pdfRenderTask = null;
  }

  // При перерисовке страницы — снимаем подсветку поиска
  clearReaderSearchHighlights();

  const page = await pdfDoc.getPage(pn);
  // Если за время await пользователь пролистал дальше — прекращаем (наш рендер устарел)
  if (myToken !== _pdfRenderToken) return;
  const viewport1 = page.getViewport({ scale: 1 });

  const container = document.getElementById('pdfViewport');
  if (!container) return;

  // Иногда clientWidth ещё 0/крошечный (рендер до раскладки) — подстраховываемся
  // шириной окна, иначе страница выходит микроскопической в углу.
  let containerWidth = container.clientWidth;
  if (!containerWidth || containerWidth < 200) {
    containerWidth = Math.min(window.innerWidth - 32, 1100);
  }
  const isMobile = window.innerWidth < 700;
  // На ПК страница ~в 2 раза меньше прежнего (масштаб браузера 100%).
  let maxWidth;
  if (isMobile) {
    maxWidth = containerWidth;
  } else if (window.innerWidth >= 1600) {
    maxWidth = 650;
  } else if (window.innerWidth >= 1024) {
    maxWidth = 550;
  } else {
    maxWidth = 600;
  }
  let targetWidth = Math.min(containerWidth - (isMobile ? 0 : 24), maxWidth);
  // Множитель размера шрифта из настроек (90–130%)
  const fontScale = (parseInt(localStorage.getItem('aegis_reader_font') || '100', 10)) / 100;
  targetWidth = Math.min(targetWidth * fontScale, containerWidth - (isMobile ? 0 : 12));

  const dpr = window.devicePixelRatio || 1;
  const scale = targetWidth / viewport1.width;
  const viewport = page.getViewport({ scale });

  // Рендерим canvas
  const canvas = document.getElementById('pdfCanvas');
  canvas.width = viewport.width * dpr;
  canvas.height = viewport.height * dpr;
  canvas.style.width = targetWidth + 'px';
  canvas.style.height = 'auto';
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';
  // Первая страница (обложка) не инвертируется в тёмной теме
  if (pn === 1) canvas.classList.add('no-invert');
  else canvas.classList.remove('no-invert');

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Запускаем рендер как отменяемую задачу. Если во время рендера пользователь
  // пролистнёт дальше — задача будет отменена (cancel выше), и мы выйдем.
  const renderTask = page.render({
    canvasContext: ctx,
    viewport: viewport,
  });
  _pdfRenderTask = renderTask;
  try {
    await renderTask.promise;
  } catch (err) {
    // RenderingCancelledException — это нормально (пользователь пролистнул дальше)
    if (err && err.name === 'RenderingCancelledException') return;
    throw err;
  }
  if (_pdfRenderTask === renderTask) _pdfRenderTask = null;
  // Наш рендер устарел (пролистали дальше) — не трогаем text layer
  if (myToken !== _pdfRenderToken) return;

  // Text layer для выделения (правильный API для PDF.js 3.x)
  const textLayerDiv = document.getElementById('pdfTextLayer');
  if (textLayerDiv) {
    textLayerDiv.innerHTML = '';
    const cssHeight = viewport.height;
    // Читаем offsetLeft/Top ПОСЛЕ применения стилей canvas (через rAF),
    // иначе margin:0 auto ещё не применён и слой уезжает.
    await new Promise(r => requestAnimationFrame(r));
    textLayerDiv.style.position = 'absolute';
    textLayerDiv.style.left = canvas.offsetLeft + 'px';
    textLayerDiv.style.top = canvas.offsetTop + 'px';
    textLayerDiv.style.transform = 'none';
    textLayerDiv.style.width = targetWidth + 'px';
    textLayerDiv.style.height = cssHeight + 'px';
    textLayerDiv.style.pointerEvents = 'auto';
    textLayerDiv.style.setProperty('--scale-factor', String(viewport.scale));

    try {
      const textContent = await page.getTextContent();
      // Сохраняем плоский текст страницы — ассистент сможет отвечать по нему
      try {
        readerCurrentPageText = (textContent.items || []).map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
      } catch (_) { readerCurrentPageText = ''; }
      pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport: viewport,
        textDivs: [],
      });
    } catch (e) {
      console.warn('Text layer error:', e);
    }
  }

  // Восстанавливаем аннотации
  if (typeof renderAnnotations === 'function') {
    await renderAnnotations();
  }
  // Если активен поиск — подсвечиваем совпадения на этой странице
  if (readerSearchActive && readerSearchResults.length > 0) {
    const currentResult = readerSearchResults[readerSearchIndex];
    if (currentResult && currentResult.page === pdfCurrentPage) {
      setTimeout(() => highlightPdfMatchOnPage(currentResult), 100);
    }
  }
}

// ========== RESIZE HANDLER ==========
let resizeTimer = null;
window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.currentScreen === 'reader' && !isEpubMode && pdfDoc) {
      renderPdfPage(pdfCurrentPage);
    }
  }, 300);
});
loadOfflineBookIds();

// ========== ОНБОРДИНГ-ТЕСТ ==========
let onboardingState = {
  questions: [],
  topicNames: {},
  answers: {},        // {qid: index}
  currentIndex: 0,
};

// ========== ВЫБОР УРОВНЯ (новый стартовый экран онбординга) ==========

const LEVEL_CHOICES = [
  {
    code: 'gate_guardian',
    name: 'Gate Guardian',
    description: 'Я знаю, где вход, и буду стоять насмерть. Но если атака сложнее фишинга — зову старших.',
  },
  {
    code: 'scout',
    name: 'Scout',
    description: 'Я вижу дыры, которые другие не замечают. Иногда случайно ломаю свои же сервисы, но это часть обучения.',
  },
  {
    code: 'stronghold',
    name: 'Stronghold',
    description: 'Меня не возьмёшь лобовой атакой. Придётся искать уязвимость нулевого дня — а я её уже закрыл на прошлой неделе.',
  },
  {
    code: 'shadow_architect',
    name: 'Shadow Architect',
    description: 'Я не реагирую на угрозы — я проектирую среду, где атака обречена с самого начала. Хакеры даже не узнают, что их уже обманули.',
  },
  {
    code: 'abyss_warden',
    name: 'Abyss Warden',
    description: 'Я не просто защищаю — я определяю, что такое безопасность. Если я чего-то не знаю, этого ещё не существует.',
  },
];

function renderLevelChoices() {
  const container = document.getElementById('levelChoiceList');
  if (!container) return;

  const cards = LEVEL_CHOICES.map((lvl, idx) => {
    const info = getCyberLevelInfo(lvl.code);
    return `
      <button data-onclick="selectLevelSelf('${lvl.code}')" class="level-choice-card" data-static-style="a566">
        <div data-static-style="a567">${info.icon}</div>
        <div data-static-style="a004">
          <div data-static-style="a568">${idx + 1}. ${eh(lvl.name)}</div>
          <div data-static-style="a392">${eh(lvl.description)}</div>
        </div>
      </button>
    `;
  }).join('');

  const testCard = `
    <button data-onclick="startOnboardingQuiz()" class="level-choice-card level-choice-test" data-static-style="a569">
      <div data-static-style="a570">${ICONS.target}</div>
      <div data-static-style="a004">
        <div data-static-style="a571">6. Хочу узнать (тест)</div>
        <div data-static-style="a572">20 вопросов по 5 темам кибербезопасности. ~7 минут.</div>
      </div>
    </button>
  `;

  container.innerHTML = cards + testCard;
}

async function selectLevelSelf(levelCode) {
  try {
    await api.onboarding.selfAssess(levelCode);
    // Обновляем currentUser
    if (state.currentUser) state.currentUser.cyber_level = levelCode;
    showToast('Уровень установлен. Можешь начинать читать!');
    closeOnboarding();
  } catch (e) {
    console.error(e);
    showToast('Не удалось сохранить уровень: ' + (e.detail || e.message));
  }
}

function startOnboardingQuiz() {
  // Скрыть welcome, показать quiz
  document.getElementById('onboardingWelcome').classList.add('hidden');
  document.getElementById('onboardingQuiz').classList.remove('hidden');
  // Сбросить состояние теста и стартовать
  startOnboarding();
}

function closeOnboarding() {
  navigateTo('home');
  // Дополнительные действия при закрытии (если нужно)
}

async function maybeShowOnboarding() {
 // Рендерим карточки выбора уровня
  renderLevelChoices();
  // Показывать только если cyber_level не определён (т.е. тест ещё не прошли)
  if (!state.currentUser) return false;
  if (state.currentUser.cyber_level) return false;
  navigateTo('onboarding');
  renderLevelChoices();
  return true;
}

function skipOnboarding() {
  // Если аккаунт не одобрен админом — нельзя попасть в библиотеку
  if (state.currentUser && state.currentUser.is_approved === false) {
    showPendingApprovalScreen();
    return;
  }
  navigateTo('home');
}

async function startOnboarding() {
  try {
    const data = await api.onboarding.getQuiz();
    onboardingState.questions = data.questions;
    onboardingState.topicNames = data.topic_names;
    onboardingState.answers = {};
    onboardingState.currentIndex = 0;
    document.getElementById('onboardingWelcome').classList.add('hidden');
    document.getElementById('onboardingQuiz').classList.remove('hidden');
    document.getElementById('onboardingTotal').textContent = data.questions.length;
    renderOnboardingQuestion();
  } catch (err) {
    console.error('Не удалось загрузить тест:', err);
    showToast('Не удалось загрузить тест');
  }
}

function renderOnboardingQuestion() {
  const q = onboardingState.questions[onboardingState.currentIndex];
  if (!q) return;
  const total = onboardingState.questions.length;
  const idx = onboardingState.currentIndex;

  document.getElementById('onboardingCurrent').textContent = idx + 1;
  document.getElementById('onboardingProgressFill').style.width = ((idx + 1) / total * 100) + '%';
  document.getElementById('onboardingTopicBadge').textContent = onboardingState.topicNames[q.topic] || q.topic;
  document.getElementById('onboardingQuestion').textContent = q.question;

  const selected = onboardingState.answers[q.id];
  document.getElementById('onboardingOptions').innerHTML = q.options.map((opt, i) => {
    const isSelected = selected === i;
    return `<button class="onboarding-option${isSelected ? ' selected' : ''}" data-onclick="selectOnboardingAnswer(${i})">
      <span class="onboarding-option-letter">${'ABCD'[i]}</span>
      <span>${eh(opt)}</span>
    </button>`;
  }).join('');

  // Управление кнопками
  document.getElementById('btnOnboardingPrev').disabled = (idx === 0);
  const isLast = idx === total - 1;
  const nextBtn = document.getElementById('btnOnboardingNext');
  const finishBtn = document.getElementById('btnOnboardingFinish');
  if (isLast) {
    nextBtn.classList.add('hidden');
    finishBtn.classList.remove('hidden');
  } else {
    nextBtn.classList.remove('hidden');
    finishBtn.classList.add('hidden');
  }
  // Кнопки далее/завершить активны только если есть ответ
  const hasAnswer = selected !== undefined;
  nextBtn.disabled = !hasAnswer;
  finishBtn.disabled = !hasAnswer;
}

function selectOnboardingAnswer(idx) {
  const q = onboardingState.questions[onboardingState.currentIndex];
  onboardingState.answers[q.id] = idx;
  renderOnboardingQuestion();
}

function nextOnboardingQuestion() {
  if (onboardingState.currentIndex < onboardingState.questions.length - 1) {
    onboardingState.currentIndex++;
    renderOnboardingQuestion();
  }
}

function prevOnboardingQuestion() {
  if (onboardingState.currentIndex > 0) {
    onboardingState.currentIndex--;
    renderOnboardingQuestion();
  }
}

async function finishOnboarding() {
  // Проверяем что на все вопросы есть ответы
  const total = onboardingState.questions.length;
  const answered = Object.keys(onboardingState.answers).length;
  if (answered < total) {
    showToast(`Ответьте на все вопросы (${answered}/${total})`);
    return;
  }

  const finishBtn = document.getElementById('btnOnboardingFinish');
  finishBtn.disabled = true;
  finishBtn.textContent = 'Отправка...';

  try {
    const result = await api.onboarding.submit(onboardingState.answers);
    // Обновляем currentUser
    state.currentUser.cyber_level = result.cyber_level;
    state.currentUser.topic_scores = {};
    result.topic_scores.forEach(t => { state.currentUser.topic_scores[t.topic] = t.percentage; });
    state.currentUser.level_assessed_at = result.assessed_at;

    // Показываем результат
    document.getElementById('onboardingQuiz').classList.add('hidden');
    document.getElementById('onboardingResult').classList.remove('hidden');
    renderOnboardingResult(result);
  } catch (err) {
    console.error('Ошибка отправки теста:', err);
    showToast('Не удалось отправить ответы');
    finishBtn.disabled = false;
    finishBtn.textContent = 'Завершить';
  }
}

function renderOnboardingResult(result) {
  const c = document.getElementById('onboardingResultContent');
  const info = getCyberLevelInfo(result.cyber_level);

  // Темы с цветами по силе
  const topicsHtml = result.topic_scores.map(t => {
    let cls = 'weak';
    if (t.percentage >= 70) cls = 'strong';
    else if (t.percentage >= 50) cls = 'medium';
    return `<div class="onboarding-topic-row">
      <div class="onboarding-topic-name">${eh(t.topic_name)}</div>
      <div class="onboarding-topic-bar">
        <div class="onboarding-topic-fill ${cls}" style="width:${t.percentage}%;"></div>
      </div>
      <div class="onboarding-topic-pct">${t.percentage}%</div>
    </div>`;
  }).join('');

  // Слабые темы
  const weakHtml = result.weak_topics.length > 0 ? `
    <div class="onboarding-weak-list">
      <h4 data-static-style="a573">${ICONS.warningTriangle} Стоит подтянуть</h4>
      <p>${result.weak_topics.map(t => eh(result.topic_scores.find(s => s.topic === t)?.topic_name || t)).join(', ')}</p>
    </div>
  ` : '';

  c.innerHTML = `
    <div data-static-style="a574">${info.icon.replace('width="22"','width="40"').replace('height="22"','height="40"').replace('width="20"','width="40"').replace('height="20"','height="40"')}</div>
    <div class="onboarding-result-level gradient-text">${eh(result.level_name)}</div>
    <div class="onboarding-result-percentage">${result.overall_percentage}% правильных</div>
    <div class="onboarding-result-description">${eh(result.level_description)}</div>
    <div class="onboarding-topics">
      <h3>По темам</h3>
      ${topicsHtml}
    </div>
    ${weakHtml}
    <button class="btn-onboarding-finish-result" data-onclick="finishOnboardingNav()">Начать обучение</button>
  `;
}

function finishOnboardingNav() {
  // Если пользователь ещё не одобрен — возвращаем на экран ожидания, не пускаем в библиотеку
  if (state.currentUser && state.currentUser.is_approved === false) {
    showPendingApprovalScreen();
  } else {
    navigateTo('home');
  }
}
// ========== ИНФА ОБ УРОВНЕ + МОДАЛКА «МОЙ УРОВЕНЬ» ==========
function getCyberLevelInfo(code) {
  const map = {
    gate_guardian: {
      icon: ICONS.levelGateGuardian,
      name: 'Gate Guardian',
      description: 'Я знаю, где вход, и буду стоять насмерть. Но если атака сложнее фишинга — зову старших.',
    },
    scout: {
      icon: ICONS.levelScout,
      name: 'Scout',
      description: 'Я вижу дыры, которые другие не замечают. Иногда случайно ломаю свои же сервисы, но это часть обучения.',
    },
    stronghold: {
      icon: ICONS.levelStronghold,
      name: 'Stronghold',
      description: 'Меня не возьмёшь лобовой атакой. Придётся искать уязвимость нулевого дня — а я её уже закрыл на прошлой неделе.',
    },
    shadow_architect: {
      icon: ICONS.levelShadowArchitect,
      name: 'Shadow Architect',
      description: 'Я не реагирую на угрозы — я проектирую среду, где атака обречена с самого начала. Хакеры даже не узнают, что их уже обманули.',
    },
    abyss_warden: {
      icon: ICONS.levelAbyssWarden,
      name: 'Abyss Warden',
      description: 'Я не просто защищаю — я определяю, что такое безопасность. Если я чего-то не знаю, этого ещё не существует.',
    },
  };
  return map[code] || { icon: ICONS.target, name: code, description: '' };
}

async function openCyberLevelModal() {
  // Тянем актуальный результат с бэка (на случай если данные несвежие)
  let result;
  try {
    result = await api.onboarding.getResult();
  } catch (err) {
    showToast('Не удалось загрузить результаты');
    return;
  }
  if (!result) {
    showToast('Сначала пройди тест уровня');
    return;
  }

  // Используем тот же экран результата онбординга
  navigateTo('onboarding');
  document.getElementById('onboardingWelcome').classList.add('hidden');
  document.getElementById('onboardingQuiz').classList.add('hidden');
  document.getElementById('onboardingResult').classList.remove('hidden');

  // Особенность: тут хотим кнопку «Назад в профиль» вместо «Начать обучение»,
  // и опционально — «Пройти тест заново»
  renderCyberLevelDetail(result);
}

function renderCyberLevelDetail(result) {
  const c = document.getElementById('onboardingResultContent');
  const info = getCyberLevelInfo(result.cyber_level);

  const topicsHtml = result.topic_scores.map(t => {
    let cls = 'weak';
    if (t.percentage >= 70) cls = 'strong';
    else if (t.percentage >= 50) cls = 'medium';
    return `<div class="onboarding-topic-row">
      <div class="onboarding-topic-name">${eh(t.topic_name)}</div>
      <div class="onboarding-topic-bar">
        <div class="onboarding-topic-fill ${cls}" style="width:${t.percentage}%;"></div>
      </div>
      <div class="onboarding-topic-pct">${t.percentage}%</div>
    </div>`;
  }).join('');

  const weakHtml = result.weak_topics.length > 0 ? `
    <div class="onboarding-weak-list">
      <h4 data-static-style="a573">${ICONS.warningTriangle} Стоит подтянуть</h4>
      <p>${result.weak_topics.map(t => eh(result.topic_scores.find(s => s.topic === t)?.topic_name || t)).join(', ')}</p>
    </div>
  ` : '';

  const dateStr = result.assessed_at ? new Date(result.assessed_at).toLocaleDateString('ru-RU') : '';

  c.innerHTML = `
    <div data-static-style="a574">${info.icon.replace('width="22"','width="40"').replace('height="22"','height="40"').replace('width="20"','width="40"').replace('height="20"','height="40"')}</div>
    <div class="onboarding-result-level gradient-text">${eh(info.name)}</div>
    <div class="onboarding-result-percentage">${result.overall_percentage}% правильных</div>
    <div class="onboarding-result-description">${eh(info.description)}</div>
    ${dateStr ? `<div data-static-style="a575">Тест пройден: ${dateStr}</div>` : ''}
    <div class="onboarding-topics">
      <h3>По темам</h3>
      ${topicsHtml}
    </div>
    ${weakHtml}
    <div data-static-style="a576">
      <button class="btn-onboarding-skip" data-onclick="navigateTo('profile')" data-static-style="a004">Назад в профиль</button>
      <button class="btn-onboarding-start" data-onclick="restartOnboarding()" data-static-style="a004">Пройти заново</button>
    </div>
  `;
}

function restartOnboarding() {
  if (!confirm('Пройти тест заново? Текущий результат будет заменён новым после прохождения.')) return;
  // Сбрасываем UI и стартуем тест заново
  document.getElementById('onboardingResult').classList.add('hidden');
  document.getElementById('onboardingWelcome').classList.add('hidden');
  document.getElementById('onboardingQuiz').classList.remove('hidden');
  startOnboarding();
}
// ========== INIT ==========
// Заполнение SVG-иконок в HTML-шаблонах
(function fillStaticIcons() {
  const onbList = document.getElementById('onbIconList');
  const onbClock = document.getElementById('onbIconClock');
  const onbTarget = document.getElementById('onbIconTarget');
  if (onbList) onbList.innerHTML = ICONS.list;
  if (onbClock) onbClock.innerHTML = ICONS.clock;
  if (onbTarget) onbTarget.innerHTML = ICONS.target;
})();
// Удаляем локальные данные снятой с эксплуатации биометрической блокировки.
for (const key of ['aegis_biometric_enabled', 'aegis_biometric_cred', 'aegis_biometric_declined']) {
  try { localStorage.removeItem(key); } catch (_) { /* Очистка устаревших данных необязательна. */ }
}
tryAutoLogin().then(ok => {
  navigateTo(ok ? 'home' : 'auth');
});


let orientationChangeTimer = null;

window.addEventListener('resize', () => {
  if (orientationChangeTimer) clearTimeout(orientationChangeTimer);
  orientationChangeTimer = setTimeout(() => {
    // Если AR активен и показана схема Kill Chain
    if (arActive && arCurrentScheme === 'killchain') {
      const container = document.getElementById('arSchemeContainer');
      if (container && container.innerHTML) {
        // Перерендериваем схему с новой ориентацией
        const wasStageOpen = arSelectedStage !== null;
        const currentStageId = arSelectedStage;
        
        renderKillChainScheme();
        
        // Если был открыт этап, восстанавливаем его
        if (wasStageOpen && currentStageId) {
          setTimeout(() => selectKillChainStage(currentStageId), 100);
        }
      }
    }
  }, 300);
});

// Инициализация обработчиков для кнопок добавления категорий
function initCategoryButtons() {
  const addCategoryBtn = document.getElementById('addNewCategoryBtn');
  if (addCategoryBtn) {
    addCategoryBtn.onclick = function() {
      const input = document.getElementById('newCategoryNew');
      const newCat = input.value.trim();
      if (!newCat) {
        showToast('Введите название категории');
        return;
      }
      if (newCat.length > 64) {
        showToast('Категория: максимум 64 символа');
        return;
      }
      
      const select = document.getElementById('newCategorySelect');
      const exists = Array.from(select.options).some(opt => opt.value.toLowerCase() === newCat.toLowerCase());
      if (exists) {
        showToast('Такая категория уже существует');
        input.value = '';
        return;
      }
      
      const option = document.createElement('option');
      option.value = newCat;
      option.textContent = newCat;
      select.appendChild(option);
      option.selected = true;
      input.value = '';
      showToast('Категория добавлена');
    };
  }
  
  const addAdminCategoryBtn = document.getElementById('addAdminCategoryBtn');
  if (addAdminCategoryBtn) {
    addAdminCategoryBtn.onclick = function() {
      const input = document.getElementById('adminEditCategoryNew');
      const newCat = input.value.trim();
      if (!newCat) {
        showToast('Введите название категории');
        return;
      }
      if (newCat.length > 64) {
        showToast('Категория: максимум 64 символа');
        return;
      }
      
      const select = document.getElementById('adminEditCategorySelect');
      const exists = Array.from(select.options).some(opt => opt.value.toLowerCase() === newCat.toLowerCase());
      if (exists) {
        showToast('Такая категория уже существует');
        input.value = '';
        return;
      }
      
      const option = document.createElement('option');
      option.value = newCat;
      option.textContent = newCat;
      select.appendChild(option);
      option.selected = true;
      input.value = '';
      showToast('Категория добавлена');
    };
  }
}

// Вызвать после загрузки
setTimeout(initCategoryButtons, 500);

window.LEVEL_CHOICES = LEVEL_CHOICES;
window.openARSchemeMenu = openARSchemeMenu;
window.closeARSchemeMenu = closeARSchemeMenu;
window.openARWithScheme = openARWithScheme;
window.closeAR = closeAR;
window.switchARCamera = switchARCamera;
window.selectKillChainStage = selectKillChainStage;
window.closeKillChainStage = closeKillChainStage;
window.prevKillChainStage = prevKillChainStage;
window.nextKillChainStage = nextKillChainStage;
window.openBookFromAR = openBookFromAR;
window.toggleStageDetailsPanel = toggleStageDetailsPanel;
