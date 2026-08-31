// Аутентификация глазами браузера.
//
// Эти проверки закрывают разрыв, из-за которого мы несколько раз выкатывали
// нерабочее: код был правильным, тесты на бэкенде проходили, а на сайте
// ничего не работало. Причины были снаружи Python — не доехавший конфиг
// nginx, не подключённый скрипт, флаги cookie. Увидеть такое можно только
// настоящим браузером на развёрнутом сайте.

const { test, expect } = require('@playwright/test');

const USERNAME = process.env.E2E_USERNAME;
const PASSWORD = process.env.E2E_PASSWORD;

const REFRESH_COOKIE = 'aegis_refresh';
const CSRF_COOKIE = 'aegis_csrf';

test.skip(
  !USERNAME || !PASSWORD,
  'Не заданы E2E_USERNAME и E2E_PASSWORD — проверки входа пропущены'
);

// Последовательный режим: при неудачном входе остальные тесты пропускаются, а
// не повторяют ту же попытку. Иначе одна неверная учётка превращается в
// десяток падений, а сервер справедливо блокирует адрес за перебор — и
// разбираться приходится уже с двумя проблемами вместо одной.
test.describe.configure({ mode: 'serial' });

/** Войти через API в контексте страницы, чтобы cookie осели в браузере. */
async function login(page) {
  const response = await page.evaluate(async ({ username, password }) => {
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    } catch (e) {
      return { status: 0, body: { detail: String(e) } };
    }
  }, { username: USERNAME, password: PASSWORD });

  if (response.status === 401) {
    throw new Error(
      `Учётная запись «${USERNAME}» не подходит: сервер ответил "неверные ` +
      'данные". Проверьте, что пользователь создан, подтверждён по email и ' +
      'одобрен, а пароль в E2E_PASSWORD совпадает.'
    );
  }
  if (response.status === 429) {
    throw new Error(
      'Адрес заблокирован за неудачные попытки входа: ' +
      `${response.body?.detail}. Это правильное поведение сервера — ` +
      'дождитесь окончания блокировки и запустите снова с верным паролем.'
    );
  }
  if (response.status === 0) {
    throw new Error(
      `Запрос к API не выполнился: ${response.body?.detail}. ` +
      'Проверьте E2E_BASE_URL и доступность сайта.'
    );
  }

  expect(response.status, `вход не удался: ${JSON.stringify(response.body)}`).toBe(200);
  return response.body;
}

async function cookieByName(page, name) {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === name);
}

test.describe('Вход', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('в теле ответа нет refresh-токена', async ({ page }) => {
    const body = await login(page);

    expect(
      Object.keys(body),
      'refresh-токен в JSON обесценивает httpOnly-cookie: скрипт прочитает ' +
      'его прямо из ответа'
    ).not.toContain('refresh_token');
    expect(body).toHaveProperty('access_token');
  });

  test('refresh-cookie недоступна скриптам', async ({ page }) => {
    await login(page);

    const cookie = await cookieByName(page, REFRESH_COOKIE);
    expect(cookie, 'cookie с refresh-токеном не выставлена').toBeTruthy();
    expect(cookie.httpOnly, 'без httpOnly токен читается через document.cookie')
      .toBe(true);
    expect(cookie.secure, 'без Secure cookie уйдёт по открытому HTTP').toBe(true);
    expect(['Lax', 'Strict'], `SameSite=${cookie.sameSite} допускает отправку с чужого сайта`)
      .toContain(cookie.sameSite);
  });

  test('document.cookie не содержит refresh-токен', async ({ page }) => {
    await login(page);

    const visible = await page.evaluate(() => document.cookie);
    expect(visible, 'токен виден JavaScript — защита не работает')
      .not.toContain(REFRESH_COOKIE);
  });

  test('CSRF-cookie доступна скриптам: её надо продублировать в заголовке', async ({ page }) => {
    await login(page);

    const cookie = await cookieByName(page, CSRF_COOKIE);
    expect(cookie, 'CSRF-cookie не выставлена').toBeTruthy();
    // Эта, наоборот, обязана читаться: в том и смысл double-submit — чужой
    // сайт отправит cookie автоматически, но значение прочитать не сможет.
    expect(cookie.httpOnly).toBe(false);
  });
});

