const { test, expect } = require('@playwright/test');
const { login, fixtureBooks } = require('./helpers/session');

test('@critical logout удаляет офлайн-данные только завершённой сессии', async ({ page }) => {
  const user = await login(page);
  const { pdf } = await fixtureBooks(page);
  expect(pdf).toBeTruthy();

  await page.evaluate(async ({ userId, book }) => {
    await offlineStorage.save(
      userId,
      book,
      new Blob(['private-e2e-book'], { type: 'application/pdf' }),
      'pdf',
    );
    localStorage.setItem(`aegis_sync_queue:${userId}`, JSON.stringify({ private: true }));
    logout();
  }, { userId: user.id, book: pdf });

  await expect(page.locator('#confirmModal')).toBeVisible();
  await page.locator('#confirmOkBtn').click();
  await expect(page.locator('#authScreen')).toHaveClass(/\bactive\b/);
  await page.waitForFunction(async (userId) => {
    const ids = await offlineStorage.listIds(userId);
    return ids.length === 0;
  }, user.id);

  const local = await page.evaluate((userId) => ({
    cachedUser: localStorage.getItem('aegis_cached_user'),
    syncQueue: localStorage.getItem(`aegis_sync_queue:${userId}`),
    authenticated: api.isAuthenticated(),
  }), user.id);
  expect(local).toEqual({ cachedUser: null, syncQueue: null, authenticated: false });
});
