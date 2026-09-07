'use strict';

/* Загрузка, кэширование и изменение отзывов о книгах. */

// ========== REVIEWS CACHE ==========
const reviewsCache = {};

async function getReviews(bookId) {
  if (reviewsCache[bookId]) return reviewsCache[bookId];
  try {
    const list = await api.library.reviews(bookId);
    const adapted = list.map(r => ({
      id: r.id,
      user: r.user_username,
      avatar: (r.user_username || '?').charAt(0).toUpperCase(),
      rating: r.rating,
      text: r.text,
      date: r.created_at,
      _userId: r.user_id,
    }));
    reviewsCache[bookId] = adapted;
    return adapted;
  } catch (err) {
    console.error('Не удалось загрузить отзывы:', err);
    return [];
  }
}

async function addReview(bookId, rating, text) {
  if (!state.currentUser) return;
  try {
    await api.library.addReview(bookId, rating, text);
    delete reviewsCache[bookId];
    await refreshBookFromApi(bookId);
    showToast('Отзыв сохранён!');
    refreshGamificationFromApi();
    if (state.currentScreen === 'detail' && currentBookId === bookId) {
      renderReviews();
      renderBookInfo();
    }
  } catch (err) {
    if (err instanceof api.ApiError) {
      showToast('Ошибка: ' + (err.detail || err.status));
    } else {
      showToast('Сервер недоступен');
    }
  }
}

async function deleteReview(bookId, reviewId) {
  try {
    await api.library.deleteReview(reviewId);
    delete reviewsCache[bookId];
    await refreshBookFromApi(bookId);
    showToast('Отзыв удалён');
    if (state.currentScreen === 'detail' && currentBookId === bookId) {
      renderReviews();
      renderBookInfo();
    }
  } catch (err) {
    if (err instanceof api.ApiError) {
      if (err.status === 403) showToast('Нельзя удалить чужой отзыв');
      else showToast('Ошибка: ' + (err.detail || err.status));
    } else {
      showToast('Сервер недоступен');
    }
  }
}

async function refreshBookFromApi(bookId) {
  try {
    const fresh = await api.books.get(bookId);
    const adapted = adaptBookFromApi(fresh);
    const idx = state.books.findIndex(b => b.id === bookId);
    if (idx >= 0) state.books[idx] = adapted;
    if (state.currentBook && state.currentBook.id === bookId) state.currentBook = adapted;
  } catch (err) {
    console.error('Не удалось обновить книгу:', err);
  }
}

let reviewRating = 0;

function setReviewStar(n) {
  reviewRating = n;
  document.querySelectorAll('#reviewForm .star').forEach((el, i) => {
    el.classList.toggle('filled', i < n);
  });
}

function renderStarSVG(filled) {
  return filled ? ICONS.star : ICONS.starEmpty;
}

