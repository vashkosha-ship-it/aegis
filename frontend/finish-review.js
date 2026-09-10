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
    replaceWithTrustedIcon(el, renderStarSVG(i < n));
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
  const panel = document.createElement('div');
  panel.setAttribute('data-static-style', 'a101');
  const complete = document.createElement('div');
  complete.setAttribute('data-static-style', 'a102');
  if (!appendTrustedIcon(complete, ICONS.check || '')) complete.textContent = '✓';
  const heading = document.createElement('h3');
  heading.setAttribute('data-static-style', 'a103');
  heading.textContent = 'Книга прочитана!';
  const prompt = document.createElement('p');
  prompt.setAttribute('data-static-style', 'a104');
  prompt.textContent = `${book ? book.title : 'Эта книга'} — поделитесь оценкой, это поможет другим читателям.`;
  const stars = document.createElement('div');
  stars.className = 'star-input';
  stars.setAttribute('data-static-style', 'a105');
  for (let rating = 1; rating <= 5; rating += 1) {
    const star = document.createElement('span');
    star.className = 'star';
    star.setAttribute('data-static-style', 'a106');
    appendTrustedIcon(star, renderStarSVG(false));
    star.addEventListener('click', () => setFinishReviewStar(rating));
    stars.appendChild(star);
  }
  const textarea = document.createElement('textarea');
  textarea.id = 'finishReviewText';
  textarea.rows = 2;
  textarea.placeholder = 'Пара слов о книге (необязательно)';
  textarea.setAttribute('data-static-style', 'a107');
  const actions = document.createElement('div');
  actions.setAttribute('data-static-style', 'a108');
  const later = document.createElement('button');
  later.className = 'btn';
  later.setAttribute('data-static-style', 'a109');
  later.textContent = 'Позже';
  later.addEventListener('click', closeFinishReviewModal);
  const submit = document.createElement('button');
  submit.className = 'btn btn-primary';
  submit.setAttribute('data-static-style', 'a110');
  submit.textContent = 'Оценить';
  submit.addEventListener('click', () => submitFinishReview(bookId));
  actions.append(later, submit);
  panel.append(complete, heading, prompt, stars, textarea, actions);
  m.appendChild(panel);
  m.addEventListener('click', (e) => { if (e.target === m) closeFinishReviewModal(); });
  document.body.appendChild(m);
}
