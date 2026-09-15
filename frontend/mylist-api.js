// Синхронизация статусов «Моего списка» с API.
async function loadMyListFromApi() {
  try {
    const entries = await api.library.mylist();
    state.mylist = {};
    state.mylistCompletedAt = {};
    entries.forEach(e => {
      state.mylist[e.book_id] = e.status;
      if (e.completed_at) state.mylistCompletedAt[e.book_id] = e.completed_at;
    });
    return true;
  } catch (err) {
    console.error('Не удалось загрузить MyList с API:', err);
    showToast('Не удалось загрузить ваши закладки');
    return false;
  }
}

async function updateBookStatus(id, newStatus) {
  state.mylistCompletedAt = state.mylistCompletedAt || {};
  const previousStatus = state.mylist[id];
  const previousCompletedAt = state.mylistCompletedAt[id];

  if (newStatus) state.mylist[id] = newStatus;
  else delete state.mylist[id];

  if (state.currentScreen === 'mylist') renderMyList();

  try {
    if (newStatus) {
      const entry = await api.library.setMylistStatus(id, newStatus);
      if (entry && entry.completed_at) state.mylistCompletedAt[id] = entry.completed_at;
    } else {
      await api.library.removeFromMylist(id);
      delete state.mylistCompletedAt[id];
    }
    showToast('Статус обновлён');
  } catch (err) {
    if (previousStatus) state.mylist[id] = previousStatus;
    else delete state.mylist[id];
    if (previousCompletedAt) state.mylistCompletedAt[id] = previousCompletedAt;
    else delete state.mylistCompletedAt[id];
    if (state.currentScreen === 'mylist') renderMyList();
    if (state.currentScreen === 'detail') renderBookInfo();

    if (err instanceof api.ApiError) {
      showToast('Ошибка: ' + (err.detail || err.status));
    } else {
      showToast('Сервер недоступен');
    }
  }
}
