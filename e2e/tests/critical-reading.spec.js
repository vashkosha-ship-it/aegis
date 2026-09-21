const { test, expect } = require('@playwright/test');
const { login, fixtureBooks } = require('./helpers/session');

test.describe('@critical чтение PDF и EPUB', () => {
  test('PDF открывается по Range, ищется и сохраняет навигацию', async ({ page }) => {
    await login(page);
    const { pdf } = await fixtureBooks(page);
    expect(pdf, 'PDF-фикстура не создана').toBeTruthy();

    const range = await page.evaluate(async (bookId) => {
      const response = await fetch(api.books.pdfUrl(bookId), {
        headers: {
          Authorization: `Bearer ${api.tokens.access}`,
          Range: 'bytes=0-127',
        },
      });
      return {
        status: response.status,
        contentRange: response.headers.get('content-range'),
        acceptRanges: response.headers.get('accept-ranges'),
        bytes: Array.from(new Uint8Array(await response.arrayBuffer()).slice(0, 5)),
      };
    }, pdf.id);

    expect(range.status).toBe(206);
    expect(range.contentRange).toMatch(/^bytes 0-127\/\d+$/);
    expect(range.acceptRanges).toBe('bytes');
    expect(range.bytes).toEqual([37, 80, 68, 70, 45]); // %PDF-

    const search = await page.evaluate(() => api.library.searchBooks('cobalt'));
    const hit = search.hits.find((item) => item.title === 'E2E PDF Smoke');
    expect(hit).toBeTruthy();
    expect(hit.pages.some((item) => item.page === 1)).toBe(true);

    await page.evaluate(async (bookId) => {
      await loadBooksFromApi();
      openReader(bookId);
    }, pdf.id);
    await page.waitForFunction(() => pdfDoc && pdfDoc.numPages === 2);
    await page.evaluate(async () => {
      goToPage(2);
      await flushPendingProgress();
    });
    const progress = await page.evaluate(() => api.library.progress());
    expect(progress.find((item) => item.book_id === pdf.id)?.current_page).toBe(2);
  });

  test('EPUB отдаётся как архив и восстанавливает позицию/CFI', async ({ page }) => {
    await login(page);
    const { epub } = await fixtureBooks(page);
    expect(epub, 'EPUB-фикстура не создана').toBeTruthy();

    const payload = await page.evaluate(async (bookId) => {
      const response = await api.request(`/books/${bookId}/epub`, { raw: true });
      const bytes = new Uint8Array(await response.arrayBuffer());
      return {
        type: response.headers.get('content-type'),
        signature: Array.from(bytes.slice(0, 4)),
      };
    }, epub.id);
    expect(payload.type).toContain('application/epub+zip');
    expect(payload.signature).toEqual([80, 75, 3, 4]);

    await page.evaluate(async (bookId) => {
      await api.library.updateProgress(bookId, 2, 4);
      await loadBooksFromApi();
      await loadProgressFromApi(false);
      openReader(bookId);
    }, epub.id);
    await page.waitForFunction(() => epubBook && epubRendition && epubCurrentPage >= 2);
    const location = await page.evaluate(() => {
      const current = epubRendition.currentLocation();
      return { page: epubCurrentPage, cfi: current?.start?.cfi || '' };
    });
    expect(location.page).toBeGreaterThanOrEqual(2);
    expect(location.cfi).toMatch(/^epubcfi\(/);
  });
});
