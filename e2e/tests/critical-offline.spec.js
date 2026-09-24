const { test, expect } = require('@playwright/test');
const { login, fixtureBooks } = require('./helpers/session');

test.describe('PWA offline shell', () => {
  test.use({ serviceWorkers: 'allow' });

  test('@critical приложение полностью запускается без сети', async ({ page, context }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
      await page.reload({ waitUntil: 'networkidle' });
    }
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.api && window.offlineStorage && typeof state !== 'undefined');
    await expect(page.locator('#authScreen')).toHaveClass(/\bactive\b/);
    expect(await page.evaluate(() => ({
      controlled: Boolean(navigator.serviceWorker.controller),
      scriptsReady: typeof navigateTo === 'function' && typeof showConfirmModal === 'function',
    }))).toEqual({ controlled: true, scriptsReady: true });
    await context.setOffline(false);
  });
});

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
