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
