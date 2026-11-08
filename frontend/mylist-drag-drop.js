'use strict';

/* Перетаскивание книг между статусами списка чтения.
   Мышью — стандартный drag-and-drop. Пальцем он не работает (планшеты),
   поэтому для касаний своё: долгое нажатие поднимает карточку, её ведут на
   вкладку «Читаю» / «В планах» / «Прочитано» и отпускают. */

const mylistDragDropGrids = new WeakSet();
const mylistDragDropTabs = new WeakSet();

function initDragAndDrop() {
  const grid = document.getElementById('mylistGrid');

  if (grid && !mylistDragDropGrids.has(grid)) {
    mylistDragDropGrids.add(grid);
    initTouchDrag(grid);

    grid.addEventListener('dragstart', event => {
      const card = event.target.closest('.book-card-compact');
      if (!card || !event.dataTransfer) return;

      const bookId = Number.parseInt(card.dataset.bookId, 10);
      if (!Number.isInteger(bookId) || bookId <= 0) return;

      card.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(bookId));
    });

    grid.addEventListener('dragend', event => {
      event.target.closest('.book-card-compact')?.classList.remove('dragging');
      document.querySelectorAll('.mylist-tab').forEach(tab => {
        tab.classList.remove('drag-over');
      });
    });
  }

  document.querySelectorAll('.mylist-tab').forEach(tab => {
    if (mylistDragDropTabs.has(tab)) return;
    mylistDragDropTabs.add(tab);

    tab.addEventListener('dragover', event => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      tab.classList.add('drag-over');
    });

    tab.addEventListener('dragleave', () => {
      tab.classList.remove('drag-over');
    });

    tab.addEventListener('drop', async event => {
      event.preventDefault();
      tab.classList.remove('drag-over');
      if (!event.dataTransfer) return;

      const bookId = Number.parseInt(event.dataTransfer.getData('text/plain'), 10);
      const newStatus = tab.dataset.mylist;
      if (!Number.isInteger(bookId) || bookId <= 0 || !newStatus) return;

      await updateBookStatus(bookId, newStatus);
      renderMyList();
      showToast('Статус обновлён');
    });
  });
}

const MYLIST_LONG_PRESS_MS = 350;
const MYLIST_MOVE_TOLERANCE = 10;

function _mylistTabAt(x, y) {
  const target = document.elementFromPoint(x, y);
  return target ? target.closest('.mylist-tab') : null;
}

function initTouchDrag(grid) {
  let pending = null;   // { card, bookId, x, y, timer }
  let drag = null;      // { card, bookId, ghost, tab }
  let suppressClick = false;

  const cancelPending = () => {
    if (pending) clearTimeout(pending.timer);
    pending = null;
  };

  const endDrag = async drop => {
    if (!drag) return;
    const { card, bookId, ghost, tab } = drag;
    drag = null;
    ghost.remove();
    card.classList.remove('dragging');
    document.body.classList.remove('mylist-touch-dragging');
    document.querySelectorAll('.mylist-tab.drag-over').forEach(item => item.classList.remove('drag-over'));
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 400);
    const status = tab && tab.dataset.mylist;
    if (drop && status && status !== state.mylist[bookId]) {
      await updateBookStatus(bookId, status);
      renderMyList();
    }
  };

  grid.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) return;
    const card = event.target.closest('.book-card-compact');
    if (!card || event.target.closest('.book-card-move')) return;
    const bookId = Number.parseInt(card.dataset.bookId, 10);
    if (!Number.isInteger(bookId) || bookId <= 0) return;
    const touch = event.touches[0];
    cancelPending();
    pending = {
      card, bookId, x: touch.clientX, y: touch.clientY,
      timer: setTimeout(() => {
        if (!pending) return;
        const ghost = card.cloneNode(true);
        ghost.classList.add('mylist-drag-ghost');
        ghost.removeAttribute('id');
        ghost.style.left = `${pending.x}px`;
        ghost.style.top = `${pending.y}px`;
        document.body.appendChild(ghost);
        card.classList.add('dragging');
        document.body.classList.add('mylist-touch-dragging');
        drag = { card, bookId, ghost, tab: null };
        pending = null;
        if (navigator.vibrate) navigator.vibrate(15);
      }, MYLIST_LONG_PRESS_MS),
    };
  }, { passive: true });

  grid.addEventListener('touchmove', event => {
    const touch = event.touches[0];
    if (!touch) return;
    if (pending) {
      // Палец сдвинулся раньше долгого нажатия — это прокрутка, не перетаскивание.
      if (Math.abs(touch.clientX - pending.x) > MYLIST_MOVE_TOLERANCE
        || Math.abs(touch.clientY - pending.y) > MYLIST_MOVE_TOLERANCE) cancelPending();
      return;
    }
    if (!drag) return;
    event.preventDefault();
    drag.ghost.style.left = `${touch.clientX}px`;
    drag.ghost.style.top = `${touch.clientY}px`;
    const tab = _mylistTabAt(touch.clientX, touch.clientY);
    if (tab !== drag.tab) {
      if (drag.tab) drag.tab.classList.remove('drag-over');
      if (tab) tab.classList.add('drag-over');
      drag.tab = tab;
    }
  }, { passive: false });

  grid.addEventListener('touchend', event => {
    cancelPending();
    if (drag) {
      event.preventDefault();
      endDrag(true);
    }
  });
  grid.addEventListener('touchcancel', () => {
    cancelPending();
    endDrag(false);
  });
  // Долгое нажатие на Android открывает меню картинки — в списке оно мешает.
  grid.addEventListener('contextmenu', event => {
    if (event.target.closest('.book-card-compact')) event.preventDefault();
  });
  // После перетаскивания не открываем карточку книги.
  grid.addEventListener('click', event => {
    if (suppressClick) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
}
