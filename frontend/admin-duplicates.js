// ========== ДУБЛИ КНИГ (админка) ==========
// Сервер находит группы одинаковых книг (тот же файл, авторы в другом
// порядке, «2-е изд.» вместо «2-е издание», подзаголовок у одной из копий)
// и советует, какую оставить. При объединении прогресс, списки, заметки,
// отзывы и подборки читателей переезжают на оставленную книгу.

function _dupEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function _dupPlural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function _dupBookMeta(book) {
  const parts = [`#${book.id}`];
  if (book.total_pages) parts.push(`${book.total_pages} стр.`);
  parts.push(book.has_file ? String(book.file_format || '').toUpperCase() || 'файл' : 'без файла');
  if (book.readers) parts.push(`${book.readers} ${_dupPlural(book.readers, 'читатель', 'читателя', 'читателей')}`);
  return parts.join(' · ');
}

async function _mergeDuplicateGroup(group, keepId) {
  const removeIds = group.books.map(book => book.id).filter(id => id !== keepId);
  return api.books.mergeDuplicates({ keep_id: keepId, remove_ids: removeIds });
}

function _renderDuplicateGroup(group, index, onMerged, onOpen) {
  const card = _dupEl('section', 'dup-group');
  card.dataset.confidence = group.confidence;

  const head = _dupEl('div', 'dup-group-head');
  head.appendChild(_dupEl('span', `dup-badge dup-badge--${group.confidence}`,
    group.confidence === 'certain' ? 'Точный дубль' : 'Проверьте'));
  head.appendChild(_dupEl('span', 'dup-reason', (group.reasons || []).join('; ')));
  card.appendChild(head);

  const list = _dupEl('fieldset', 'dup-books');
  const legend = _dupEl('legend', 'dup-legend', 'Какую оставить');
  list.appendChild(legend);
  group.books.forEach(book => {
    const label = _dupEl('label', 'dup-book');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `dupKeep${index}`;
    radio.value = String(book.id);
    radio.checked = book.id === group.keep_id;
    const text = _dupEl('span', 'dup-book-text');
    text.appendChild(_dupEl('span', 'dup-book-title', book.title));
    text.appendChild(_dupEl('span', 'dup-book-author', book.author || 'Автор не указан'));
    text.appendChild(_dupEl('span', 'dup-book-meta', _dupBookMeta(book)));
    const open = _dupEl('button', 'dup-open', 'Открыть');
    open.type = 'button';
    open.title = 'Закрыть окно и открыть карточку книги';
    open.addEventListener('click', () => onOpen(book.id));
    label.append(radio, text, open);
    list.appendChild(label);
  });
  card.appendChild(list);

  const actions = _dupEl('div', 'dup-group-actions');
  const status = _dupEl('span', 'dup-status');
  status.setAttribute('role', 'status');
  const merge = _dupEl('button', 'admin-tool admin-tool--primary dup-merge', 'Объединить');
  merge.type = 'button';
  merge.addEventListener('click', async () => {
    const checked = list.querySelector('input[type="radio"]:checked');
    const keepId = Number(checked ? checked.value : group.keep_id);
    merge.disabled = true;
    status.textContent = 'Объединяю…';
    try {
      const result = await _mergeDuplicateGroup(group, keepId);
      card.classList.add('dup-group--done');
      list.disabled = true;
      merge.remove();
      status.textContent = `Готово: оставлена #${result.kept}, удалено ${result.removed.length}`;
      onMerged(group, result);
    } catch (error) {
      merge.disabled = false;
      status.textContent = error && error.detail ? error.detail : 'Не удалось объединить';
    }
  });
  actions.append(status, merge);
  card.appendChild(actions);
  return card;
}

