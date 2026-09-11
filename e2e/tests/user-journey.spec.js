// Основной пользовательский путь на реально развёрнутом сайте.
// В отличие от API-проверок auth.spec.js этот сценарий проходит через форму,
// диспетчер data-onclick и экраны приложения так же, как обычный пользователь.

const { test, expect } = require('@playwright/test');

const USERNAME = process.env.E2E_USERNAME;
const PASSWORD = process.env.E2E_PASSWORD;

test.skip(
  !USERNAME || !PASSWORD,
  'Не заданы E2E_USERNAME и E2E_PASSWORD — пользовательский путь пропущен'
);

test('вход, каталог, профиль и настройки работают вместе', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('#authScreen')).toHaveClass(/\bactive\b/);

  await page.locator('#authName').fill(USERNAME);
  await page.locator('#authPass').fill(PASSWORD);
  await page.locator('#authSubmitBtn').click();

  await expect(page.locator('#homeScreen')).toHaveClass(/\bactive\b/, {
    timeout: 20_000,
  });

  const catalogTotal = await page.evaluate(async () => {
    const data = await api.books.list({ per_page: 1, page: 1 });
    return data.total;
  });
  expect(catalogTotal, 'авторизованный каталог не отвечает').toBeGreaterThanOrEqual(0);

  // Клик проходит через CSP-совместимый data-onclick-диспетчер.
  await page.locator('#avatarHome').click();
  await expect(page.locator('#profileScreen')).toHaveClass(/\bactive\b/);
  await expect(page.locator('#profileDisplayName')).not.toHaveText('Пользователь');

  await page.locator('#btnOpenSettings').click();
  await expect(page.locator('#settingsScreen')).toHaveClass(/\bactive\b/);
  await expect(page.locator('#settingsContent')).not.toBeEmpty();
});
