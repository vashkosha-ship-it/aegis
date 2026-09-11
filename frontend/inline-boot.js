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
      const checkForUpdate = () => reg.update().catch(err => {
        // Обновление SW может временно не сработать из-за офлайна, VPN или
        // браузерного туннеля. Это не должно превращаться в unhandled rejection.
        console.info('Проверка обновления Service Worker отложена:', err.message);
      });
      checkForUpdate();
      setInterval(checkForUpdate, 60 * 60 * 1000);

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
    bar.className = 'sw-update-banner';
    replaceWithAppMarkup(bar, '<span class="sw-update-message">Доступна новая версия</span>' +
      '<button id="swUpdateBtn" class="sw-update-apply">Обновить</button>' +
      '<button id="swUpdateDismiss" class="sw-update-dismiss">✕</button>');
    document.body.appendChild(bar);
    document.getElementById('swUpdateBtn').onclick = () => {
      worker.postMessage({ type: 'SKIP_WAITING' });
      bar.remove();
    };
    document.getElementById('swUpdateDismiss').onclick = () => bar.remove();
  }
