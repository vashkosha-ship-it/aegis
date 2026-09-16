// Administrative bulk upload and review moderation UI.

let bulkUploadQueue = []; // [{file, status: 'pending'|'uploading'|'done'|'error', message}]
let bulkUploadInProgress = false;

// Рендер первой страницы PDF в JPEG-обложку (клиентская генерация)
async function generateCoverFromPdf(file) {
  try { await ensurePdfLoaded(); } catch (e) { console.warn('pdf.js не загружен:', e); return null; }
  if (typeof pdfjsLib === 'undefined') { console.warn('pdfjsLib недоступен после ensurePdfLoaded'); return null; }
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    // Масштаб под обложку ~800px по ширине
    const baseViewport = page.getViewport({ scale: 1 });
    const targetWidth = 800;
    const scale = targetWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    // белый фон (PDF может быть с прозрачностью)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    try { pdf.destroy(); } catch (_) {}
    return blob;
  } catch (e) {
    console.warn('generateCoverFromPdf error:', e);
    return null;
  }
}

function openBulkUploadModal() {
  document.getElementById('bulkUploadModal').classList.remove('hidden');
  bulkUploadQueue = [];
  renderBulkUploadList();

  // Привязываем обработчики (один раз)
  const zone = document.getElementById('bulkUploadDropZone');
  const input = document.getElementById('bulkUploadInput');

  if (!zone._handlersAttached) {
    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.style.borderColor = 'var(--accent)';
      zone.style.background = 'rgba(0,212,255,0.08)';
    });
    zone.addEventListener('dragleave', () => {
      zone.style.borderColor = 'var(--border)';
      zone.style.background = 'var(--bg-primary)';
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.style.borderColor = 'var(--border)';
      zone.style.background = 'var(--bg-primary)';
      addFilesToBulkQueue(e.dataTransfer.files);
    });

    input.addEventListener('change', (e) => {
      addFilesToBulkQueue(e.target.files);
      input.value = ''; // чтобы можно было выбрать те же файлы снова
    });

    zone._handlersAttached = true;
  }
}

function closeBulkUploadModal() {
  if (bulkUploadInProgress) {
    if (!confirm('Загрузка ещё идёт. Точно закрыть? Незавершённые книги останутся в БД.')) return;
  }
  document.getElementById('bulkUploadModal').classList.add('hidden');
  bulkUploadQueue = [];
  bulkUploadInProgress = false;
}

function addFilesToBulkQueue(fileList) {
  const allowed = ['pdf', 'epub'];
  const MAX_SIZE = 150 * 1024 * 1024;
  let skipped = 0;
  for (const file of fileList) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) { skipped++; continue; }
    if (file.size > MAX_SIZE) { skipped++; continue; }
    bulkUploadQueue.push({ file, status: 'pending', message: 'В очереди' });
  }
  if (skipped > 0) showToast(`Пропущено файлов: ${skipped} (неверный формат или > 150 МБ)`);
  renderBulkUploadList();
}

function renderBulkUploadList() {
  const listEl = document.getElementById('bulkUploadList');
  const actionsEl = document.getElementById('bulkUploadActions');
  const catPanel = document.getElementById('bulkUploadCategoryPanel');
  if (!listEl) return;

  if (bulkUploadQueue.length === 0) {
    listEl.replaceChildren();
    actionsEl.style.display = 'none';
    catPanel.style.display = 'none';
    return;
  }

  catPanel.style.display = 'block';
  actionsEl.style.display = 'flex';

  const statusIcon = { pending: '⏸', uploading: '⏳', done: '✓', error: '✕' };
  const statusColor = {
    pending: 'var(--text-muted)',
    uploading: 'var(--accent)',
    done: '#22c55e',
    error: '#ef4444',
  };
  const fragment = document.createDocumentFragment();
  bulkUploadQueue.forEach(item => {
    const row = document.createElement('div');
    row.setAttribute('data-static-style', 'a550');
    const icon = document.createElement('div');
    icon.setAttribute('data-dynamic-style', dynamicStyleToken`width:20px;text-align:center;color:${statusColor[item.status]};font-weight:700;flex-shrink:0;`);
    icon.textContent = statusIcon[item.status] || '';
    const filename = document.createElement('div');
    filename.setAttribute('data-static-style', 'a551');
    filename.title = String(item.file.name);
    filename.textContent = String(item.file.name);
    const message = document.createElement('div');
    message.setAttribute('data-dynamic-style', dynamicStyleToken`color:${statusColor[item.status]};font-size:10px;flex-shrink:0;`);
    message.textContent = String(item.message);
    row.append(icon, filename, message);
    fragment.appendChild(row);
  });
  listEl.replaceChildren(fragment);

  const done = bulkUploadQueue.filter(item => item.status === 'done').length;
  const errors = bulkUploadQueue.filter(item => item.status === 'error').length;
  const progressEl = document.getElementById('bulkUploadProgress');
  if (progressEl) progressEl.textContent = `${done} / ${bulkUploadQueue.length}` + (errors ? ` (ошибок: ${errors})` : '');
}

