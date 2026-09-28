const { test, expect } = require('@playwright/test');

test.describe('Публичный app shell', () => {
  test('гостевой запуск не оставляет необработанных ошибок', async ({ page, baseURL }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    const manifest = await page.request.get(new URL('/manifest.json', baseURL).toString());
    expect(manifest.ok()).toBe(true);
    expect(manifest.headers()['content-type']).toMatch(/manifest\+json|application\/json/);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#authScreen')).toHaveClass(/\bactive\b/);
    await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible();
    await expect(page.getByPlaceholder('Введите логин')).toBeVisible();
    await expect(page.getByPlaceholder('Введите пароль')).toBeVisible();

    expect(pageErrors, 'гостевой запуск не должен выбрасывать исключения').toEqual([]);
  });

  test('Service Worker не блокирует онлайн-запуск при временной ошибке', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const state = await page.evaluate(() => ({
      supported: 'serviceWorker' in navigator,
      ready: Boolean(window.api && window.offlineStorage),
    }));
    expect(state).toEqual({ supported: true, ready: true });
  });
});
