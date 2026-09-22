const { test, expect } = require('@playwright/test');
const { login, fixtureBooks } = require('./helpers/session');

const viewports = [
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];

async function expectNoHorizontalOverflow(page, label) {
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    geometry.scrollWidth,
    `${label}: page has horizontal overflow ${JSON.stringify(geometry)}`,
  ).toBeLessThanOrEqual(geometry.clientWidth + 1);
}

test.describe('@critical desktop layout', () => {
  test('sidebar, book details and assistant remain stable at desktop widths', async ({ page }) => {
    await page.setViewportSize(viewports[0]);
    await login(page);
    const { pdf } = await fixtureBooks(page);
    expect(pdf, 'PDF fixture was not created').toBeTruthy();

    await page.evaluate(async () => {
      await loadBooksFromApi();
      navigateTo('home');
    });

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(50);

      await page.evaluate(() => navigateTo('home'));
      const sidebar = page.locator('#sidebarNav');
      await expect(sidebar).toBeVisible();

      const inactiveBackground = await page
        .locator('#sidebarNav .sidebar-item[data-screen="mylist"]')
        .evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(
        inactiveBackground,
        `${viewport.width}px: native button background leaked into sidebar`,
      ).toBe('rgba(0, 0, 0, 0)');
      await expectNoHorizontalOverflow(page, `home at ${viewport.width}px`);

      await page.evaluate(({ bookId, title }) => {
        const book = state.books.find((item) => item.id === bookId);
        book.title = title;
        state.currentBook = book;
        currentBookId = bookId;
        navigateTo('detail');
        renderBookInfo();
      }, {
        bookId: pdf.id,
        title: 'Практическое руководство по расследованию сложных инцидентов информационной безопасности',
      });

      await expect(page.locator('#detailScreen')).toHaveClass(/\bactive\b/);
      await expect(page.locator('.detail-title')).toBeVisible();

      const detail = await page.evaluate(() => {
        const rect = (selector) => {
          const box = document.querySelector(selector).getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
            width: box.width,
            height: box.height,
          };
        };
        return {
          content: rect('#detailScreen .detail-content'),
          hero: rect('#detailScreen .detail-hero'),
          title: rect('#detailScreen .detail-title'),
          description: rect('#detailScreen .detail-description-section'),
        };
      });

      expect(
        detail.title.width,
        `${viewport.width}px: title column collapsed`,
      ).toBeGreaterThan(240);
      expect(
        detail.description.top,
        `${viewport.width}px: description was placed beside the hero`,
      ).toBeGreaterThanOrEqual(detail.hero.bottom - 1);
      expect(detail.content.width).toBeLessThanOrEqual(1201);
      await expectNoHorizontalOverflow(page, `book detail at ${viewport.width}px`);

      await page.evaluate(() => navigateTo('assistant'));
      await expect(page.locator('#assistantScreen')).toHaveClass(/\bactive\b/);

      const assistant = await page.evaluate(() => {
        const box = (selector) => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            width: rect.width,
          };
        };
        return {
          header: box('#assistantScreen .top-header'),
          body: box('#assistantScreen .assistant-body'),
          toolbar: box('#assistantScreen .static-style-134'),
        };
      });

      expect(assistant.header.width).toBeLessThanOrEqual(961);
      expect(assistant.body.width).toBeLessThanOrEqual(961);
      expect(Math.abs(assistant.header.left - assistant.body.left)).toBeLessThanOrEqual(1);
      expect(assistant.toolbar.left).toBeGreaterThanOrEqual(assistant.header.left);
      expect(assistant.toolbar.right).toBeLessThanOrEqual(assistant.header.right + 1);
      await expectNoHorizontalOverflow(page, `assistant at ${viewport.width}px`);
    }
  });
});
