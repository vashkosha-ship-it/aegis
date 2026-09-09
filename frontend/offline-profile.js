// Офлайн-раздел профиля: квота хранилища и скачанные книги.
function formatBytes(bytes) {
  if (!bytes) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return value.toFixed(value < 10 ? 1 : 0) + ' ' + units[i];
}

async function renderOfflineBooks() {
  const container = document.getElementById('offlineBooksSection');
  if (!container) return;
  if (!state.currentUser) { container.innerHTML = ''; return; }

  let books = [];
  try {
    books = await offlineStorage.listAll();
  } catch (e) {
    console.error('Ошибка чтения IndexedDB:', e);
    container.innerHTML = '<div data-static-style="a334">Не удалось прочитать оффлайн-хранилище</div>';
    return;
  }

  const quota = await offlineStorage.getQuotaEstimate();
  let quotaHtml = '';
  if (quota) {
    const usagePct = quota.quota > 0 ? (quota.usage / quota.quota * 100) : 0;
    const isWarning = usagePct > 80;
    quotaHtml = `
      <div data-static-style="a335">
        <div data-static-style="a336">
          <span>Использовано: ${formatBytes(quota.usage)}</span>
          <span>Доступно: ${formatBytes(quota.quota)}</span>
        </div>
        <div data-static-style="a337">
          <div style="height:100%;width:${Math.min(usagePct, 100)}%;background:${isWarning ? '#f59e0b' : 'var(--accent-gradient)'};transition:width 0.5s;"></div>
        </div>
        ${isWarning ? '<div data-static-style="a338">Хранилище почти заполнено</div>' : ''}
      </div>
    `;
  }

  if (books.length === 0) {
    container.innerHTML = `
      ${quotaHtml}
      <div data-static-style="a339">
        <div data-static-style="a340">${ICONS.cloudDownload}</div>
        <p>Нет скачанных книг</p>
        <p data-static-style="a341">Откройте книгу и нажмите «Сохранить оффлайн», чтобы читать без интернета</p>
      </div>
    `;
    return;
  }

  const rowsHtml = books.map(b => {
    const dateSaved = new Date(b.savedAt).toLocaleDateString('ru-RU');
    return `
      <div class="settings-row" data-static-style="a342">
        <div data-static-style="a015">
          <div data-static-style="a343">${eh(b.title)}</div>
          <div data-static-style="a344">
            ${eh(b.author)} • ${(b.file_format || 'pdf').toUpperCase()} • Сохранено ${dateSaved}
          </div>
        </div>
        <div data-static-style="a194">
          <button class="btn-sm" data-onclick="openBookDetail(${b.id})" title="Открыть">${ICONS.eye}</button>
          <button class="btn-sm danger" data-onclick="removeBookOffline(${b.id})" title="Удалить">${ICONS.trash}</button>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = quotaHtml + rowsHtml;
}
