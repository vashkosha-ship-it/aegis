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

  // У свежей учётной записи поверх интерфейса открывается одноразовый тур.
  // Проверяем его штатное закрытие, иначе он честно перехватывает клики.
  await page.waitForTimeout(900);
  const tour = page.locator('#tourOverlay');
  if (await tour.isVisible()) {
    await expect(tour).toHaveAttribute('role', 'dialog');
    await tour.locator('.tour-button--skip').click();
    await expect(tour).toHaveCount(0);
  }

  const catalogTotal = await page.evaluate(async () => {
    const data = await api.books.list({ per_page: 1, page: 1 });
    return data.total;
  });
  expect(catalogTotal, 'авторизованный каталог не отвечает').toBeGreaterThanOrEqual(0);

  // Клик проходит через CSP-совместимый data-onclick-диспетчер.
  await page.locator('.bottom-nav [data-screen="profile"]').click();
  await expect(page.locator('#profileScreen')).toHaveClass(/\bactive\b/);
  await expect(page.locator('#profileDisplayName')).not.toHaveText('Пользователь');

  await page.locator('#btnOpenSettings').click();
  await expect(page.locator('#settingsScreen')).toHaveClass(/\bactive\b/);
  await expect(page.locator('#settingsContent')).not.toBeEmpty();
});
