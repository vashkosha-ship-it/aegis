// CSP и загрузка интерфейса.
//
// Отдельно от аутентификации: этим проверкам не нужна учётная запись, они
// работают всегда. Ловят ровно те поломки, которые мы дважды находили руками —
// не доехавший до nginx снипет с политикой и не подключённый реестр
// обработчиков, из-за которого интерфейс перестаёт отзываться на нажатия.

const { test, expect } = require('@playwright/test');

test.describe('Заголовки безопасности', () => {
  test('CSP запрещает инлайновые скрипты и eval', async ({ page }) => {
    const response = await page.goto('/');
    const headers = response.headers();

    const csp = headers['content-security-policy'];
    expect(csp, 'политика не отдаётся').toBeTruthy();

    const scriptSrc = csp
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith('script-src'));

    expect(scriptSrc, 'в политике нет script-src').toBeTruthy();
    expect(
      scriptSrc,
      'внедрённый в DOM текст сможет выполниться как скрипт'
    ).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  test('режим наблюдения выключен', async ({ page }) => {
    const response = await page.goto('/');
    expect(
      response.headers()['content-security-policy-report-only'],
      'Report-Only остался включённым — переход не довели до конца'
    ).toBeUndefined();
  });

  test('прочие заголовки на месте', async ({ page }) => {
    const response = await page.goto('/');
    const headers = response.headers();

    expect(headers['strict-transport-security']).toContain('max-age=');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toContain('strict-origin');
  });
});

test.describe('Загрузка интерфейса', () => {
  test('страница открывается без нарушений политики', async ({ page }) => {
    const violations = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (/Content Security Policy|Refused to/i.test(text)) {
        violations.push(text);
      }
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    expect(
      violations,
      `политика блокирует собственный код сайта:\n${violations.join('\n')}`
    ).toHaveLength(0);
  });

  test('реестр обработчиков загружен и не пуст', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const registry = await page.evaluate(() => window.AEGIS_ALLOWED_HANDLERS);

    expect(
      registry,
      'реестр не подключён — диспетчер отклонит все обработчики, и интерфейс ' +
      'перестанет реагировать на нажатия'
    ).toBeTruthy();
    expect(Object.keys(registry)).toContain('click');
    expect(registry.click.length).toBeGreaterThan(50);
  });

  test('обработчики error ограничены отдельным узким списком', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const registry = await page.evaluate(() => window.AEGIS_ALLOWED_HANDLERS);

    // error срабатывает без действия пользователя: достаточно вставить в DOM
    // <img src=x data-onerror="...">. Поэтому список тут должен быть коротким.
    expect(registry.error, 'нет отдельного списка для error').toBeTruthy();
    expect(
      registry.error.length,
      `в списке автоматических обработчиков ${registry.error.length} функций — ` +
      'слишком много для события, которое выполняется само'
    ).toBeLessThanOrEqual(2);
  });

  test('внедрённая разметка не может позвать произвольную функцию', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    // Так выглядит XSS через innerHTML при нашей CSP: скрипта нет, есть
    // атрибут. Диспетчер обязан отказать, потому что имени нет в реестре.
    const called = await page.evaluate(async () => {
      window.__e2eProbeCalled = false;
      window.__e2eProbe = () => { window.__e2eProbeCalled = true; };

      const div = document.createElement('div');
      div.innerHTML = '<button id="e2e-probe" data-onclick="__e2eProbe()">x</button>';
      document.body.appendChild(div);
      document.getElementById('e2e-probe').click();

      await new Promise((r) => setTimeout(r, 100));
      return window.__e2eProbeCalled;
    });

    expect(
      called,
      'разметка из innerHTML вызвала функцию вне реестра — барьер не работает'
    ).toBe(false);
  });

  test('все подключённые скрипты отдаются', async ({ page }) => {
    const failed = [];
    page.on('response', (response) => {
      if (response.url().endsWith('.js') && response.status() >= 400) {
        failed.push(`${response.url()} → ${response.status()}`);
      }
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    expect(failed, `скрипты не загрузились:\n${failed.join('\n')}`).toHaveLength(0);
  });
});
