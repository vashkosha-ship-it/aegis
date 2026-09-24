const { test, expect } = require('@playwright/test');
const { login, loginAdmin, openApp, fixtureBooks } = require('./helpers/session');

const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
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

async function expectInteractiveControlsInsideViewport(page, screenSelector, label) {
  const escaped = await page.locator(screenSelector).evaluate((screen) => {
    const isInsideHorizontalScroller = (element) => {
      for (let parent = element.parentElement; parent && parent !== screen; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (['auto', 'scroll'].includes(style.overflowX) && parent.scrollWidth > parent.clientWidth) {
          return true;
        }
      }
      return false;
    };
    return [...screen.querySelectorAll('button, a, input, select, textarea')]
      .filter((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden'
          && box.width > 0 && box.height > 0 && !isInsideHorizontalScroller(element)
          && (box.left < -1 || box.right > innerWidth + 1);
      })
      .slice(0, 10)
      .map((element) => `${element.tagName.toLowerCase()}#${element.id}.${element.className}`);
  });
  expect(escaped, `${label}: controls escaped the viewport`).toEqual([]);
}

test.describe('@critical responsive layout', () => {
  test('navigation, core screens, book details and assistant remain stable', async ({ page }) => {
    await page.setViewportSize(viewports[0]);
    await login(page);
    const { pdf } = await fixtureBooks(page);
    expect(pdf, 'PDF fixture was not created').toBeTruthy();

    await page.evaluate(async () => {
      await loadBooksFromApi();
      navigateTo('home');
      localStorage.setItem('aegis_tour_done', '1');
    });
    await page.waitForTimeout(750);
    const tour = page.locator('#tourOverlay');
    if (await tour.isVisible()) {
      await tour.locator('.tour-button--skip').click();
    }

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(50);

      await page.evaluate(() => navigateTo('home'));
      const sidebar = page.locator('#sidebarNav');
      if (viewport.width >= 1280) {
        await expect(sidebar).toBeVisible();
        const inactiveBackground = await page
          .locator('#sidebarNav .sidebar-item[data-screen="mylist"]')
          .evaluate((element) => getComputedStyle(element).backgroundColor);
        expect(
          inactiveBackground,
          `${viewport.width}px: native button background leaked into sidebar`,
        ).toBe('rgba(0, 0, 0, 0)');
      } else {
        await expect(sidebar).toBeHidden();
        await expect(page.locator('#bottomNav')).toBeVisible();
      }
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
          descriptionText: rect('#detailScreen .detail-desc'),
          descriptionInnerWidth: (() => {
            const section = document.querySelector('#detailScreen .detail-description-section');
            const style = getComputedStyle(section);
            return section.clientWidth
              - parseFloat(style.paddingLeft)
              - parseFloat(style.paddingRight);
          })(),
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
      expect(
        Math.abs(detail.descriptionText.width - detail.descriptionInnerWidth),
        `${viewport.width}px: description text does not fill the card`,
      ).toBeLessThanOrEqual(2);
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
      const headerCenter = assistant.header.left + assistant.header.width / 2;
      const bodyCenter = assistant.body.left + assistant.body.width / 2;
      expect(Math.abs(headerCenter - bodyCenter)).toBeLessThanOrEqual(1);
      expect(assistant.toolbar.left).toBeGreaterThanOrEqual(assistant.header.left);
      expect(assistant.toolbar.right).toBeLessThanOrEqual(assistant.header.right + 1);
      await expectNoHorizontalOverflow(page, `assistant at ${viewport.width}px`);

      for (const screen of ['mylist', 'training', 'profile', 'settings', 'onboarding']) {
        await page.evaluate((name) => navigateTo(name), screen);
        const selector = `#${screen}Screen`;
        await expect(page.locator(selector)).toHaveClass(/\bactive\b/);
        await expectNoHorizontalOverflow(page, `${screen} at ${viewport.width}px`);
        await expectInteractiveControlsInsideViewport(
          page,
          selector,
          `${screen} at ${viewport.width}px`,
        );
      }

      if (viewport.width === 390) {
        await page.evaluate((bookId) => openReader(bookId), pdf.id);
        await expect(page.locator('#readerScreen')).toHaveClass(/\bactive\b/);
        await expect(page.locator('#btnReaderMore')).toBeVisible();
        await expect(page.locator('#readerToolbarSecondary')).toBeHidden();
        await expectInteractiveControlsInsideViewport(page, '#readerScreen', 'reader at 390px');
        await page.locator('#btnReaderMore').click();
        await expect(page.locator('#readerToolbarSecondary')).toBeVisible();
        const menu = await page.locator('#readerToolbarSecondary').boundingBox();
        expect(menu.x).toBeGreaterThanOrEqual(0);
        expect(menu.x + menu.width).toBeLessThanOrEqual(viewport.width + 1);
        await page.evaluate(() => closeReader());
      }
    }
  });

  test('authentication and admin screens stay within supported widths', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page);
    await expect(page.locator('#authScreen')).toHaveClass(/\bactive\b/);
    await expectNoHorizontalOverflow(page, 'auth at 390px');
    await expectInteractiveControlsInsideViewport(page, '#authScreen', 'auth at 390px');

    await loginAdmin(page);
    for (const viewport of [viewports[0], viewports[3]]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => navigateTo('admin'));
      await expect(page.locator('#adminScreen')).toHaveClass(/\bactive\b/);
      await expectNoHorizontalOverflow(page, `admin at ${viewport.width}px`);
      await expectInteractiveControlsInsideViewport(
        page,
        '#adminScreen',
        `admin at ${viewport.width}px`,
      );
    }
  });

  test('themes, icon controls and dialogs remain accessible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await page.evaluate(() => {
      localStorage.setItem('aegis_tour_done', '1');
      document.getElementById('tourOverlay')?.remove();
    });

    const auditTheme = async theme => page.evaluate(selectedTheme => {
      setAppTheme(selectedTheme, false);
      const parse = value => {
        const normalized = value.trim();
        const parts = normalized.startsWith('#')
          ? [1, 3, 5].map(index => parseInt(normalized.slice(index, index + 2), 16))
          : normalized.match(/[\d.]+/g).slice(0, 3).map(Number);
        return parts.map(channel => channel / 255);
      };
      const luminance = value => parse(value)
        .map(channel => channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4)
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const ratio = (foreground, background) => {
        const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
        return (values[0] + 0.05) / (values[1] + 0.05);
      };
      const root = getComputedStyle(document.documentElement);
      const missingNames = [...document.querySelectorAll('button')]
        .filter(button => {
          const style = getComputedStyle(button);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          const name = button.getAttribute('aria-label')
            || button.getAttribute('aria-labelledby')
            || button.title
            || button.textContent.trim();
          return !name;
        })
        .map(button => button.id || button.className);
      return {
        mutedOnCard: ratio(root.getPropertyValue('--text-muted'), root.getPropertyValue('--bg-card')),
        accentOnCard: ratio(root.getPropertyValue('--accent'), root.getPropertyValue('--bg-card')),
        missingNames,
      };
    }, theme);

    for (const theme of ['dark', 'light']) {
      const result = await auditTheme(theme);
      expect(result.mutedOnCard, `${theme}: muted text contrast`).toBeGreaterThanOrEqual(4.5);
      expect(result.accentOnCard, `${theme}: accent text contrast`).toBeGreaterThanOrEqual(4.5);
      expect(result.missingNames, `${theme}: unnamed visible icon controls`).toEqual([]);
    }

    const opener = page.locator('.btn-shortcuts-icon');
    await opener.click();
    const dialog = page.locator('#shortcutsModal[role="dialog"][aria-modal="true"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':focus')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });
});
