// Administrative book editor, category controls and description generation.

async function openAddModal() {
  document.getElementById('newTitle').value = '';
  document.getElementById('newAuthor').value = '';
  document.getElementById('newCover').value = '';
  document.getElementById('newBookFile').value = '';
  const descEl = document.getElementById('newDescription');
  if (descEl) descEl.value = '';

  initCategoryTags('newCategoriesContainer', []);
  document.getElementById('addModal').classList.remove('hidden');
}

function detectFileFormat(file) {
  if (!file) return 'pdf';
  const name = file.name.toLowerCase();
  if (name.endsWith('.epub')) return 'epub';
  return 'pdf';
}

async function populateNewCategoriesSelect() {
  const sel = document.getElementById('newCategorySelect');
  let categories = [];
  try {
    categories = await api.books.categories();
  } catch (e) {
    categories = [];
  }
  replaceSelectOptions(sel, categories);
  sel.value = []; // снимаем все выделения
}

// Функция для добавления новой категории в модалке добавления книги
function addNewCategoryToAddModal() {
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

  // Проверяем, нет ли уже такой категории
  const exists = Array.from(select.options).some(opt => opt.value.toLowerCase() === newCat.toLowerCase());
  if (exists) {
    showToast('Такая категория уже существует');
    input.value = '';
    return;
  }

  // Добавляем новую опцию
  const option = document.createElement('option');
  option.value = newCat;
  option.textContent = newCat;
  select.appendChild(option);

  // Выделяем новую категорию
  option.selected = true;

  // Очищаем поле
  input.value = '';

  showToast(`Категория "${newCat}" добавлена`);
}

function onNewCategoryChange(value) {
  const newInput = document.getElementById('newCategoryNew');
  newInput.style.display = value === '__new__' ? 'block' : 'none';
  if (value === '__new__') newInput.focus();
}

function closeAddModal() {
  document.getElementById('addModal').classList.add('hidden');
}

// ========== ADMIN BOOK MODAL ==========
let adminBookModalCurrentId = null;
let adminBookModalCurrentFormat = 'pdf';

const BOOK_INDEX_STATUS_LABELS = {
  not_indexed: 'Не индексировалась',
  queued: 'В очереди',
  running: 'Индексируется',
  succeeded: 'Готово',
  failed: 'Ошибка',
};

function bookIndexStatusText(data) {
  const status = data.status || data.indexing_status || 'not_indexed';
  const label = BOOK_INDEX_STATUS_LABELS[status] || 'Неизвестно';
  const sections = Number(data.indexed_sections || 0);
  const finished = data.finished_at || data.indexing_finished_at || data.indexed_at;
  const parts = [`Индекс: ${label}`];
  if (status === 'succeeded') parts.push(`${sections} секц.`);
  if (finished) {
    const date = new Date(finished);
    if (!Number.isNaN(date.getTime())) parts.push(date.toLocaleString('ru-RU'));
  }
  if (data.error) {
    const error = String(data.error);
    parts.push(error.length > 240 ? `${error.slice(0, 237)}…` : error);
  }
  return parts.join(' · ');
}

function renderBookIndexStatus(data, hasFile = true) {
  const output = document.getElementById('adminIndexStatus');
  const retry = document.getElementById('adminReindexBookBtn');
  if (output) {
    output.textContent = bookIndexStatusText(data);
    output.title = data.error ? String(data.error) : '';
  }
  if (retry) {
    const status = data.status || data.indexing_status || 'not_indexed';
    retry.disabled = !hasFile || status === 'queued' || status === 'running';
  }
}

async function openAdminBookModal(bookId) {
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    return showToast('Нужны права администратора');
  }
  adminBookModalCurrentId = bookId;

  let book;
  try {
    book = await api.books.get(bookId);
  } catch (err) {
    return showToast('Не удалось загрузить книгу');
  }

  document.getElementById('adminEditTitle').value = book.title || '';
  document.getElementById('adminEditAuthor').value = book.author || '';
  document.getElementById('adminEditDescription').value = book.description || '';
  document.getElementById('adminEditIcon').value = book.icon || ICONS.bookCover;

