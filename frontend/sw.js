// Aegis Service Worker v2.0
const CACHE_NAME = 'aegis-cache-v318';

// Ресурсы для предварительного кэширования.
// Только лёгкая критичная статика для старта. Тяжёлые vendor-библиотеки
// (pdf.worker, epub, chart) НЕ прекэшируем — они кэшируются лениво при первом
// использовании, чтобы не замедлять первую загрузку приложения.
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/offline.css',
  '/offline.js',
  '/styles.css',
  '/desktop.css',
  '/ar-schemes.css',
  '/detail-ux.css',
  '/ux-accessibility.css',
  '/design-system.css',
  '/desktop-stability.css',
  '/css/layout-tokens.css',
  '/css/components/ar-menu.css',
  '/css/components/reader-toolbar.css',
  '/css/components/detail-assistant.css',
  '/css/components/responsive-shell.css',
  '/print-notes.css',
  '/dynamic-styles.js',
  '/handler-allowlist.js',
  '/inline-handlers.js',
  '/offline-storage.js',
  '/api.js',
  '/notes-crypto.js',
  '/annotations-core.js',
  '/annotations-ui.js',
  '/quiz-core.js',
  '/detail-training.js',
  '/also-read.js',
  '/app.js',
  '/app-state.js',
  '/user-features.js',
  '/library-home.js',
  '/reader-core.js',
  '/onboarding.js',
  '/ar-schemes-data.js',
  '/ar-schemes-renderers.js',
  '/ar-schemes-interactions.js',
  '/ar-schemes.js',
  '/assistant-chat.js',
  '/admin-screens.js',
  '/admin-users.js',
  '/admin-ai-operations.js',
  '/admin-books.js',
  '/admin-bulk-upload.js',
  '/auth-ui.js',
  '/account-settings.js',
  '/account-privacy.js',
  '/account-personalization.js',
  '/account-profile.js',
  '/favorite-categories.js',
  '/mylist-api.js',
  '/mylist-drag-drop.js',
  '/mylist-screen.js',
  '/custom-collections.js',
  '/book-discussion.js',
  '/reviews-core.js',
  '/finish-review.js',
  '/vendor-loader.js',
  '/icons.js',
  '/appearance-settings.js',
  '/offline-settings.js',
  '/loading-ui.js',
  '/core-utils.js',
  '/notifications.js',
  '/csp-helpers.js',
  '/dialogs.js',
  '/accessibility.js',
  '/pomodoro.js',
  '/keyboard-shortcuts.js',
  '/pwa-install.js',
  '/onboarding-tour.js',
  '/analytics.js',
  '/profile-insights.js',
  '/profile-screen.js',
  '/recommendations.js',
  '/home-continue.js',
  '/home-recommendations.js',
  '/home-books-goal.js',
  '/home-catalog.js',
  '/reading-goals.js',
  '/ai-responses.js',
  '/reader-ai-panel.js',
  '/navigation.js',
  '/catalog-filters.js',
  '/training-screen.js',
  '/reader-theme.js',
  '/reading-progress-sync.js',
  '/flashcards.js',
  '/reader-gestures.js',
  '/page-bookmarks.js',
  '/reader-toc.js',
  '/reader-open.js',
  '/offline-library.js',
  '/offline-profile.js',
  '/pull-to-refresh.js',
  '/reader-search.js',
  '/epub-annotations.js',
  '/reader-selection-ai.js',
  '/reader-lifecycle.js',
  '/reader-navigation.js',
  '/inline-boot.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// HTML and every CSS layer must enter the new cache as one complete shell.
// Activating a cache with only some of these files can combine a new DOM with
// an old responsive layer and visibly break the interface.
const APP_SHELL_URLS = [...PRECACHE_URLS];

function expectedContentTypes(pathname) {
  if (pathname === '/' || pathname.endsWith('.html')) return ['text/html'];
  if (pathname.endsWith('.css')) return ['text/css'];
  if (pathname.endsWith('.js')) return ['javascript'];
  if (pathname.endsWith('.json')) return ['application/json', 'application/manifest+json'];
  if (/\.(?:png|webp|jpe?g|svg|ico)$/i.test(pathname)) return ['image/'];
  return [];
}

async function validateStaticResponse(requestUrl, response) {
  const pathname = new URL(requestUrl, self.location.origin).pathname;
  if (!response || !response.ok) {
    throw new Error(`${pathname}: HTTP ${response?.status || 'нет ответа'}`);
  }
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const expected = expectedContentTypes(pathname);
  if (expected.length && !expected.some(type => contentType.includes(type))) {
    throw new Error(`${pathname}: неверный Content-Type ${contentType || 'отсутствует'}`);
  }
  if (pathname.endsWith('.js') || pathname.endsWith('.css')) {
    const body = (await response.clone().text()).trimStart();
    if (!body || /^<!doctype\s+html|^<html[\s>]/i.test(body)) {
      throw new Error(`${pathname}: вместо статического ресурса получен HTML`);
    }
  }
  return response;
}

