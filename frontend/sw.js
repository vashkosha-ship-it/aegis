// Aegis Service Worker v2.0
const CACHE_NAME = 'aegis-cache-v184';

// Ресурсы для предварительного кэширования.
// Только лёгкая критичная статика для старта. Тяжёлые vendor-библиотеки
// (pdf.worker, epub, chart) НЕ прекэшируем — они кэшируются лениво при первом
// использовании, чтобы не замедлять первую загрузку приложения.
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/styles.css',
  '/api.js',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Установка: кэшируем статику
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Кэширую статические ресурсы (v3)');
      // Кэшируем поштучно: один сбойный файл не ломает весь прекэш
      return Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Пропущен ресурс при кэшировании:', url, err.message);
          })
        )
      );
    })
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
        return fetch(event.request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
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
        fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
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
      fetch(event.request).then((response) => {
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
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