initCategoryTags('adminCategoriesContainer', book.categories || []);

  const format = book.file_format || (book.has_epub ? 'epub' : 'pdf');
  adminBookModalCurrentFormat = format;
  document.getElementById('adminFileStatus').textContent = (book.has_pdf || book.has_epub)
    ? `Файл загружен (${format.toUpperCase()})`
    : '— Файл ещё не загружен';
  document.getElementById('adminCoverStatus').textContent = book.has_cover
    ? 'Обложка загружена'
    : '— Обложка ещё не загружена';
  const hasFile = Boolean(book.has_pdf || book.has_epub);
  renderBookIndexStatus(book, hasFile);

  document.getElementById('adminBookFileInput').value = '';
  document.getElementById('adminCoverFile').value = '';

  renderRecommendDepts(book);

  document.getElementById('adminBookModal').classList.remove('hidden');
  try {
    const detailedStatus = await api.books.indexStatus(book.id);
    if (adminBookModalCurrentId === book.id) {
      renderBookIndexStatus(detailedStatus, hasFile);
    }
  } catch (err) {
    console.warn('Не удалось получить статус индексации книги', err);
  }
}

// Вычисляет, каким подразделениям релевантна книга (по совпадению категорий/названия с темами)
function renderRecommendDepts(book) {
  const el = document.getElementById('adminRecommendDepts');
  if (!el) return;
  const hay = ((book.categories || []).join(' ') + ' ' + (book.title || '') + ' ' + (book.description || '')).toLowerCase();
  const matches = [];
  for (const [code, keywords] of Object.entries(DEPARTMENT_TOPICS)) {
    const hits = keywords.filter(keyword => hay.includes(keyword.toLowerCase())).length;
    if (hits > 0) matches.push({ code, hits });
  }
  matches.sort((a, b) => b.hits - a.hits);

  if (!matches.length) {
    replaceWithStaticText(el, 'Нет явных совпадений по темам. Книга подходит для общего доступа.', 'a243');
    return;
  }

  const title = document.createElement('div');
  title.setAttribute('data-static-style', 'a347');
  title.textContent = 'Книга релевантна подразделениям:';
  const list = document.createElement('div');
  list.setAttribute('data-static-style', 'a089');
  matches.forEach(match => {
    const item = document.createElement('span');
    item.setAttribute('data-static-style', 'a528');
    const code = document.createElement('span');
    code.setAttribute('data-static-style', 'a191');
    code.textContent = String(match.code);
    const hits = document.createElement('span');
    hits.setAttribute('data-static-style', 'a099');
    hits.textContent = String(match.hits);
    const button = document.createElement('button');
    button.type = 'button';
    button.title = `Сделать обязательной для ${match.code}`;
    button.setAttribute('data-static-style', 'a529');
    button.textContent = '★ обязательная';
    button.addEventListener('click', () => markRequiredForDept(book.id, match.code, button));
    item.append(code, hits, button);
    list.appendChild(item);
  });
  el.replaceChildren(title, list);
}

async function markRequiredForDept(bookId, deptCode, btn) {
  try {
    await api.library.setRequiredBook(bookId, deptCode);
    if (btn) { btn.textContent = '✓ отмечена'; btn.disabled = true; btn.style.opacity = '0.6'; }
    showToast(`Книга обязательна для ${deptCode}`);
  } catch (e) {
    showToast(e && e.detail ? e.detail : 'Не удалось отметить');
  }
}

function closeAdminBookModal() {
  document.getElementById('adminBookModal').classList.add('hidden');
  adminBookModalCurrentId = null;
}
// ========== КОМПОНЕНТ ТЭГОВ КАТЕГОРИЙ ==========

const categoryTagsInstances = {};

