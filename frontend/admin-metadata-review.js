'use strict';

// Админка → Книги → «Названия и теги»: фоновая проверка карточек всех книг.
// ИИ читает начало каждой книги и исправляет название и автора (имя файла,
// транслит, «Admin» из свойств PDF), а книгам без тегов подбирает темы из
// существующих категорий. Каждая правка сохраняется со старыми значениями —
// их видно в окне «Что изменилось».

let metadataStatusTimer = null;
let metadataJobSeenActive = false;

function metadataJobSummary(job) {
  if (!job) return 'Названия и теги';
  if (job.status === 'queued') return `Названия и теги · в очереди (${job.total_books})`;
  if (job.status === 'running') return `Названия и теги · ${job.processed_books}/${job.total_books}`;
  return 'Названия и теги';
}

async function refreshMetadataReviewStatus() {
  if (metadataStatusTimer) {
    clearTimeout(metadataStatusTimer);
    metadataStatusTimer = null;
  }
  const button = document.getElementById('adminMetadataBtn');
  if (!button) return;
  try {
    const job = await api.library.latestMetadataReview();
    const active = job && ['queued', 'running'].includes(job.status);
    button.textContent = metadataJobSummary(job);
    // Задачу в очереди можно поднять в начало — кнопка остаётся активной.
    button.disabled = Boolean(job && job.status === 'running');
    const changes = document.getElementById('adminMetadataChangesBtn');
    if (changes) changes.hidden = !job || !job.changed_books;
    if (job) {
      button.title = active
        ? `Проверено ${job.processed_books} из ${job.total_books}, исправлено ${job.changed_books}`
        : `Последний запуск: исправлено ${job.changed_books}, ошибок ${job.failed_books}`;
    }
    if (active) {
      metadataJobSeenActive = true;
      metadataStatusTimer = setTimeout(refreshMetadataReviewStatus, 5000);
    } else if (metadataJobSeenActive && job) {
      metadataJobSeenActive = false;
      showToast(
        `Карточки проверены: исправлено ${job.changed_books}`
        + (job.skipped_books ? ` · ждут индексации: ${job.skipped_books}` : '')
        + (job.failed_books ? ` · ошибок: ${job.failed_books}` : ''),
      );
      await loadBooksFromApi();
      if (typeof renderAdminBooksTable === 'function') renderAdminBooksTable();
    }
  } catch (_) {
    button.disabled = false;
  }
}

async function requeueMetadataReview() {
  try {
    const result = await api.library.startMetadataReview();
    showToast(result.reason === 'requeued'
      ? 'Проверка поставлена в начало очереди и скоро начнётся'
      : 'Проверка карточек уже идёт');
    metadataJobSeenActive = true;
    await refreshMetadataReviewStatus();
  } catch (error) {
    showToast('Не удалось перезапустить проверку: ' + (error.detail || error.message));
  }
}

async function startMetadataReviewUI() {
  let current = null;
  try { current = await api.library.latestMetadataReview(); } catch (_) { /* нет данных — обычный запуск */ }
  if (current && current.status === 'queued') {
    showConfirmModal({
      title: 'Проверка ещё не началась',
      message: 'Задача ждёт в очереди за индексацией книг. Поставить её в начало очереди? Индексация продолжится параллельно.',
      confirmText: 'В начало очереди',
      cancelText: 'Отмена',
      onConfirm: requeueMetadataReview,
    });
    return;
  }
  showConfirmModal({
    title: 'Проверить названия, авторов и теги?',
    message: `ИИ прочитает начало каждой из ${(state.books || []).length} книг и исправит название и автора, если они взяты из имени файла, написаны транслитом или указаны как «Admin». Книгам без тегов подберёт темы из существующих категорий. Теги, которые уже стоят, не меняются. Все правки сохраняются со старыми значениями. Займёт около часа, работает в фоне.`,
    confirmText: 'Запустить',
    cancelText: 'Отмена',
    onConfirm: async () => {
      try {
        const result = await api.library.startMetadataReview();
        if (result.reason === 'already_running') showToast('Проверка карточек уже идёт');
        else if (result.reason === 'no_books') showToast('В каталоге нет книг');
        else showToast(`Проверка ${result.job.total_books} карточек запущена в фоне`);
        metadataJobSeenActive = true;
        await refreshMetadataReviewStatus();
      } catch (error) {
        showToast('Не удалось запустить проверку: ' + (error.detail || error.message));
      }
    },
  });
}

function _metadataCell(row, text, className) {
  const cell = document.createElement('td');
  if (className) cell.className = className;
  cell.textContent = text;
  row.appendChild(cell);
}

async function openMetadataChanges() {
  let changes;
  try {
    changes = await api.library.metadataChanges(2000);
  } catch (error) {
    showToast('Не удалось загрузить изменения: ' + (error.detail || error.message));
    return;
  }
  document.getElementById('metadataChangesModal')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'metadataChangesModal';
  overlay.className = 'modal-overlay metadata-changes-overlay';
  const panel = document.createElement('div');
  panel.className = 'metadata-changes-panel';
  const header = document.createElement('div');
  header.className = 'metadata-changes-header';
  const title = document.createElement('h3');
  title.textContent = `Что изменилось (${changes.length})`;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn-back';
  close.textContent = '✕';
  close.setAttribute('aria-label', 'Закрыть');
  close.addEventListener('click', () => overlay.remove());
  header.append(title, close);

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Было', 'Стало', 'Теги'].forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    headRow.appendChild(th);
  });
  head.appendChild(headRow);
  const body = document.createElement('tbody');
  changes.forEach(change => {
    const row = document.createElement('tr');
    _metadataCell(row, `${change.old_title} — ${change.old_author}`, 'metadata-old');
    _metadataCell(row, `${change.new_title} — ${change.new_author}`, 'metadata-new');
    const tagsChanged = change.old_categories.join(', ') !== change.new_categories.join(', ');
    _metadataCell(row, tagsChanged ? change.new_categories.join(', ') : '—');
    body.appendChild(row);
  });
  table.append(head, body);
  wrap.appendChild(table);
  panel.append(header, wrap);
  overlay.appendChild(panel);
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}
