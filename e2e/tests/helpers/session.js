const { expect } = require('@playwright/test');

const credentials = {
  reader: {
    username: process.env.E2E_USERNAME || 'e2e_reader',
    password: process.env.E2E_PASSWORD,
  },
  account: {
    username: process.env.E2E_ACCOUNT_USERNAME || 'e2e_account',
    password: process.env.E2E_ACCOUNT_PASSWORD,
  },
  admin: {
    username: process.env.E2E_ADMIN_USERNAME || 'e2e_admin',
    password: process.env.E2E_ADMIN_PASSWORD,
    recoveryCode: process.env.E2E_ADMIN_RECOVERY_CODE,
  },
};

async function openApp(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.api && typeof state !== 'undefined' && window.offlineStorage);
}

async function login(page, account = credentials.reader) {
  await openApp(page);
  const result = await page.evaluate(
    ({ username, password }) => window.api.login(username, password),
    account,
  );
  expect(result.mfa_required).not.toBe(true);
  const user = await page.evaluate(() => window.api.me());
  await page.evaluate((current) => {
    state.currentUser = {
      id: current.id,
      name: current.username,
      email: current.email,
      role: current.role,
      full_name: current.full_name,
      department: current.department,
    };
    cacheUserForOffline(state.currentUser);
  }, user);
  return user;
}

async function loginAdmin(page) {
  await openApp(page);
  const challenge = await page.evaluate(
    ({ username, password }) => window.api.login(username, password),
    credentials.admin,
  );
  expect(challenge.mfa_required).toBe(true);
  await page.evaluate(
    ({ token, code }) => window.api.verifyAdminMfa(token, code),
    { token: challenge.mfa_token, code: credentials.admin.recoveryCode },
  );
  const user = await page.evaluate(() => window.api.me());
  expect(user.role).toBe('admin');
  return user;
}

async function fixtureBooks(page) {
  return page.evaluate(async () => {
    const result = await window.api.books.list({ per_page: 50, page: 1 });
    const pdf = result.items.find((book) => book.title === 'E2E PDF Smoke');
    const epub = result.items.find((book) => book.title === 'E2E EPUB Smoke');
    return { pdf, epub };
  });
}

module.exports = { credentials, openApp, login, loginAdmin, fixtureBooks };
