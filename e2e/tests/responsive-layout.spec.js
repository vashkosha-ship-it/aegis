// Visual layout invariants at the three supported classes of viewport.
// Screenshots are retained by Playwright on failure; assertions describe the
// actual regressions (clipping, missing navigation and unusable controls).

const { test, expect } = require('@playwright/test');

const USERNAME = process.env.E2E_USERNAME;
const PASSWORD = process.env.E2E_PASSWORD;

test.skip(!USERNAME || !PASSWORD, 'Не заданы E2E_USERNAME и E2E_PASSWORD');

const viewports = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

async function enterApplication(page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.locator('#authName').fill(USERNAME);
  await page.locator('#authPass').fill(PASSWORD);
  await page.locator('#authSubmitBtn').click();
  await expect(page.locator('#homeScreen')).toHaveClass(/\bactive\b/, { timeout: 20_000 });

  await page.waitForTimeout(900);
  const tour = page.locator('#tourOverlay');
  if (await tour.isVisible()) {
    await tour.locator('.tour-button--skip').click();
  }
}

for (const viewport of viewports) {
  test(`основной каркас не обрезается: ${viewport.name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await enterApplication(page);

    const geometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(geometry.scrollWidth, 'страница получила горизонтальную прокрутку')
      .toBeLessThanOrEqual(geometry.clientWidth + 1);

    if (viewport.width >= 1280) {
      await expect(page.locator('#sidebarNav')).toBeVisible();
      await expect(page.locator('#bottomNav')).toBeHidden();
    } else {
      await expect(page.locator('#bottomNav')).toBeVisible();
      await expect(page.locator('#sidebarNav')).toBeHidden();
    }

    const primaryTargets = page.locator('[data-screen]:visible, .btn-primary:visible, .button-primary:visible');
    const undersized = await primaryTargets.evaluateAll(elements => elements
      .filter(element => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && (box.width < 32 || box.height < 32);
      })
      .slice(0, 5)
      .map(element => `${element.tagName.toLowerCase()}#${element.id}.${element.className}`));
    expect(undersized, 'найдены слишком маленькие интерактивные элементы').toEqual([]);

    await context.close();
  });
}
