// Administrative AI generation and search-index maintenance operations.

function collectArTopics() {
  // Собираем уникальные relatedCategory из всех AR-схем
  const topics = new Set();
  try {
    Object.values(AR_SCHEMES || {}).forEach(scheme => {
      const stages = (scheme && scheme.stages) || [];
      stages.forEach(st => { if (st.relatedCategory) topics.add(st.relatedCategory); });
    });
  } catch (_) {}
  return Array.from(topics);
}

async function aiMatchArBooksUI() {
  const topics = collectArTopics();
  if (!topics.length) { showToast('Не удалось собрать темы AR-схем'); return; }
  if (!confirm(`ИИ проанализирует книги и подберёт подходящие к ${topics.length} темам AR-схем. Это может занять пару минут. Продолжить?`)) return;
  showToast('ИИ подбирает книги для AR-тем, подождите…');
  try {
    const res = await api.library.aiMatchArTopics(topics);
    showToast(`Готово: обновлено книг ${res.updated} из ${res.total}`);
    // обновим книги в состоянии, чтобы рекомендации в AR появились
    try { await loadBooksFromApi(); } catch (_) {}
  } catch (e) {
    const msg = (e && (e.detail || (e.body && e.body.detail))) || 'Не удалось подобрать книги';
    showToast(msg);
  }
}

async function generateMissingCoversUI() {
  const candidates = (state.books || []).filter(b => !b.has_cover && (b.has_pdf || b.format !== 'epub'));
  if (!candidates.length) {
    showToast('Все книги уже с обложками');
    return;
  }
  showConfirmModal({
    title: 'Создать обложки?',
    message: `Книг без обложки: ${candidates.length}. Для каждой будет скачан PDF и создана обложка из первой страницы. Это может занять время.`,
    confirmText: 'Создать',
    cancelText: 'Отмена',
    onConfirm: async () => {
      let done = 0, failed = 0;
      try {
        await ensurePdfLoaded();
      } catch (e) {
        showToast('Не удалось загрузить PDF-движок');
        return;
      }
      showToast('Создание обложек запущено…');
      for (const b of candidates) {
        try {
          const bytes = await api.books.fetchPdfBytes(b.id);
          const blob = await generateCoverFromPdf(new Blob([bytes], { type: 'application/pdf' }));
          if (blob) {
            const f = new File([blob], 'cover.jpg', { type: 'image/jpeg' });
            await api.books.uploadCover(b.id, f);
            done++;
          } else {
            failed++;
          }
        } catch (e) {
          failed++;
          console.warn('Обложка не создана для книги', b.id, e);
        }
      }
      showToast(`Обложки созданы: ${done}` + (failed ? ` · не удалось: ${failed}` : ''));
      await loadBooksFromApi();
      if (typeof renderAdminPanel === 'function') renderAdminPanel();
    },
  });
}

let descriptionStatusTimer = null;
let descriptionJobSeenActive = false;

function descriptionJobSummary(job) {
  if (!job) return 'ИИ-описания';
  if (job.status === 'queued') return `ИИ-описания · в очереди (${job.total_books})`;
  if (job.status === 'running') {
    return `ИИ-описания · ${job.processed_books}/${job.total_books}`;
  }
  return 'ИИ-описания';
}

async function refreshDescriptionGenerationStatus() {
  if (descriptionStatusTimer) {
    clearTimeout(descriptionStatusTimer);
    descriptionStatusTimer = null;
  }
  const button = document.getElementById('adminDescriptionsBtn');
  if (!button) return;
  try {
    const job = await api.library.latestDescriptionGeneration();
    const active = job && ['queued', 'running'].includes(job.status);
    button.textContent = descriptionJobSummary(job);
    button.disabled = Boolean(active);
    if (job) {
      button.title = active
        ? `Фоновая задача: обработано ${job.processed_books} из ${job.total_books}`
        : `Последний запуск: создано ${job.succeeded_books}, ошибок ${job.failed_books}`;
    }
    if (active) {
      descriptionJobSeenActive = true;
      descriptionStatusTimer = setTimeout(refreshDescriptionGenerationStatus, 3000);
    } else if (descriptionJobSeenActive && job) {
      descriptionJobSeenActive = false;
      showToast(
        `ИИ-описания готовы: ${job.succeeded_books}`
        + (job.failed_books ? ` · ошибок: ${job.failed_books}` : '')
      );
      await loadBooksFromApi();
      const tbody = document.getElementById('adminBooksTableBody');
      if (tbody) renderAdminBookRows(tbody, state.books);
    }
  } catch (error) {
    button.disabled = false;
    button.title = 'Не удалось получить статус фоновой задачи';
  }
}

