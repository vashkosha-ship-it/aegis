// ===== Предложение оценить книгу после её дочитывания =====
const REVIEW_PROMPT_KEY = 'aegis_review_prompted';
let _finishReviewRating = 0;

function _getReviewPrompted() {
  try { return JSON.parse(lsGet(REVIEW_PROMPT_KEY) || '{}'); }
  catch (_) { return {}; }
}
function _markReviewPrompted(bookId) {
  const o = _getReviewPrompted();
  o[bookId] = 1;
  lsSet(REVIEW_PROMPT_KEY, JSON.stringify(o));
}

// Вызывается из updatePageIndicator при каждом переходе по страницам.
// Если читатель дошёл до последней страницы — один раз предлагаем оценить книгу.
function maybeShowFinishReviewPrompt() {
  if (!currentBookId || !state.currentUser) return;
  const total = isEpubMode ? (epubTotalPages || 1) : pdfTotalPages;
  const current = isEpubMode ? (epubCurrentPage || 1) : pdfCurrentPage;
  if (!total || total < 2) return;            // одностраничные/неинициализированные — пропускаем
  if (current < total) return;                // ещё не конец книги
  if (_getReviewPrompted()[currentBookId]) return;   // уже предлагали для этой книги
  // Если пользователь уже оставлял свой отзыв — не предлагаем
  const cached = reviewsCache[currentBookId];
  if (Array.isArray(cached) && cached.some(r => r.is_mine || r.user === state.currentUser.name)) {
    _markReviewPrompted(currentBookId);
    return;
  }
  _markReviewPrompted(currentBookId);
  // Небольшая задержка, чтобы не перебивать анимацию перелистывания
  setTimeout(() => showFinishReviewModal(currentBookId), 600);
}

function setFinishReviewStar(n) {
  _finishReviewRating = n;
  document.querySelectorAll('#finishReviewModal .star').forEach((el, i) => {
    el.classList.toggle('filled', i < n);
    el.innerHTML = renderStarSVG(i < n);
  });
}

function closeFinishReviewModal() {
  const m = document.getElementById('finishReviewModal');
  if (m) m.remove();
}

function submitFinishReview(bookId) {
  if (_finishReviewRating < 1) return showToast('Поставьте оценку от 1 до 5 звёзд');
  const ta = document.getElementById('finishReviewText');
  const text = ta ? ta.value.trim() : '';
  addReview(bookId, _finishReviewRating, text);
  closeFinishReviewModal();
}

function showFinishReviewModal(bookId) {
  const book = (state.books || []).find(b => b.id === bookId);
  if (document.getElementById('finishReviewModal')) return;
  _finishReviewRating = 0;
  const m = document.createElement('div');
  m.id = 'finishReviewModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:6500;display:flex;align-items:center;justify-content:center;padding:16px;';
  m.innerHTML = `<div data-static-style="a101">
      <div data-static-style="a102">${ICONS.check || '✓'}</div>
      <h3 data-static-style="a103">Книга прочитана!</h3>
      <p data-static-style="a104">${book ? eh(book.title) : 'Эта книга'} — поделитесь оценкой, это поможет другим читателям.</p>
      <div class="star-input" data-static-style="a105">
        ${[1,2,3,4,5].map(i => `<span class="star" data-static-style="a106" data-onclick="setFinishReviewStar(${i})">${renderStarSVG(false)}</span>`).join('')}
      </div>
      <textarea id="finishReviewText" rows="2" placeholder="Пара слов о книге (необязательно)" data-static-style="a107"></textarea>
      <div data-static-style="a108">
        <button class="btn" data-onclick="closeFinishReviewModal()" data-static-style="a109">Позже</button>
        <button class="btn btn-primary" data-onclick="submitFinishReview(${bookId})" data-static-style="a110">Оценить</button>
      </div>
    </div>`;
  m.addEventListener('click', (e) => { if (e.target === m) closeFinishReviewModal(); });
  document.body.appendChild(m);
}
