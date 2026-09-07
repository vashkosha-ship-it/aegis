'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'reviews-core.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM(`
  <div id="reviewForm">
    <button class="star"></button>
    <button class="star"></button>
    <button class="star"></button>
  </div>
  <div id="detailTabReviews"></div>
`);

let reviewLoads = 0;
const added = [];
const deleted = [];
const toasts = [];
const api = {
  ApiError: class ApiError extends Error {},
  library: {
    reviews: async bookId => {
      reviewLoads += 1;
      return [{
        id: 7,
        user_username: 'alice',
        rating: 5,
        text: 'Полезно',
        created_at: '2026-09-01T00:00:00Z',
        user_id: 3,
        book_id: bookId,
      }];
    },
    addReview: async (...args) => added.push(args),
    deleteReview: async reviewId => deleted.push(reviewId),
  },
  books: {
    get: async bookId => ({ id: bookId, title: 'Updated' }),
  },
  users: {
    avatarUrl: userId => `/api/users/${userId}/avatar`,
  },
};

const state = {
  currentUser: { id: 3, name: 'alice', role: 'user' },
  currentScreen: 'home',
  currentBook: null,
  books: [{ id: 42, title: 'Old' }],
};
const context = {
  document: dom.window.document,
  api,
  state,
  currentBookId: 42,
  adaptBookFromApi: value => ({ ...value, adapted: true }),
  eh: value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;'),
  showToast: message => toasts.push(message),
  showListSkeleton: () => {},
  sensitiveNonce: () => 'test-nonce',
  refreshGamificationFromApi: () => {},
  renderReviews: () => {},
  renderBookInfo: () => {},
  ICONS: { star: '★', starEmpty: '☆', trash: '×' },
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  const first = await context.getReviews(42);
  const second = await context.getReviews(42);
  assert.equal(reviewLoads, 1, 'повторное чтение должно использовать кэш');
  assert.deepEqual(first, second);
  assert.equal(first[0].user, 'alice');
  assert.equal(first[0].avatar, 'A');
  assert.equal(first[0]._userId, 3);

  context.setReviewStar(2);
  const stars = [...dom.window.document.querySelectorAll('.star')];
  assert.deepEqual(stars.map(star => star.classList.contains('filled')), [true, true, false]);
  assert.equal(context.renderStarSVG(true), '★');
  assert.equal(context.renderStarSVG(false), '☆');

  await context.addReview(42, 4, 'Хорошо');
  assert.deepEqual(added, [[42, 4, 'Хорошо']]);
  assert.equal(state.books[0].title, 'Updated');
  assert.ok(state.books[0].adapted);
  assert.ok(toasts.includes('Отзыв сохранён!'));

  await context.deleteReview(42, 7);
  assert.deepEqual(deleted, [7]);
  assert.ok(toasts.includes('Отзыв удалён'));

  await context.renderReviews();
  const reviewPanel = dom.window.document.getElementById('detailTabReviews');
  assert.match(reviewPanel.textContent, /alice/);
  assert.match(reviewPanel.textContent, /Обновить мой отзыв/);
  assert.equal(reviewPanel.querySelectorAll('.star-input .star').length, 5);

  context.setReviewStar(4);
  reviewPanel.querySelector('#reviewTextInput').value = 'Обновлено';
  context.submitReview();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(added[added.length - 1], [42, 4, 'Обновлено']);

  assert.doesNotMatch(appSource, /const reviewsCache|async function getReviews|function setReviewStar|async function renderReviews|function submitReview/);
  assert.ok(indexSource.indexOf('reviews-core.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /const CACHE_NAME = 'aegis-cache-v\d+'/);
  assert.match(workerSource, /['"]\/reviews-core\.js['"]/);
  console.log('Reviews core tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