async function fetchValidatedStatic(request) {
  const response = await fetch(request, { cache: 'no-store' });
  return validateStaticResponse(
    typeof request === 'string' ? request : request.url,
    response,
  );
}

async function cacheValidatedResponse(cache, request, response) {
  const validated = await validateStaticResponse(
    typeof request === 'string' ? request : request.url,
    response,
  );
  await cache.put(request, validated.clone());
  return validated;
}

// Установка: кэшируем статику
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      console.log('[SW] Кэширую статические ресурсы (' + CACHE_NAME + ')');
      // Сначала загружаем и проверяем весь shell в памяти. В кэш ничего не
      // попадает, пока каждый CSS/JS/HTML не подтвердил тип и содержимое.
      const responses = await Promise.all(
        APP_SHELL_URLS.map(async url => [url, await fetchValidatedStatic(url)])
      );
      await caches.delete(CACHE_NAME);
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(responses.map(([url, response]) => cache.put(url, response)));
    })()
  );
  // Применяем новый SW сразу — иначе обновления app.js/стилей «зависают»
  // до полного закрытия всех вкладок. Баннер «Обновить» остаётся как доп. сигнал.
  self.skipWaiting();
});

// Сообщение от страницы: применить обновление сейчас
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Активация: чистим старые кэши (включая v1)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Удаляю старый кэш:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// Перехват запросов
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isApiRequest = url.pathname.startsWith('/api/') || url.port === '8000';

  // API-запросы — пропускаем через сеть; фронт сам обработает ошибку
  // и покажет баннер «Нет связи» через свой online/offline-детектор.
  if (isApiRequest) {
    return;
  }

  // Локальные vendor-библиотеки (/vendor/) — неизменны, поэтому CACHE FIRST:
  // первый раз из сети + в кэш, далее мгновенно из кэша (быстрое открытие книг).
  const isSameOrigin = url.origin === self.location.origin;
  if (isSameOrigin && url.pathname.startsWith('/vendor/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetchValidatedStatic(event.request).then(async (response) => {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
          return response;
        });
      })
    );
    return;
  }

  // Навигационные запросы (запуск PWA, переход на страницу) — отдельная обработка
  // с таймаутом: если сеть «висит», не ждём бесконечно, а отдаём кэш, чтобы
  // установленное приложение не зависало на загрузочном экране.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      Promise.race([
        fetch(event.request).then(async (response) => {
          const validated = await validateStaticResponse(event.request.url, response);
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/index.html', validated.clone());
          return validated;
        }),
        new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
      ]).then((response) => {
        if (response) return response;
        // таймаут или нет ответа — берём из кэша index.html
        return caches.match('/index.html').then((c) => c || caches.match('/') || fetch(event.request));
      }).catch(() => {
        return caches.match('/index.html').then((c) => c || caches.match('/offline.html'));
      })
    );
    return;
  }

  // Собственные файлы приложения (свой origin) — NETWORK FIRST.
  // Иначе обновлённые app.js/styles.css/index.html не подхватываются:
  // SW отдаёт старую закэшированную версию навсегда. Теперь всегда берём
  // свежую версию из сети, а кэш используем только как офлайн-фолбэк.
  if (isSameOrigin) {
    event.respondWith(
      fetch(event.request).then(async (response) => {
        if (event.request.method !== 'GET') return response;
        const cache = await caches.open(CACHE_NAME);
        return cacheValidatedResponse(cache, event.request, response);
      }).catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.destination === 'document' ||
              event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/offline.html');
          }
          return new Response('Оффлайн', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        });
      })
    );
    return;
  }

  // Внешние библиотеки (CDN, шрифты) — CACHE FIRST (они не меняются).
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((response) => {
        // Кэшируем только успешные GET-запросы
        if (
          event.request.method === 'GET' &&
          response.status === 200 &&
          (url.hostname.includes('cdnjs.cloudflare.com') ||
           url.hostname.includes('cdn.jsdelivr.net') ||
           url.hostname.includes('fonts.googleapis.com') ||
           url.hostname.includes('fonts.gstatic.com'))
        ) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // Оффлайн-фолбэк: для HTML-страниц показываем offline.html
        // (раньше показывали index.html — но это сбивало с толку, потому что
        // index.html без сети сразу пытался дёргать API и юзер видел сломанный UI).
        if (event.request.destination === 'document' ||
            event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/offline.html');
        }
        // Для остальных типов (картинки, шрифты) — пустой 503
        return new Response('Оффлайн', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      });
    })
  );
});

// Сообщения от приложения (для обновления SW без перезагрузки)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
