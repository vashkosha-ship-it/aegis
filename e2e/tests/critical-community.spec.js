const { test, expect } = require('@playwright/test');
const { login, fixtureBooks } = require('./helpers/session');

test('@critical отзывы и обсуждения создаются, читаются и удаляются', async ({ page }) => {
  await login(page);
  const { pdf } = await fixtureBooks(page);
  expect(pdf).toBeTruthy();
  const marker = `e2e-${Date.now()}`;

  const created = await page.evaluate(async ({ bookId, marker }) => {
    const review = await api.library.addReview(bookId, 5, `review-${marker}`);
    const comment = await api.library.addBookComment(bookId, `comment-${marker}`);
    return { review, comment };
  }, { bookId: pdf.id, marker });

  const visible = await page.evaluate(async ({ bookId, marker }) => {
    const reviews = await api.library.reviews(bookId);
    const comments = await api.library.bookComments(bookId);
    return {
      review: reviews.some((item) => item.text === `review-${marker}`),
      comment: comments.some((item) => item.text === `comment-${marker}`),
    };
  }, { bookId: pdf.id, marker });
  expect(visible).toEqual({ review: true, comment: true });

  await page.evaluate(async ({ bookId, reviewId, commentId }) => {
    await api.library.deleteReview(reviewId);
    await api.library.deleteBookComment(bookId, commentId);
  }, {
    bookId: pdf.id,
    reviewId: created.review.id,
    commentId: created.comment.id,
  });

  const removed = await page.evaluate(async ({ bookId, marker }) => {
    const reviews = await api.library.reviews(bookId);
    const comments = await api.library.bookComments(bookId);
    return !reviews.some((item) => item.text === `review-${marker}`)
      && !comments.some((item) => item.text === `comment-${marker}`);
  }, { bookId: pdf.id, marker });
  expect(removed).toBe(true);
});
