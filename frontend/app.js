// Application bootstrap and cross-module initialization.
// Feature implementations live in focused classic-script modules loaded before this file.

// ========== INIT ==========
// Заполнение SVG-иконок в HTML-шаблонах
(function fillStaticIcons() {
  const onbList = document.getElementById('onbIconList');
  const onbClock = document.getElementById('onbIconClock');
  const onbTarget = document.getElementById('onbIconTarget');
  if (onbList) onbList.innerHTML = ICONS.list;
  if (onbClock) onbClock.innerHTML = ICONS.clock;
  if (onbTarget) onbTarget.innerHTML = ICONS.target;
})();
// Удаляем локальные данные снятой с эксплуатации биометрической блокировки.
for (const key of ['aegis_biometric_enabled', 'aegis_biometric_cred', 'aegis_biometric_declined']) {
  try { localStorage.removeItem(key); } catch (_) { /* Очистка устаревших данных необязательна. */ }
}
tryAutoLogin().then(ok => {
  navigateTo(ok ? 'home' : 'auth');
});


let orientationChangeTimer = null;

window.addEventListener('resize', () => {
  if (orientationChangeTimer) clearTimeout(orientationChangeTimer);
  orientationChangeTimer = setTimeout(() => {
    // Если AR активен и показана схема Kill Chain
    if (arActive && arCurrentScheme === 'killchain') {
      const container = document.getElementById('arSchemeContainer');
      if (container && container.innerHTML) {
        // Перерендериваем схему с новой ориентацией
        const wasStageOpen = arSelectedStage !== null;
        const currentStageId = arSelectedStage;
        
        renderKillChainScheme();
        
        // Если был открыт этап, восстанавливаем его
        if (wasStageOpen && currentStageId) {
          setTimeout(() => selectKillChainStage(currentStageId), 100);
        }
      }
    }
  }, 300);
});

// Инициализация обработчиков для кнопок добавления категорий
function initCategoryButtons() {
  const addCategoryBtn = document.getElementById('addNewCategoryBtn');
  if (addCategoryBtn) {
    addCategoryBtn.onclick = function() {
      const input = document.getElementById('newCategoryNew');
      const newCat = input.value.trim();
      if (!newCat) {
        showToast('Введите название категории');
        return;
      }
      if (newCat.length > 64) {
        showToast('Категория: максимум 64 символа');
        return;
      }
      
      const select = document.getElementById('newCategorySelect');
      const exists = Array.from(select.options).some(opt => opt.value.toLowerCase() === newCat.toLowerCase());
      if (exists) {
        showToast('Такая категория уже существует');
        input.value = '';
        return;
      }
      
      const option = document.createElement('option');
      option.value = newCat;
      option.textContent = newCat;
      select.appendChild(option);
      option.selected = true;
      input.value = '';
      showToast('Категория добавлена');
    };
  }
  
  const addAdminCategoryBtn = document.getElementById('addAdminCategoryBtn');
  if (addAdminCategoryBtn) {
    addAdminCategoryBtn.onclick = function() {
      const input = document.getElementById('adminEditCategoryNew');
      const newCat = input.value.trim();
      if (!newCat) {
        showToast('Введите название категории');
        return;
      }
      if (newCat.length > 64) {
        showToast('Категория: максимум 64 символа');
        return;
      }
      
      const select = document.getElementById('adminEditCategorySelect');
      const exists = Array.from(select.options).some(opt => opt.value.toLowerCase() === newCat.toLowerCase());
      if (exists) {
        showToast('Такая категория уже существует');
        input.value = '';
        return;
      }
      
      const option = document.createElement('option');
      option.value = newCat;
      option.textContent = newCat;
      select.appendChild(option);
      option.selected = true;
      input.value = '';
      showToast('Категория добавлена');
    };
  }
}

// Вызвать после загрузки
setTimeout(initCategoryButtons, 500);

window.LEVEL_CHOICES = LEVEL_CHOICES;
window.openARSchemeMenu = openARSchemeMenu;
window.closeARSchemeMenu = closeARSchemeMenu;
window.openARWithScheme = openARWithScheme;
window.closeAR = closeAR;
window.switchARCamera = switchARCamera;
window.selectKillChainStage = selectKillChainStage;
window.closeKillChainStage = closeKillChainStage;
window.prevKillChainStage = prevKillChainStage;
window.nextKillChainStage = nextKillChainStage;
window.openBookFromAR = openBookFromAR;
window.toggleStageDetailsPanel = toggleStageDetailsPanel;
