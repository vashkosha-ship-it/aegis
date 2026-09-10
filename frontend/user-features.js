// Gamification, full-text search, certificates, exports and book notes.
// Loaded as a classic script before app.js; public handlers intentionally remain global.

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
    replaceWithStaticText(l, 'Нет достижений', 'a099', 'span');
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
    if (!certs.length) { el.replaceChildren(); return; }
    el.innerHTML = certs.map(c => `
      <div data-static-style="a138">
        <div><span data-static-style="a139">${eh(c.category)}</span> <span data-static-style="a140">· ${c.score}%</span></div>
        <button data-onclick="downloadCertificate('${encodeURIComponent(c.category).replace(/'/g, '')}')" data-static-style="a141">Скачать PDF</button>
      </div>`).join('');
  } catch (_) { el.replaceChildren(); }
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
    <button data-onclick="answerCertQuestion(${i})" data-dynamic-style="${dynamicStyleToken`display:block;width:100%;text-align:left;margin-bottom:8px;padding:11px 14px;border-radius:8px;border:1px solid ${ex.answers[ex.index] === i ? 'var(--accent)' : 'var(--border)'};background:${ex.answers[ex.index] === i ? 'rgba(0,212,255,0.12)' : 'var(--bg-card)'};color:var(--text-primary);cursor:pointer;font-family:inherit;font-size:13px;`}">${eh(o)}</button>`).join('');
  const answered = ex.answers.filter(a => a >= 0).length;
  certModalShell(`
    <div data-static-style="a156">
      <span data-static-style="a155">Вопрос ${ex.index + 1} из ${total}</span>
      <button data-onclick="closeCertModal()" data-static-style="a157">✕</button>
    </div>
    <div data-static-style="a158"><div data-dynamic-style="${dynamicStyleToken`height:100%;width:${(answered / total * 100)}%;background:var(--accent);`}"></div></div>
    <div data-static-style="a159">${eh(q.question)}</div>
    ${opts}
    <div data-static-style="a160">
      <button data-onclick="certNav(-1)" ${ex.index === 0 ? 'disabled' : ''} data-dynamic-style="${dynamicStyleToken`flex:1;background:var(--bg-card);border:1px solid var(--border);color:var(--text-primary);padding:10px;border-radius:8px;cursor:pointer;font-family:inherit;opacity:${ex.index === 0 ? '0.4' : '1'};`}">← Назад</button>
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
      <div data-dynamic-style="${dynamicStyleToken`background:${bgTint};border:1px solid var(--border);border-left:3px solid ${stripColor};border-radius:8px;padding:12px;margin-bottom:8px;${cursor}`}" ${goAction}>
        <div data-static-style="a246">
          <div data-dynamic-style="${dynamicStyleToken`font-size:10px;color:${stripColor};font-weight:600;`}">
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