test.describe('Обновление сессии', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await login(page);
  });

  test('обновление работает и не отдаёт refresh в теле', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const csrf = document.cookie
        .split('; ')
        .find((c) => c.startsWith('aegis_csrf='))
        ?.split('=')[1];

      const r = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrf || '' },
        credentials: 'include',
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    });

    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body).toHaveProperty('access_token');
    expect(Object.keys(result.body)).not.toContain('refresh_token');
  });

  test('без CSRF-заголовка обновление отклоняется', async ({ page }) => {
    // Так выглядел бы запрос с чужого сайта: cookie браузер отправит сам,
    // а значение CSRF-токена злоумышленник прочитать не может.
    const status = await page.evaluate(async () => {
      const r = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      return r.status;
    });

    expect(status, 'обновление без CSRF-заголовка прошло').toBe(403);
  });

  test('с неверным CSRF-заголовком обновление отклоняется', async ({ page }) => {
    const status = await page.evaluate(async () => {
      const r = await fetch('/api/auth/refresh', {
        method: 'POST',
        // Значение только из latin-1: в заголовки HTTP другое не помещается,
        // и браузер отвергнет запрос ещё до отправки — проверять будет нечего.
        headers: { 'X-CSRF-Token': 'forged-value-not-the-real-token' },
        credentials: 'include',
      });
      return r.status;
    });

    expect(status).toBe(403);
  });

  test('заголовок X-Client-Type больше ничего не даёт', async ({ page }) => {
    // Раньше он заставлял сервер вернуть пару токенов в теле — то есть обойти
    // httpOnly одной строкой. Ветка удалена, проверяем, что не вернулась.
    const result = await page.evaluate(async () => {
      const csrf = document.cookie
        .split('; ')
        .find((c) => c.startsWith('aegis_csrf='))
        ?.split('=')[1];

      const r = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrf || '', 'X-Client-Type': 'mobile' },
        credentials: 'include',
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    });

    if (result.status === 200) {
      expect(Object.keys(result.body)).not.toContain('refresh_token');
    } else {
      // Заголовок не в списке разрешённых CORS — тоже приемлемо
      expect([400, 403]).toContain(result.status);
    }
  });
});

test.describe('Выход', () => {
  test('после выхода сессию нельзя обновить', async ({ page }) => {
    await page.goto('/');
    await login(page);

    const logout = await page.evaluate(async () => {
      const csrf = document.cookie
        .split('; ')
        .find((c) => c.startsWith('aegis_csrf='))
        ?.split('=')[1];

      const r = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrf || '' },
        credentials: 'include',
      });
      return r.status;
    });
    expect(logout).toBe(204);

    const afterLogout = await page.evaluate(async () => {
      const r = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      return r.status;
    });

    expect(
      [401, 403],
      'сессия продолжает работать после выхода — токен не отозван'
    ).toContain(afterLogout);
  });

  test('выход без CSRF-заголовка отклоняется', async ({ page }) => {
    await page.goto('/');
    await login(page);

    const status = await page.evaluate(async () => {
      const r = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      return r.status;
    });

    expect(status, 'чужой сайт может завершить чужую сессию').toBe(403);
  });
});

test.describe('CORS', () => {
  test('запрос с постороннего origin не получает доступа', async ({ page }) => {
    await page.goto('/');
    await login(page);

    // Открываем страницу на другом домене и оттуда пробуем дотянуться до API
    // с учётными данными. Браузер должен запретить чтение ответа: наш origin
    // в списке разрешённых, чужой — нет.
    const evil = await page.context().newPage();
    await evil.goto('https://example.com', { waitUntil: 'domcontentloaded' });

    const result = await evil.evaluate(async (apiBase) => {
      try {
        const r = await fetch(`${apiBase}/api/auth/me`, {
          credentials: 'include',
        });
        return { ok: true, status: r.status };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }, new URL(page.url()).origin);

    await evil.close();

    expect(
      result.ok,
      `чужой сайт прочитал ответ API (статус ${result.status}) — CORS открыт слишком широко`
    ).toBe(false);
  });
});