function initCategoryTags(containerId, initialTags = []) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cat-tag-input';
  input.placeholder = 'Введи категорию и нажми Enter…';
  input.autocomplete = 'off';
  const suggestionsBox = document.createElement('div');
  suggestionsBox.className = 'cat-tag-suggestions';
  container.replaceChildren(input, suggestionsBox);

  categoryTagsInstances[containerId] = {
    tags: [...initialTags],
    container,
    input,
    suggestionsBox,
    highlightedIndex: -1,
  };

  renderCategoryChips(containerId);

  input.addEventListener('input', () => {
    const value = input.value.trim();
    if (value.length === 0) {
      hideCategorySuggestions(containerId);
      return;
    }
    showCategorySuggestions(containerId, value);
  });

  input.addEventListener('keydown', (event) => {
    const inst = categoryTagsInstances[containerId];
    const items = suggestionsBox.querySelectorAll('.cat-tag-suggestion-item');

    if (event.key === 'Enter') {
      event.preventDefault();
      if (inst.highlightedIndex >= 0 && items[inst.highlightedIndex]) {
        addCategoryTag(containerId, items[inst.highlightedIndex].dataset.name);
      } else {
        const value = input.value.trim();
        if (value) addCategoryTag(containerId, value);
      }
      input.value = '';
      hideCategorySuggestions(containerId);
    } else if (event.key === 'Backspace' && input.value === '' && inst.tags.length > 0) {
      removeCategoryTag(containerId, inst.tags[inst.tags.length - 1]);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (items.length > 0) inst.highlightedIndex = (inst.highlightedIndex + 1) % items.length;
      updateSuggestionHighlight(containerId);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (items.length > 0) inst.highlightedIndex = inst.highlightedIndex <= 0 ? items.length - 1 : inst.highlightedIndex - 1;
      updateSuggestionHighlight(containerId);
    } else if (event.key === 'Escape') {
      hideCategorySuggestions(containerId);
    } else if (event.key === ',') {
      event.preventDefault();
      const value = input.value.trim();
      if (value) addCategoryTag(containerId, value);
      input.value = '';
      hideCategorySuggestions(containerId);
    }
  });

  document.addEventListener('click', (event) => {
    if (!container.contains(event.target)) hideCategorySuggestions(containerId);
  });
  container.addEventListener('click', (event) => {
    if (event.target === container) input.focus();
  });
}

function renderCategoryChips(containerId) {
  const inst = categoryTagsInstances[containerId];
  if (!inst) return;
  inst.container.querySelectorAll('.cat-tag-chip').forEach(chip => chip.remove());
  inst.tags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'cat-tag-chip';
    chip.appendChild(document.createTextNode(String(tag)));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'cat-tag-chip-x';
    remove.dataset.tag = String(tag);
    remove.textContent = '×';
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      removeCategoryTag(containerId, tag);
    });
    chip.appendChild(remove);
    inst.container.insertBefore(chip, inst.input);
  });
}

function addCategoryTag(containerId, name) {
  const inst = categoryTagsInstances[containerId];
  if (!inst) return;
  const clean = String(name).trim();
  if (!clean || clean.length > 64) {
    if (clean.length > 64) showToast('Категория: максимум 64 символа');
    return;
  }
  const lowerExisting = inst.tags.map(t => t.toLowerCase());
  if (lowerExisting.includes(clean.toLowerCase())) return;
  inst.tags.push(clean);
  renderCategoryChips(containerId);
}

function removeCategoryTag(containerId, name) {
  const inst = categoryTagsInstances[containerId];
  if (!inst) return;
  inst.tags = inst.tags.filter(t => t !== name);
  renderCategoryChips(containerId);
}

