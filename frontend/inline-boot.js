if ('serviceWorker' in navigator) {
    let refreshing = false;
    // Когда новый SW взял управление — перезагружаем страницу один раз
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.register('sw.js').then(reg => {
      console.log('Service Worker зарегистрирован:', reg.scope);

      // Проверяем обновления при загрузке и раз в час
      reg.update();
      setInterval(() => reg.update(), 60 * 60 * 1000);

      // Отслеживаем появление новой версии SW
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          // Новый SW установлен и есть текущий контроллер → это обновление (не первая установка)
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(newWorker);
          }
        });
      });
    }).catch(err => {
      console.error('Service Worker не зарегистрирован:', err);
    });
  }

  // Плашка «Доступно обновление» — мягко, без принудительной перезагрузки
  function showUpdateBanner(worker) {
    if (document.getElementById('swUpdateBanner')) return;
    const bar = document.createElement('div');
    bar.id = 'swUpdateBanner';
    bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:80px;z-index:99999;background:#1e2535;border:1px solid rgba(0,212,255,0.4);border-radius:12px;padding:10px 14px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 30px rgba(0,0,0,0.5);font-family:inherit;max-width:92vw;';
    bar.innerHTML = '<span style="font-size:13px;color:#e8edf5;">Доступна новая версия</span>' +
      '<button id="swUpdateBtn" style="background:linear-gradient(135deg,#00d4ff,#7b61ff);border:none;color:#fff;padding:7px 14px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;">Обновить</button>' +
      '<button id="swUpdateDismiss" style="background:transparent;border:none;color:#8a93a6;cursor:pointer;font-size:16px;">✕</button>';
    document.body.appendChild(bar);
    document.getElementById('swUpdateBtn').onclick = () => {
      worker.postMessage({ type: 'SKIP_WAITING' });
      bar.remove();
    };
    document.getElementById('swUpdateDismiss').onclick = () => bar.remove();
  }