async function openDuplicatesModal() {
  const { overlay, panel } = createDialogShell('duplicatesModal', 'Дубли книг');
  panel.classList.add('dup-dialog');
  const lead = _dupEl('p', 'dup-lead', 'Ищу похожие книги…');
  panel.appendChild(lead);
  const toolbar = _dupEl('div', 'dup-toolbar');
  const body = _dupEl('div', 'dup-list');
  panel.append(toolbar, body);
  const footer = _dupEl('div', 'app-dialog-actions');
  const closeBtn = createDialogButton('duplicatesCloseBtn', 'Закрыть', 'app-dialog-button app-dialog-button--cancel');
  footer.appendChild(closeBtn);
  panel.appendChild(footer);

  let changed = false;
  let keyHandler;
  const close = async () => {
    overlay.remove();
    document.removeEventListener('keydown', keyHandler);
    if (changed) {
      await loadBooksFromApi();
      if (typeof renderAdminPanel === 'function') renderAdminPanel();
      if (typeof renderHome === 'function') renderHome();
    }
  };
  keyHandler = event => { if (event.key === 'Escape') close(); };
  document.addEventListener('keydown', keyHandler);
  closeBtn.addEventListener('click', close);
  bindDialogClose(overlay, close);

  let groups;
  try {
    groups = await api.books.duplicates();
  } catch (error) {
    lead.textContent = error && error.detail ? error.detail : 'Не удалось проверить дубли';
    return;
  }
  if (!groups.length) {
    lead.textContent = 'Дублей не найдено.';
    return;
  }
  const certain = groups.filter(group => group.confidence === 'certain');
  const extra = groups.reduce((sum, group) => sum + group.books.length - 1, 0);
  lead.textContent = `Найдено групп: ${groups.length}, лишних копий: ${extra}. `
    + 'При объединении прогресс, списки, заметки и отзывы читателей переносятся на оставленную книгу. '
    + '«Объединить все» сольёт каждую группу по отмеченной в ней книге. '
    + 'В группах «Проверьте» названия отличаются — их стоит просмотреть заранее.';

  const cards = new Map();
  const onMerged = group => { changed = true; cards.delete(group); };
  groups.forEach((group, index) => {
    const card = _renderDuplicateGroup(group, index, onMerged, async bookId => {
      await close();
      if (typeof openBookDetail === 'function') openBookDetail(bookId);
    });
    cards.set(group, card);
    body.appendChild(card);
  });

  // Массовое объединение: по очереди нажимаем «Объединить» в каждой
  // ещё не объединённой группе — с той книгой, что в ней отмечена.
  const mergeMany = (list, button, title) => {
    showConfirmModal({
      title,
      message: `Групп: ${list.length}. В каждой останется отмеченная книга, остальные копии будут удалены, а данные читателей перенесены. Отменить нельзя.`,
      confirmText: 'Объединить',
      cancelText: 'Отмена',
      danger: true,
      onConfirm: async () => {
        toolbar.querySelectorAll('button').forEach(item => { item.disabled = true; });
        let done = 0;
        let failed = 0;
        for (const group of list) {
          const card = cards.get(group);
          const merge = card && card.querySelector('.dup-merge');
          if (!merge) continue;
          merge.click();
          // Ждём, пока карточка закончит (кнопка исчезнет или снова станет активной).
          while (card.querySelector('.dup-merge') && card.querySelector('.dup-merge').disabled) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          if (card.classList.contains('dup-group--done')) done += 1; else failed += 1;
          button.textContent = `Объединено ${done} из ${list.length}`;
        }
        showToast(failed ? `Объединено: ${done}, с ошибкой: ${failed}` : `Объединено групп: ${done}`);
        toolbar.querySelectorAll('button').forEach(item => { item.disabled = false; });
      },
    });
  };

  const all = _dupEl('button', 'admin-tool admin-tool--primary dup-merge-all', `Объединить все (${groups.length})`);
  all.type = 'button';
  all.addEventListener('click', () => {
    const left = groups.filter(group => cards.has(group));
    if (left.length) mergeMany(left, all, 'Объединить все дубли?');
  });
  toolbar.appendChild(all);

  if (certain.length && certain.length < groups.length) {
    const onlyCertain = _dupEl('button', 'admin-tool dup-merge-certain', `Только точные (${certain.length})`);
    onlyCertain.type = 'button';
    onlyCertain.addEventListener('click', () => {
      const left = certain.filter(group => cards.has(group));
      if (left.length) mergeMany(left, onlyCertain, 'Объединить точные дубли?');
    });
    toolbar.appendChild(onlyCertain);
  }
}
