const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { credentials, login } = require('./helpers/session');

test.skip(
  !credentials.account.password || !process.env.AEGIS_E2E_MAIL_DIR,
  'Полный account E2E запускается только в изолированном CI-контуре',
);

async function waitForEmailCode(recipient, knownFiles) {
  const mailDir = process.env.AEGIS_E2E_MAIL_DIR;
  if (!mailDir) throw new Error('Не задан AEGIS_E2E_MAIL_DIR');
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const files = (await fs.readdir(mailDir)).filter((name) => name.endsWith('.txt'));
    for (const file of files) {
      if (knownFiles.has(file)) continue;
      const body = await fs.readFile(path.join(mailDir, file), 'utf8');
      if (!body.includes(`To: ${recipient}`)) continue;
      const match = body.match(/код подтверждения:\s*(\d{6})/i);
      if (match) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Письмо с кодом для ${recipient} не появилось`);
}

test('@critical смена пароля и email проходит полный цикл', async ({ page }) => {
  const account = credentials.account;
  await login(page, account);
  const temporaryPassword = `${account.password}-changed`;

  await page.evaluate(
    ({ currentPassword, newPassword }) => api.changePassword(currentPassword, newPassword),
    { currentPassword: account.password, newPassword: temporaryPassword },
  );
  const relogin = await page.evaluate(
    ({ username, password }) => api.login(username, password),
    { username: account.username, password: temporaryPassword },
  );
  expect(relogin.access_token).toBeTruthy();

  // Возвращаем исходный пароль: повторный запуск E2E остаётся идемпотентным.
  await page.evaluate(
    ({ currentPassword, newPassword }) => api.changePassword(currentPassword, newPassword),
    { currentPassword: temporaryPassword, newPassword: account.password },
  );
  await page.evaluate(
    ({ username, password }) => api.login(username, password),
    account,
  );

  const mailDir = process.env.AEGIS_E2E_MAIL_DIR;
  const knownFiles = new Set(
    (await fs.readdir(mailDir)).filter((name) => name.endsWith('.txt')),
  );
  const newEmail = 'account-changed@e2e.invalid';
  const requested = await page.evaluate(
    ({ email, password }) => api.requestEmailChange(email, password),
    { email: newEmail, password: account.password },
  );
  expect(requested.status).toBe('code_sent');

  const code = await waitForEmailCode(newEmail, knownFiles);
  const changed = await page.evaluate((otp) => api.confirmEmailChange(otp), code);
  expect(changed.email).toBe(newEmail);
});