async function showCategorySuggestions(containerId, query) {
  const inst = categoryTagsInstances[containerId];
  if (!inst) return;
  let allCategories;
  try { allCategories = await api.books.categories(); }
  catch (error) { allCategories = []; }
  const normalizedQuery = query.toLowerCase();
  const selected = new Set(inst.tags.map(tag => tag.toLowerCase()));
  const matching = allCategories.filter(category =>
    category.toLowerCase().includes(normalizedQuery) && !selected.has(category.toLowerCase())
  );
  const fragment = document.createDocumentFragment();
  const appendSuggestion = (name, label, isNew = false) => {
    const item = document.createElement('div');
    item.className = 'cat-tag-suggestion-item';
    item.dataset.name = String(name);
    if (isNew) item.setAttribute('data-static-style', 'a530');
    item.textContent = label;
    item.addEventListener('click', () => {
      addCategoryTag(containerId, item.dataset.name);
      inst.input.value = '';
      inst.input.focus();
      hideCategorySuggestions(containerId);
    });
    fragment.appendChild(item);
  };
  matching.forEach(category => appendSuggestion(category, category));
  const exactMatch = allCategories.some(category => category.toLowerCase() === normalizedQuery);
  if (!exactMatch && query.length > 0) appendSuggestion(query, `+ Создать: «${query}»`, true);
  if (!fragment.childNodes.length) {
    const empty = document.createElement('div');
    empty.className = 'cat-tag-suggestion-empty';
    empty.textContent = 'Нет подходящих категорий';
    fragment.appendChild(empty);
  }
  inst.suggestionsBox.replaceChildren(fragment);
  inst.suggestionsBox.classList.add('active');
  inst.highlightedIndex = -1;
}

function hideCategorySuggestions(containerId) {
  const inst = categoryTagsInstances[containerId];
  if (!inst) return;
  inst.suggestionsBox.classList.remove('active');
  inst.highlightedIndex = -1;
}

function updateSuggestionHighlight(containerId) {
  const inst = categoryTagsInstances[containerId];
  if (!inst) return;
  const items = inst.suggestionsBox.querySelectorAll('.cat-tag-suggestion-item');
  items.forEach((item, idx) => {
    item.classList.toggle('highlighted', idx === inst.highlightedIndex);
  });
}

function getCategoryTags(containerId) {
  const inst = categoryTagsInstances[containerId];
  return inst ? [...inst.tags] : [];
}
async function populateAdminCategoriesSelect(currentCategories) {
  const sel = document.getElementById('adminEditCategorySelect');
  let categories = [];
  try {
    categories = await api.books.categories();
  } catch (e) {
    categories = currentCategories || [];
  }

  const selected = Array.isArray(currentCategories) ? currentCategories : [];
  replaceSelectOptions(sel, categories.map(category => ({
    value: category,
    label: category,
    selected: selected.includes(category),
  })));
}

// Функция для добавления новой категории в админ-модалке
function addNewCategoryToAdminModal() {
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

  // Проверяем, нет ли уже такой категории
  const exists = Array.from(select.options).some(opt => opt.value.toLowerCase() === newCat.toLowerCase());
  if (exists) {
    showToast('Такая категория уже существует');
    input.value = '';
    return;
  }

  // Добавляем новую опцию
  const option = document.createElement('option');
  option.value = newCat;
  option.textContent = newCat;
  select.appendChild(option);

  // Выделяем новую категорию
  option.selected = true;

  // Очищаем поле
  input.value = '';

  showToast(`Категория "${newCat}" добавлена`);
}

function onAdminCategoryChange(value) {
  const newInput = document.getElementById('adminEditCategoryNew');
  newInput.style.display = value === '__new__' ? 'block' : 'none';
  if (value === '__new__') newInput.focus();
}

function getAdminSelectedCategories() {
  const select = document.getElementById('adminEditCategorySelect');
  const cats = getCategoryTags('newCategoriesContainer');

  const newCatInput = document.getElementById('adminEditCategoryNew');
  const newCat = newCatInput.value.trim();
  if (newCat) {
    const exists = Array.from(select.options).some(opt => opt.value.toLowerCase() === newCat.toLowerCase());
    if (!exists) {
      selected.push(newCat);
    }
  }

  if (selected.length === 0) {
    throw new Error('Выберите или введите хотя бы одну категорию');
  }

  return selected;
}
// ========== ADMIN MODAL HANDLERS ==========
document.getElementById('adminSaveFieldsBtn').addEventListener('click', async () => {
  if (!adminBookModalCurrentId) return;

  const title = document.getElementById('adminEditTitle').value.trim();
  const author = document.getElementById('adminEditAuthor').value.trim();
  const description = document.getElementById('adminEditDescription').value.trim();
  const icon = document.getElementById('adminEditIcon').value.trim();

  // Категории из компонента тэгов
  const cats = getCategoryTags('adminCategoriesContainer');

  if (!title || !author) return showToast('Заполните название и автора');
  if (cats.length === 0) return showToast('Добавь хотя бы одну категорию');

  for (const cat of cats) {
    if (cat.length > 64) return showToast(`Категория "${cat}": максимум 64 символа`);
  }

  const btn = document.getElementById('adminSaveFieldsBtn');
  btn.disabled = true;
  btn.textContent = 'Сохранение...';

  try {
    await api.books.update(adminBookModalCurrentId, {
      title,
      author,
      categories: cats,
      description,
      icon: icon || undefined,
    });
    await loadBooksFromApi();
    showToast('Изменения сохранены');
    if (state.currentTab === 'admin') renderAdminScreen();
  } catch (e) {
    console.error(e);
    showToast('Ошибка: ' + (e.detail || e.message));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Сохранить поля';
  }
});

