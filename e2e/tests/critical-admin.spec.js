const { test, expect } = require('@playwright/test');
const { loginAdmin, fixtureBooks } = require('./helpers/session');

test.skip(!process.env.E2E_ADMIN_PASSWORD, 'Административный E2E требует временного CI-администратора');

test('@critical администратор загружает книгу, запускает задачи и видит audit trail', async ({ page }) => {
  await loginAdmin(page);
  const { pdf: fixturePdf } = await fixtureBooks(page);
  expect(fixturePdf).toBeTruthy();

  const created = await page.evaluate(() => api.request('/books', {
    method: 'POST',
    headers: { 'X-Request-ID': 'e2e-admin-create' },
    body: {
      title: `E2E Admin Upload ${Date.now()}`,
      author: 'Aegis CI',
      categories: ['E2E'],
      description: '',
      icon: '🧪',
      file_format: 'pdf',
    },
  }));

  const upload = await page.evaluate(async ({ sourceBookId, targetBookId }) => {
    const source = await api.books.fetchPdfBytes(sourceBookId);
    const file = new File([source], 'e2e-upload.pdf', { type: 'application/pdf' });
    return api.books.uploadPdf(targetBookId, file);
  }, { sourceBookId: fixturePdf.id, targetBookId: created.id });
  expect(upload.kind).toBe('pdf');
  expect(upload.indexing_status).toBe('queued');

  const reindex = await page.evaluate((bookId) => api.library.reindexBook(bookId), created.id);
  expect(reindex.status).toBe('queued');

  const background = await page.evaluate(() => api.library.startDescriptionGeneration());
  expect(background.started).toBe(true);
  expect(background.job.status).toBe('queued');

  const logs = await page.evaluate(() => api.library.adminLogs(100));
  const actions = new Set(logs.map((entry) => entry.action));
  for (const action of [
    'book_create',
    'pdf_upload',
    'book_reindex',
    'book_descriptions_generate',
  ]) {
    expect(actions, `в audit trail нет ${action}`).toContain(action);
  }
  const createLog = logs.find((entry) => entry.action === 'book_create' && entry.target === `book:${created.id}`);
  expect(createLog).toMatchObject({
    result: 'success',
    request_id: 'e2e-admin-create',
  });
  expect(createLog.ip_address).toBeTruthy();

  await page.evaluate((bookId) => api.books.delete(bookId), created.id);
});
