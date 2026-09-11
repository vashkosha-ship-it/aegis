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

async function renderReviews() {
  const container = document.getElementById('detailTabReviews');
  if (!container || !currentBookId) return;

  showListSkeleton('detailTabReviews', 2);

  const reviews = await getReviews(currentBookId);
  const me = state.currentUser;
  const myReview = me ? reviews.find(r => r._userId === me.id) : null;

  const reviewsHtml = reviews.length === 0
    ? '<div data-static-style="a219">Пока нет отзывов. Будьте первым!</div>'
    : reviews.map(r => {
        const canDelete = me && (r._userId === me.id || me.role === 'admin');
        const dateStr = new Date(r.date).toLocaleDateString('ru-RU');
        return `<div class="review-card">
          <div class="review-header">
            <div class="review-user">
              <div class="review-avatar"><img src="${api.users.avatarUrl(r._userId)}" alt="" data-onerror="replaceWithFallback()" data-args="this" data-fallback="text" data-fallback-text="${eh(r.avatar)}" data-fallback-class="review-avatar-fallback" data-static-style="a220"></div>
              <div>
                <div data-static-style="a221">${eh(r.user)}</div>
                <div class="review-date">${dateStr}</div>
              </div>
            </div>
            <div class="review-rating">
              ${[1,2,3,4,5].map(i => `<span class="star ${i <= r.rating ? 'filled' : ''}">${renderStarSVG(i <= r.rating)}</span>`).join('')}
            </div>
          </div>
          <div class="review-text">${eh(r.text || '')}</div>
          ${canDelete ? `<button class="btn-sm danger" data-static-style="a222" data-onclick="deleteReview(${currentBookId}, ${r.id})" data-nonce="${sensitiveNonce()}">${ICONS.trash} Удалить</button>` : ''}
        </div>`;
      }).join('');

  const formHtml = me ? `
    <div id="reviewForm" data-static-style="a223">
      <h4 data-static-style="a224">${myReview ? 'Обновить мой отзыв' : 'Оставить отзыв'}</h4>
      <div class="star-input">
        ${[1,2,3,4,5].map(i => `<span class="star ${i <= (myReview?.rating || 0) ? 'filled' : ''}" data-onclick="setReviewStar(${i})">${renderStarSVG(i <= (myReview?.rating || 0))}</span>`).join('')}
      </div>
      <textarea id="reviewTextInput" rows="3" placeholder="Поделитесь впечатлением..." data-static-style="a225">${eh(myReview?.text || '')}</textarea>
      <button class="btn btn-primary" data-onclick="submitReview()" data-static-style="a226">Отправить</button>
    </div>
  ` : '<div data-static-style="a227">Войдите, чтобы оставить отзыв</div>';

  replaceWithAppMarkup(container, reviewsHtml + formHtml);

  if (myReview) reviewRating = myReview.rating;
  else reviewRating = 0;
}

function submitReview() {
  if (!state.currentUser) return showToast('Войдите, чтобы оставить отзыв');
  if (!currentBookId) return;
  if (reviewRating < 1 || reviewRating > 5) return showToast('Поставьте оценку от 1 до 5 звёзд');
  const text = document.getElementById('reviewTextInput').value.trim();
  addReview(currentBookId, reviewRating, text);
}
