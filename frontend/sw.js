// Aegis Service Worker v2.0
const CACHE_NAME = 'aegis-cache-69';

// Ресурсы для предварительного кэширования
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/styles.css',
  '/api.js',
  '/app.js',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap',
];

// Установка: кэшируем статику
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Кэширую статические ресурсы (v2)');
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Не удалось закэшировать некоторые ресурсы:', err);
      });
    })
  );
  self.skipWaiting();
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

  // Для статики — Cache First с fallback
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
          (url.pathname.startsWith('/') ||
           url.hostname.includes('cdnjs.cloudflare.com') ||
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