function clearBulkUploadList() {
  if (bulkUploadInProgress) { showToast('Идёт загрузка, нельзя очистить'); return; }
  bulkUploadQueue = [];
  renderBulkUploadList();
}

async function startBulkUpload() {
  if (bulkUploadInProgress) return;
  const pending = bulkUploadQueue.filter(i => i.status === 'pending');
  if (pending.length === 0) { showToast('Нет файлов для загрузки'); return; }

  bulkUploadInProgress = true;
  document.getElementById('bulkUploadStartBtn').disabled = true;
  document.getElementById('bulkUploadStartBtn').textContent = 'Загрузка...';

  const defaultCategory = (document.getElementById('bulkUploadCategory').value || '').trim();
  const categories = defaultCategory ? [defaultCategory] : ['Без категории'];
  for (let i = 0; i < bulkUploadQueue.length; i++) {
    const item = bulkUploadQueue[i];
    if (item.status !== 'pending') continue;

    item.status = 'uploading';
    item.message = 'Создаётся...';
    renderBulkUploadList();

    try {
      const ext = item.file.name.split('.').pop().toLowerCase();
      const format = (ext === 'epub') ? 'epub' : 'pdf';
      const title = (item.file.name.replace(/\.(pdf|epub)$/i, '').replace(/[_-]/g, ' ').trim() || 'Без названия').slice(0, 255);

      // 1. Создаём книгу
      const created = await api.books.create({
        title: title,
        author: '—',
        categories: categories,
        description: '',
        icon: '📘',
        file_format: format,
      });

      // 2. Загружаем файл
      item.message = 'Загрузка файла...';
      renderBulkUploadList();

      if (format === 'epub') {
        await api.books.uploadEpub(created.id, item.file);
      } else {
        await api.books.uploadPdf(created.id, item.file);
        // Автообложка из первой страницы PDF
        item.message = 'Создание обложки...';
        renderBulkUploadList();
        try {
          const coverBlob = await generateCoverFromPdf(item.file);
          if (coverBlob) {
            const coverGenFile = new File([coverBlob], 'cover.jpg', { type: 'image/jpeg' });
            await api.books.uploadCover(created.id, coverGenFile);
          }
        } catch (coverErr) {
          console.warn('Автообложка не создана для', item.file.name, coverErr);
        }
      }

      item.status = 'done';
      item.message = 'Создана';
    } catch (e) {
      item.status = 'error';
      item.message = 'Ошибка: ' + String(e.detail || e.message || 'Неизвестная ошибка').slice(0, 120);
      console.error('Bulk upload error:', e);
    }
    renderBulkUploadList();
  }

  bulkUploadInProgress = false;
  document.getElementById('bulkUploadStartBtn').disabled = false;
  document.getElementById('bulkUploadStartBtn').textContent = 'Загрузить';

  const done = bulkUploadQueue.filter(i => i.status === 'done').length;
  const errors = bulkUploadQueue.filter(i => i.status === 'error').length;
  showToast(`Создано книг: ${done}` + (errors ? ` · Ошибок: ${errors}` : ''));

  // Обновляем каталог
  await loadBooksFromApi();
  if (state.currentScreen === 'admin') renderAdminPanel();
}
function renderAdminReviewsTable(container, reviews) {
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const header = document.createElement('tr');
  ['Книга', 'Пользователь', 'Оценка', 'Текст', 'Действия'].forEach(label => {
    const th = document.createElement('th');
    th.textContent = label;
    header.appendChild(th);
  });
  thead.appendChild(header);
  const tbody = document.createElement('tbody');
  reviews.forEach(review => {
    const row = document.createElement('tr');
    appendAdminCell(row, review.bookTitle);
    appendAdminCell(row, review.user);
    const rating = document.createElement('td');
    const ratingCount = Math.max(0, Math.min(5, Number(review.rating) || 0));
    for (let index = 0; index < ratingCount; index += 1) appendTrustedIcon(rating, ICONS.star);
    row.appendChild(rating);
    const reviewText = String(review.text || '');
    appendAdminCell(row, reviewText.substring(0, 50) + (reviewText.length > 50 ? '...' : ''));
    const actions = document.createElement('td');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn-sm danger';
    appendTrustedIcon(remove, ICONS.trash);
    remove.addEventListener('click', () => deleteReviewAndRefresh(review.bookId, review.id));
    actions.appendChild(remove);
    row.appendChild(actions);
    tbody.appendChild(row);
  });
  table.append(thead, tbody);
  wrap.appendChild(table);
  container.replaceChildren(wrap);
}

async function loadAndRenderAdminReviews() {
  const container = document.getElementById('adReviews');
  if (!container) return;
  replaceWithStaticText(container, 'Загрузка отзывов...', 'a449');

  try {
    const books = state.books;
    const allReviews = [];

    for (const book of books) {
      const reviews = await getReviews(book.id);
      reviews.forEach(review => {
        allReviews.push({
          ...review,
          bookId: book.id,
          bookTitle: book.title,
        });
      });
    }

    allReviews.sort((a, b) => new Date(b.date) - new Date(a.date));
    renderAdminReviewsTable(container, allReviews);
  } catch (err) {
    replaceWithStaticText(container, 'Не удалось загрузить отзывы', 'a150');
  }
}
