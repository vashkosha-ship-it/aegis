'use strict';

/* Перетаскивание книг между статусами списка чтения. */

const mylistDragDropGrids = new WeakSet();
const mylistDragDropTabs = new WeakSet();

function initDragAndDrop() {
  const grid = document.getElementById('mylistGrid');

  if (grid && !mylistDragDropGrids.has(grid)) {
    mylistDragDropGrids.add(grid);

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
