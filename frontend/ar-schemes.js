// AR camera and cybersecurity scheme screens.
// Loaded as a classic script before app.js; public handlers intentionally remain global.

// ========== AR SYSTEM ==========
// ========== AR SYSTEM (схемы атак поверх видео) ==========
let arStream = null;
let arActive = false;
let arFacingMode = 'environment';  // 'environment' = задняя камера, 'user' = фронтальная
let arCurrentScheme = null;          // 'killchain' | 'owasp' | ...

// Открытие меню выбора схемы из кнопки в хедере
function openARSchemeMenu() {
  document.getElementById('arSchemeMenuModal').classList.remove('hidden');
}

function closeARSchemeMenu() {
  document.getElementById('arSchemeMenuModal').classList.add('hidden');
}

// Открытие AR-экрана с конкретной схемой
async function openARWithScheme(schemeCode, initialStageId = null) {
  closeARSchemeMenu();
  arCurrentScheme = schemeCode;
  arActiveSchemeCode = AR_SCHEMES[schemeCode] ? schemeCode : 'killchain';

  const titles = {
    killchain: 'Cyber Kill Chain',
    owasp: 'OWASP Top 10',
    osi: 'Модель OSI',
    mitre: 'MITRE ATT&CK',
    nist: 'NIST CSF',
    ir: 'Реагирование на инциденты',
    did: 'Эшелонированная защита',
    stride: 'STRIDE',
  };
  document.getElementById('arSchemeTitle').textContent = titles[schemeCode] || 'Схема';

  document.getElementById('arSchemeContainer').replaceChildren();
  document.getElementById('arModal').classList.add('active');

  // Сначала рендерим схему (она не зависит от камеры), потом запускаем камеру
  // в фоне. На iOS await getUserMedia мог зависать и схема не появлялась.
  renderARScheme(schemeCode);
  startARCamera().catch(e => console.warn('AR-камера недоступна:', e));

  // Если передали этап — сразу его подсветить и открыть детали
  if (initialStageId && schemeCode === 'killchain') {
    setTimeout(() => selectKillChainStage(initialStageId), 100);
  }
}

async function startARCamera() {
  // Проверяем, поддерживается ли getUserMedia
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn('getUserMedia не поддерживается');
    showToast('Ваш браузер не поддерживает камеру, схема отображается на фоне');
    return;
  }

  try {
    // Для ПК используем 'environment' если есть камера, иначе 'user'
    const constraints = {
      video: { 
        facingMode: arFacingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false,
    };
    
    arStream = await navigator.mediaDevices.getUserMedia(constraints);
    const v = document.getElementById('arVideo');
    if (v) {
      v.srcObject = arStream;
      await v.play();
      arActive = true;
    }
  } catch (e) {
    console.error('Ошибка доступа к камере:', e);
    let errorMsg = 'Нет доступа к камере. ';
    if (e.name === 'NotAllowedError') {
      errorMsg += 'Разрешите доступ к камере в настройках браузера.';
    } else if (e.name === 'NotFoundError') {
      errorMsg += 'Камера не найдена на устройстве.';
    } else {
      errorMsg += 'Схема будет показана на тёмном фоне.';
    }
    showToast(errorMsg);
    // Не падаем — схема всё равно рендерится поверх чёрного фона
  }
}
function closeAR() {
  console.log('closeAR вызвана');
  const toggle = document.getElementById('arViewModeToggle');
  if (toggle) toggle.style.display = 'none';
  
  // Останавливаем камеру
  if (arStream) {
    arStream.getTracks().forEach(t => t.stop());
    arStream = null;
  }
  
  arActive = false;
  arCurrentScheme = null;
  arSelectedStage = null;
  
  // Закрываем модалку
  const arModal = document.getElementById('arModal');
  if (arModal) {
    arModal.classList.remove('active');
    // Скрываем через style на случай, если classList не сработал
    arModal.style.display = 'none';
  }
  
  // ПОЛНОСТЬЮ ОЧИЩАЕМ контейнер схемы
  const schemeContainer = document.getElementById('arSchemeContainer');
  if (schemeContainer) {
    schemeContainer.replaceChildren();
    // Убираем все inline стили, которые могли добавиться
    schemeContainer.removeAttribute('style');
  }
  
  // Останавливаем видео
  const video = document.getElementById('arVideo');
  if (video) {
    video.pause();
    video.srcObject = null;
    video.load();
  }
  
  // Убираем возможные остаточные панели
  const stageDetails = document.getElementById('arStageDetails');
  if (stageDetails) {
    stageDetails.style.display = 'none';
    stageDetails.replaceChildren();
  }
  
  const stageHint = document.getElementById('arStageHint');
  if (stageHint) {
    stageHint.style.display = 'block';
  }
  
  // Сбрасываем overlay
  const overlay = document.querySelector('.ar-modal-overlay');
  if (overlay) {
    overlay.style.display = '';
  }
}

async function switchARCamera() {
  arFacingMode = arFacingMode === 'environment' ? 'user' : 'environment';
  // Останавливаем текущий поток
  if (arStream) {
    arStream.getTracks().forEach(t => t.stop());
    arStream = null;
  }
  // Перезапускаем с новым facingMode
  await startARCamera();
}
// Данные схемы Cyber Kill Chain — 7 этапов атаки
let arActiveSchemeCode = 'killchain';
function activeScheme() { return AR_SCHEMES[arActiveSchemeCode] || AR_KILL_CHAIN; }

let arSelectedStage = null;  // id текущей раскрытой стадии (или null)
// Рендер схемы — пока заглушка, будет переписан в Итерации 2
let arViewMode = 'attack'; // 'attack' | 'defense'
function renderARScheme(schemeCode) {
  const container = document.getElementById('arSchemeContainer');
  if (!container) return;
  container.replaceChildren();
  arSelectedStage = null;

  if (!AR_SCHEMES[schemeCode]) {
    const unavailable = document.createElement('div');
    unavailable.setAttribute('data-static-style', 'a007');
    unavailable.textContent = 'Схема в разработке';
    container.replaceChildren(unavailable);
    return;
  }
  arActiveSchemeCode = schemeCode;

  if (schemeCode === 'killchain') renderKillChainScheme();
  else if (schemeCode === 'owasp')    renderOwaspScheme();
  else if (schemeCode === 'osi')      renderOsiScheme();
  else if (schemeCode === 'mitre')    renderMitreScheme();
  else if (schemeCode === 'nist')     renderNistScheme();
  else if (schemeCode === 'did')      renderDidScheme();
  else if (schemeCode === 'ir')       renderIrScheme();
  else if (schemeCode === 'stride')   renderStrideScheme();
  else                                 renderGenericScheme(AR_SCHEMES[schemeCode]);
}
// ─── OWASP: вертикальный стек с цветовой шкалой опасности ───────────────────
// 3D-фигуры на фоне AR-схем отключены — отвлекали от контента