async function generateMissingDescriptionsUI() {
  const candidates = (state.books || []).filter(book =>
    !String(book.description || book.desc || '').trim()
  );
  if (!candidates.length) {
    showToast('У всех книг уже есть описание');
    return;
  }
  showConfirmModal({
    title: 'Создать ИИ-описания?',
    message: `Книг без описания: ${candidates.length}. Книги уже загружены, поэтому операция не задерживает массовую загрузку.`,
    confirmText: 'Создать',
    cancelText: 'Отмена',
    onConfirm: async () => {
      try {
        const result = await api.library.startDescriptionGeneration();
        if (result.reason === 'no_missing') {
          showToast('У всех книг уже есть описание');
          return;
        }
        if (result.reason === 'already_running') {
          showToast('Создание ИИ-описаний уже выполняется в фоне');
        } else {
          showToast(`Создание ${result.job.total_books} описаний запущено в фоне`);
        }
        descriptionJobSeenActive = true;
        await refreshDescriptionGenerationStatus();
      } catch (error) {
        showToast('Не удалось запустить ИИ-описания: ' + (error.detail || error.message));
      }
    },
  });
}

async function regenerateAllQuizzesUI() {
  showConfirmModal({
    title: 'Перегенерировать все тесты?',
    message: 'Тесты всех книг будут сброшены и пересозданы заново (по 15 вопросов) при следующем открытии теста. Прежние вопросы удаляются, но пройденные попытки сохраняются.',
    confirmText: 'Перегенерировать',
    cancelText: 'Отмена',
    danger: true,
    onConfirm: async () => {
      try {
        const res = await api.library.regenerateAllQuizzes();
        const n = res && typeof res.books_cleared === 'number' ? ` (${res.books_cleared} кн.)` : '';
        showToast('Тесты сброшены' + n + '. Новые соберутся при открытии.');
      } catch (e) {
        showToast(e && e.detail ? e.detail : 'Ошибка перегенерации тестов');
      }
    },
  });
}

async function reindexAllBooksUI() {
  showConfirmModal({
    title: 'Переиндексировать все книги?',    message: 'Будет извлечён текст из всех PDF для полнотекстового поиска. Индексация идёт в фоне — можно продолжать работу.',
    confirmText: 'Запустить',
    cancelText: 'Отмена',
    onConfirm: async () => {
      try {
        const res = await api.library.reindexAllBooks();
        if (res.started === false && res.reason === 'already_running') {
          showToast('Индексация уже идёт');
        } else {
          showToast('Индексация запущена');
        }
        showReindexProgress();
      } catch (e) {
        showToast(e && e.detail ? e.detail : 'Ошибка запуска индексации');
      }
    },
  });
}

function showReindexProgress() {
  const ex = document.getElementById('reindexProgressModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'reindexProgressModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  replaceAdminStaticMarkup(m, `<div data-static-style="a198">
    <div data-static-style="a126">
      <h3 data-static-style="a127">Индексация поиска</h3>
      <button data-onclick="stopReindexPolling();document.getElementById('reindexProgressModal').remove()" data-static-style="a128">✕</button>
    </div>
    <div id="reindexProgressBody">
      <div data-static-style="a199">Запуск…</div>
      <div data-static-style="a200">
        <div id="reindexBar" data-static-style="a201"></div>
      </div>
    </div>
    <div data-static-style="a202">Можно закрыть это окно — индексация продолжится в фоне.</div>
  </div>`);
  m.onclick = (e) => { if (e.target === m) { stopReindexPolling(); m.remove(); } };
  document.body.appendChild(m);
  startReindexPolling();
}

let _reindexPollTimer = null;
function stopReindexPolling() {
  if (_reindexPollTimer) { clearInterval(_reindexPollTimer); _reindexPollTimer = null; }
}
function renderReindexResult(container, status) {
  const result = document.createElement('div');
  result.setAttribute('data-static-style', 'a203');
  const errors = status.errors ? `, ошибок: ${status.errors}` : '';
  result.textContent = `✓ Готово: ${status.done} книг, ${status.indexed_pages} страниц${errors}`;
  container.replaceChildren(result);
}

function startReindexPolling() {
  stopReindexPolling();
  const poll = async () => {
    try {
      const s = await api.library.reindexStatus();
      const body = document.getElementById('reindexProgressBody');
      if (!body) { stopReindexPolling(); return; }
      const bar = document.getElementById('reindexBar');
      if (bar) bar.style.width = (s.percent || 0) + '%';
      if (s.finished) {
        stopReindexPolling();
        renderReindexResult(body, s);
      } else if (s.running) {
        body.querySelector('div').textContent = `Обработано ${s.done} из ${s.total} книг (${s.percent}%)`;
      }
    } catch (e) {
      stopReindexPolling();
    }
  };
  poll();
  _reindexPollTimer = setInterval(poll, 1500);
}

// ========== ADD BOOK MODAL ==========
