// Конфигурация браузерных проверок.
//
// Тесты работают против РАЗВЁРНУТОГО сайта, а не против локальной сборки.
// Так и задумано: проверяется связка целиком — nginx, заголовки CSP, флаги
// httpOnly и Secure у cookie, поведение при кросс-доменном запросе. Локально,
// где фронт открывается статикой без nginx, ничего из этого нет, и тест
// проходил бы при сломанном сервере.
//
// Запуск:
//   cd e2e
//   npm install
//   npm run install-browsers
//   E2E_BASE_URL=https://aegis-sec-library.ru \
//   E2E_USERNAME=... E2E_PASSWORD=... npm test
//
// Учётная запись нужна отдельная, для проверок. Обычным аккаунтом ходить не
// стоит: тесты выполняют выход, то есть отзывают действующие сессии.

const { defineConfig, devices } = require('@playwright/test');

const baseURL = process.env.E2E_BASE_URL;

if (!baseURL) {
  throw new Error(
    'Не задан E2E_BASE_URL — адрес проверяемого сайта.\n' +
    'Пример: E2E_BASE_URL=https://aegis-sec-library.ru npm test'
  );
}

module.exports = defineConfig({
  testDir: './tests',
  // Последовательно: тесты входят и выходят одной учётной записью, параллельный
  // запуск отзывал бы сессии друг друга.
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL,
    // Скриншот и трасса только при падении: разбираться по ним приходится
    // редко, а место занимают заметно.
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    ignoreHTTPSErrors: false,
    // Service worker сайта перехватывает запросы и умеет отвечать из кэша.
    // Для проверок это лишний слой: заголовки и cookie надо смотреть на
    // настоящем ответе сервера, а не на подстановке из офлайн-хранилища.
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
