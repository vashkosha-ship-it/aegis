// ========== ДАННЫЕ И ПАМЯТЬ ==========
const WIFI_ONLY_KEY = 'aegis_wifi_only';

function isWifiOnlyEnabled() {
  return localStorage.getItem(WIFI_ONLY_KEY) === '1';
}
function setWifiOnly(enabled) {
  localStorage.setItem(WIFI_ONLY_KEY, enabled ? '1' : '0');
}
function isOnWifi() {
  // Поддерживается не везде. Если API нет — считаем что мы на Wi-Fi (не блокируем).
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn || !conn.type) return true;
  return conn.type === 'wifi' || conn.type === 'ethernet';
}

// ===== D: Автопредзагрузка книг офлайн по Wi-Fi =====
const AUTO_PRELOAD_KEY = 'aegis_auto_preload';
function isAutoPreloadEnabled() { return localStorage.getItem(AUTO_PRELOAD_KEY) === '1'; }
function setAutoPreload(enabled) {
  localStorage.setItem(AUTO_PRELOAD_KEY, enabled ? '1' : '0');
  if (enabled) maybeAutoPreload();
}
async function maybeAutoPreload() {
  if (!isAutoPreloadEnabled()) return;
  if (!isOnWifi()) return;
  // Берём начатые книги, которых ещё нет офлайн (макс 3 за раз, чтобы не грузить много)
  const candidates = (state.books || [])
    .filter(b => b.has_file && state.readingProgress[b.id]?.started && !offlineBookIds.has(b.id))
    .slice(0, 3);
  for (const b of candidates) {
    try {
      await saveBookOffline(b.id, true);  // тихий режим
    } catch (_) {}
  }
}

// formatBytes объявлена ниже, в разделе офлайн-хранилища. Здесь была
// вторая версия с английскими единицами — она перекрывалась поздним
// объявлением и никогда не выполнялась. Правка в ней не дала бы эффекта.

async function getStorageStats() {
  let used = 0, quota = 0;
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      used = est.usage || 0;
      quota = est.quota || 0;
    } catch (_) {}
  }

  // Размер кэша книг (Cache Storage)
  let cacheSize = 0;
  let cacheCount = 0;
  if ('caches' in window) {
    try {
      const names = await caches.keys();
      for (const name of names) {
        const cache = await caches.open(name);
        const reqs = await cache.keys();
        cacheCount += reqs.length;
        for (const req of reqs) {
          const resp = await cache.match(req);
          if (resp) {
            const blob = await resp.clone().blob();
            cacheSize += blob.size;
          }
        }
      }
    } catch (_) {}
  }

  return { used, quota, cacheSize, cacheCount };
}

async function clearAllAppCache() {
  if (!('caches' in window)) return;
  const names = await caches.keys();
  for (const name of names) {
    await caches.delete(name);
  }
}