async function generateAdminBookDescription() {
  if (!adminBookModalCurrentId) return;
  const button = document.getElementById('adminGenerateDescriptionBtn');
  const textarea = document.getElementById('adminEditDescription');
  if (!button || !textarea) return;

  const run = async () => {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Создание…';
    try {
      const book = await api.books.generateDescription(adminBookModalCurrentId);
      textarea.value = book.description || '';
      const cached = (state.books || []).find(item => item.id === adminBookModalCurrentId);
      if (cached) cached.description = textarea.value;
      showToast('ИИ-описание создано и сохранено');
    } catch (error) {
      showToast('Не удалось создать описание: ' + (error.detail || error.message));
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  };

  if (textarea.value.trim()) {
    showConfirmModal({
      title: 'Пересоздать описание?',
      message: 'Текущее описание будет заменено новым вариантом.',
      confirmText: 'Пересоздать',
      cancelText: 'Отмена',
      onConfirm: run,
    });
    return;
  }
  await run();
}

document.getElementById('adminGenerateDescriptionBtn')
  ?.addEventListener('click', generateAdminBookDescription);

document.getElementById('adminUploadFileBtn').addEventListener('click', async () => {
  if (!adminBookModalCurrentId) return;
  const file = document.getElementById('adminBookFileInput').files[0];
  if (!file) return showToast('Выберите файл книги');
  const MAX_SIZE = 150 * 1024 * 1024;
  if (file.size > MAX_SIZE) return showToast('Файл больше 150 МБ');

  const btn = document.getElementById('adminUploadFileBtn');
  btn.disabled = true;
  btn.textContent = '...';

  try {
    const format = detectFileFormat(file);
    let uploadResult;
    if (format === 'epub') {
      uploadResult = await api.books.uploadEpub(adminBookModalCurrentId, file);
    } else {
      uploadResult = await api.books.uploadPdf(adminBookModalCurrentId, file);
    }
    adminBookModalCurrentFormat = format;
    document.getElementById('adminFileStatus').textContent = `Файл загружен (${format.toUpperCase()})`;
    renderBookIndexStatus({
      status: uploadResult.indexing_status === 'queued' ? 'queued' : 'failed',
      error: uploadResult.indexing_status === 'unavailable'
        ? 'Очередь индексации недоступна'
        : null,
    }, true);
    document.getElementById('adminBookFileInput').value = '';
    showToast('Файл загружен');
    await loadBooksFromApi();
    if (state.currentScreen === 'detail' && currentBookId === adminBookModalCurrentId) {
      state.currentBook = state.books.find(b => b.id === adminBookModalCurrentId) || state.currentBook;
      renderBookInfo();
    }
  } catch (err) {
    showToast('Ошибка загрузки: ' + (err.detail || err.message));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Загрузить';
  }
});

document.getElementById('adminReindexBookBtn').addEventListener('click', async () => {
  if (!adminBookModalCurrentId) return;
  const btn = document.getElementById('adminReindexBookBtn');
  btn.disabled = true;
  try {
    const result = await api.library.reindexBook(adminBookModalCurrentId);
    renderBookIndexStatus({ status: 'queued', job_id: result.job_id }, true);
    showToast('Книга поставлена в очередь на индексацию');
    await loadBooksFromApi();
    if (state.currentScreen === 'admin') renderAdminPanel();
  } catch (err) {
    showToast('Ошибка индексации: ' + (err.detail || err.message));
    try {
      const status = await api.books.indexStatus(adminBookModalCurrentId);
      renderBookIndexStatus(status, true);
    } catch (_) {
      btn.disabled = false;
    }
  }
});

document.getElementById('adminDeleteFileBtn').addEventListener('click', async () => {
  if (!adminBookModalCurrentId) return;
  if (!confirm('Удалить файл книги? Файл будет удалён с сервера.')) return;
  try {
    if (adminBookModalCurrentFormat === 'epub') {
      await api.books.deleteEpub(adminBookModalCurrentId);
    } else {
      await api.books.deletePdf(adminBookModalCurrentId);
    }
    document.getElementById('adminFileStatus').textContent = '— Файл ещё не загружен';
    renderBookIndexStatus({ status: 'not_indexed' }, false);
    showToast('Файл удалён');
    await loadBooksFromApi();
    if (state.currentScreen === 'detail' && currentBookId === adminBookModalCurrentId) {
      state.currentBook = state.books.find(b => b.id === adminBookModalCurrentId) || state.currentBook;
      renderBookInfo();
    }
  } catch (err) {
    showToast('Ошибка: ' + (err.detail || err.message));
  }
});

document.getElementById('adminUploadCoverBtn').addEventListener('click', async () => {
  if (!adminBookModalCurrentId) return;
  const file = document.getElementById('adminCoverFile').files[0];
  if (!file) return showToast('Выберите файл обложки');
  if (file.size > 5 * 1024 * 1024) return showToast('Обложка больше 5 МБ');

  const btn = document.getElementById('adminUploadCoverBtn');
  btn.disabled = true;
  btn.textContent = '...';
  try {
    const result = await api.books.uploadCover(adminBookModalCurrentId, file);
    document.getElementById('adminCoverStatus').textContent = 'Обложка загружена';
    document.getElementById('adminCoverFile').value = '';
    showToast(result.replaced ? 'Обложка заменена' : 'Обложка загружена');
    await loadBooksFromApi();
    if (state.currentScreen === 'detail' && currentBookId === adminBookModalCurrentId) {
      state.currentBook = state.books.find(b => b.id === adminBookModalCurrentId) || state.currentBook;
      renderBookInfo();
    }
  } catch (err) {
    showToast('Ошибка загрузки: ' + (err.detail || err.message));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Загрузить';
  }
});

document.getElementById('adminDeleteCoverBtn').addEventListener('click', async () => {
  if (!adminBookModalCurrentId) return;
  if (!confirm('Удалить обложку у этой книги?')) return;
  try {
    await api.books.deleteCover(adminBookModalCurrentId);
    document.getElementById('adminCoverStatus').textContent = '— Обложка ещё не загружена';
    showToast('Обложка удалена');
    await loadBooksFromApi();
    if (state.currentScreen === 'detail' && currentBookId === adminBookModalCurrentId) {
      state.currentBook = state.books.find(b => b.id === adminBookModalCurrentId) || state.currentBook;
      renderBookInfo();
    }
  } catch (err) {
    showToast('Ошибка: ' + (err.detail || err.message));
  }
});

document.getElementById('adminDeleteBookBtn').addEventListener('click', async () => {
  if (!adminBookModalCurrentId) return;
  const book = state.books.find(b => b.id === adminBookModalCurrentId);
  const title = book ? book.title : `книгу #${adminBookModalCurrentId}`;
  if (!confirm(`Удалить «${title}» полностью? Это действие необратимо.`)) return;

  try {
    await api.books.delete(adminBookModalCurrentId);
    showToast('Книга удалена');
    closeAdminBookModal();
    await loadBooksFromApi();
    if (state.currentScreen === 'detail' && currentBookId === adminBookModalCurrentId) {
      currentBookId = null;
      state.currentBook = null;
      navigateTo('home');
    } else {
      renderHome();
    }
  } catch (err) {
    showToast('Ошибка: ' + (err.detail || err.message));
  }
});

// ========== SAVE BOOK ==========
document.getElementById('saveBookBtn').addEventListener('click', async () => {
  const t = document.getElementById('newTitle').value.trim();
  const a = document.getElementById('newAuthor').value.trim();
  const desc = document.getElementById('newDescription').value.trim();

  // Категории из нового компонента тэгов
  const cats = getCategoryTags('newCategoriesContainer');

  if (!t || !a) return showToast('Заполните название и автора');
  if (cats.length === 0) return showToast('Добавь хотя бы одну категорию');

  for (const cat of cats) {
    if (cat.length > 64) return showToast(`Категория "${cat}": максимум 64 символа`);
  }

  const coverFile = document.getElementById('newCover').files[0];
  const bookFile = document.getElementById('newBookFile').files[0];

  const MAX_FILE_MB = 150, MAX_COVER_MB = 5;
  if (bookFile && bookFile.size > MAX_FILE_MB * 1024 * 1024) return showToast(`Файл книги больше ${MAX_FILE_MB} МБ`);
  if (coverFile && coverFile.size > MAX_COVER_MB * 1024 * 1024) return showToast(`Обложка больше ${MAX_COVER_MB} МБ`);

  const btn = document.getElementById('saveBookBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Создание...';

  try {
    const format = detectFileFormat(bookFile);
    const created = await api.books.create({
      title: t,
      author: a,
      categories: cats,
      description: desc,
      icon: '📘',
      file_format: format,
    });
    const newId = created.id;

    if (bookFile) {
      btn.textContent = 'Загрузка файла...';
      try {
        if (format === 'epub') {
          await api.books.uploadEpub(newId, bookFile);
        } else {
          await api.books.uploadPdf(newId, bookFile);
        }
      } catch (err) {
        showToast('Не удалось загрузить файл: ' + (err.detail || err.message));
      }
    }

    if (coverFile) {
      btn.textContent = 'Загрузка обложки...';
      try {
        await api.books.uploadCover(newId, coverFile);
      } catch (err) {
        showToast('Не удалось загрузить обложку: ' + (err.detail || err.message));
      }
    } else if (bookFile && format !== 'epub') {
      // Обложка не задана вручную — генерируем из первой страницы PDF
      btn.textContent = 'Создание обложки...';
      try {
        const coverBlob = await generateCoverFromPdf(bookFile);
        if (coverBlob) {
          const coverGenFile = new File([coverBlob], 'cover.jpg', { type: 'image/jpeg' });
          await api.books.uploadCover(newId, coverGenFile);
        }
      } catch (err) {
        console.warn('Не удалось создать обложку из PDF:', err);
      }
    }

    await loadBooksFromApi();
    closeAddModal();

    // Очищаем поля формы
    document.getElementById('newTitle').value = '';
    document.getElementById('newAuthor').value = '';
    document.getElementById('newDescription').value = '';
    document.getElementById('newCover').value = '';
    document.getElementById('newBookFile').value = '';

    // Сбрасываем тэги
    if (categoryTagsInstances['newCategoriesContainer']) {
      categoryTagsInstances['newCategoriesContainer'].tags = [];
      renderCategoryChips('newCategoriesContainer');
    }

    showToast('Книга добавлена');
    if (state.currentTab === 'admin') renderAdminScreen();
  } catch (e) {
    console.error(e);
    showToast('Ошибка создания: ' + (e.detail || e.message));
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});
// ========== ADMIN PANEL ==========
document.querySelectorAll('.admin-tab-btn').forEach(t => t.addEventListener('click', function () {
  document.querySelectorAll('.admin-tab-btn').forEach(x => x.classList.remove('active'));
  this.classList.add('active');
  document.querySelectorAll('.admin-panel-section').forEach(s => s.classList.remove('show'));
  document.getElementById('ad' + this.dataset.atab.charAt(0).toUpperCase() + this.dataset.atab.slice(1)).classList.add('show');
  renderAdminPanel();
}));
