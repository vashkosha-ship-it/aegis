'use strict';

/* Кэш и базовые операции с аннотациями книг. */

// ========== ANNOTATIONS ==========
const annotationsCache = {};

async function adaptAnnotation(a) {
  return {
    id: a.id,
    type: a.type,
    text: await decryptNote(a.selected_text),
    note: await decryptNote(a.note_text || ''),
    page: a.page,
    position: a.position || {},
    date: a.created_at,
  };
}

async function getAnnotations(bookId) {
  if (annotationsCache[bookId]) return annotationsCache[bookId];
  try {
    const list = await api.library.annotations(bookId);
    const adapted = await Promise.all(list.map(adaptAnnotation));
    annotationsCache[bookId] = adapted;
    return adapted;
  } catch (err) {
    console.error('Не удалось загрузить аннотации:', err);
    return [];
  }
}

async function addHighlight(bookId, text, pageNum, pos) {
  if (!text || text.length > 10000) {
    showToast('Слишком длинный фрагмент (максимум 10000 символов)');
    return null;
  }
  try {
    const encText = await encryptNote(text);
    const created = await api.library.addAnnotation(bookId, {
      type: 'highlight',
      page: pageNum,
      selected_text: encText,
      position: pos || {},
    });
    delete annotationsCache[bookId];
    if (currentBookId === bookId) await renderAnnotations();
    refreshGamificationFromApi();
    return created;
  } catch (err) {
    if (err instanceof api.ApiError) showToast('Ошибка: ' + (err.detail || err.status));
    else showToast('Сервер недоступен');
    return null;
  }
}

async function addNote(bookId, text, note, pageNum, pos) {
  if (!text || text.length > 10000) {
    showToast('Слишком длинный фрагмент');
    return null;
  }
  if (note && note.length > 5000) {
    showToast('Заметка слишком длинная (максимум 5000 символов)');
    return null;
  }
  if (!_noteKey) {
    showToast('Для шифрования заметок войдите в аккаунт заново (введите пароль)');
  }
  try {
    const encText = await encryptNote(text);
    const encNote = await encryptNote(note || '');
    const created = await api.library.addAnnotation(bookId, {
      type: 'note',
      page: pageNum,
      selected_text: encText,
      note_text: encNote,
      position: pos || {},
    });
    delete annotationsCache[bookId];
    if (currentBookId === bookId) await renderAnnotations();
    refreshGamificationFromApi();
    return created;
  } catch (err) {
    if (err instanceof api.ApiError) showToast('Ошибка: ' + (err.detail || err.status));
    else showToast('Сервер недоступен');
    return null;
  }
}

async function deleteAnnotation(bookId, annId) {
  try {
    await api.library.deleteAnnotation(annId);
    delete annotationsCache[bookId];
    if (currentBookId === bookId) await renderAnnotations();
    if (state.currentScreen === 'detail' && state.detailTab === 'notes') renderDetailNotes();
    return true;
  } catch (err) {
    if (err instanceof api.ApiError) {
      if (err.status === 403) showToast('Нельзя удалить чужую аннотацию');
      else showToast('Ошибка: ' + (err.detail || err.status));
    } else {
      showToast('Сервер недоступен');
    }
    return false;
  }
}
