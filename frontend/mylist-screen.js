// Экран «Мой список»: вкладки статусов и сетка книг.
document.getElementById('mylistTabs').addEventListener('click', e => {
  const t = e.target.closest('.mylist-tab');
  if (!t) return;
  state.mylistTab = t.dataset.mylist;
  renderMyList();
});

function renderMyList() {
  updateAvatar('avatarMylist');
  const g = { reading: [], planned: [], completed: [] };
  state.books.forEach(b => {
    const s = state.mylist[b.id];
    if (s && g[s]) g[s].push(b);
  });
  document.querySelectorAll('.mylist-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.mylist === state.mylistTab);
    t.querySelector('.count').textContent = g[t.dataset.mylist]?.length || 0;
  });
  replaceWithAppMarkup(document.getElementById('mylistGrid'), g[state.mylistTab]?.length
    ? g[state.mylistTab].map(b => cardHTML(b, '', { listMenu: true })).join('')
    : `<div class="mylist-empty"><div class="icon" data-static-style="a239">${ICONS.bookmark}</div><p>Пусто</p></div>`);

  initDragAndDrop();
}

// Меню карточки в «Моём списке»: перенести в другой блок или убрать из
// списка. Работает и на планшетах, где перетаскивание неудобно.
const MYLIST_STATUS_LABELS = { reading: 'Читаю', planned: 'В планах', completed: 'Прочитано' };

function openMylistMoveMenu(bookId) {
  const book = state.books.find(item => item.id === bookId);
  if (!book) return;
  const current = state.mylist[bookId];
  const { overlay, panel } = createDialogShell('mylistMoveMenu', 'Переместить книгу');
  panel.classList.add('mylist-move-dialog');
  const name = document.createElement('p');
  name.className = 'mylist-move-book';
  name.textContent = book.title;
  panel.appendChild(name);

  let keyHandler;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', keyHandler);
  };
  keyHandler = event => { if (event.key === 'Escape') close(); };
  document.addEventListener('keydown', keyHandler);
  bindDialogClose(overlay, close);

  const list = document.createElement('div');
  list.className = 'mylist-move-options';
  Object.entries(MYLIST_STATUS_LABELS).forEach(([status, label]) => {
    const button = createDialogButton(`mylistMove-${status}`, status === current ? `${label} — сейчас здесь` : `В «${label}»`, 'mylist-move-option');
    button.disabled = status === current;
    button.addEventListener('click', async () => {
      close();
      await updateBookStatus(bookId, status);
      renderMyList();
    });
    list.appendChild(button);
  });
  const remove = createDialogButton('mylistMove-remove', 'Убрать из списка', 'mylist-move-option mylist-move-option--danger');
  remove.addEventListener('click', async () => {
    close();
    await updateBookStatus(bookId, null);
    renderMyList();
  });
  list.appendChild(remove);
  panel.appendChild(list);

  const footer = document.createElement('div');
  footer.className = 'app-dialog-actions';
  const cancel = createDialogButton('mylistMoveCancel', 'Отмена', 'app-dialog-button app-dialog-button--cancel');
  cancel.addEventListener('click', close);
  footer.appendChild(cancel);
  panel.appendChild(footer);
  setTimeout(() => list.querySelector('button:not(:disabled)')?.focus(), 0);
}
