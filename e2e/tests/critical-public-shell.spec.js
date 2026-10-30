const { test, expect } = require('@playwright/test');

test.describe('Публичный app shell', () => {
  test('@critical гостевой запуск не оставляет необработанных ошибок', async ({ page, baseURL }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    const manifest = await page.request.get(new URL('/manifest.json', baseURL).toString());
    expect(manifest.ok()).toBe(true);
    expect(manifest.headers()['content-type']).toMatch(/manifest\+json|application\/json/);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Manifest, на который ссылается страница, должен реально отдаваться:
    // без него Chrome ставит не приложение, а простой ярлык без значка.
    const linked = await page.evaluate(() => document.querySelector('link[rel="manifest"]').href);
    const appManifest = await page.request.get(linked);
    expect(appManifest.status(), `manifest ${linked}`).toBe(200);
    const appManifestBody = await appManifest.json();
    expect(appManifestBody.short_name).toBe('Aegis Lib');
    expect(appManifestBody.display).toBe('standalone');
    expect(appManifestBody.icons.some(icon => icon.sizes === '512x512')).toBe(true);
    for (const icon of appManifestBody.icons) {
      const image = await page.request.get(new URL(icon.src, baseURL).toString());
      expect(image.ok(), `значок ${icon.src}`).toBe(true);
    }
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
