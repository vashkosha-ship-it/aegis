// Синхронизация статусов «Моего списка» с API.
async function loadMyListFromApi() {
  try {
    const entries = await api.library.mylist();
    state.mylist = {};
    entries.forEach(e => { state.mylist[e.book_id] = e.status; });
    return true;
  } catch (err) {
    console.error('Не удалось загрузить MyList с API:', err);
    showToast('Не удалось загрузить ваши закладки');
    return false;
  }
}

async function updateBookStatus(id, newStatus) {
  const previousStatus = state.mylist[id];

  if (newStatus) state.mylist[id] = newStatus;
  else delete state.mylist[id];

  if (state.currentScreen === 'mylist') renderMyList();

  try {
    if (newStatus) {
      await api.library.setMylistStatus(id, newStatus);
    } else {
      await api.library.removeFromMylist(id);
    }
    showToast('Статус обновлён');
  } catch (err) {
    if (previousStatus) state.mylist[id] = previousStatus;
    else delete state.mylist[id];
    if (state.currentScreen === 'mylist') renderMyList();
    if (state.currentScreen === 'detail') renderBookInfo();

    if (err instanceof api.ApiError) {
      showToast('Ошибка: ' + (err.detail || err.status));
    } else {
      showToast('Сервер недоступен');
    }
  }
}
