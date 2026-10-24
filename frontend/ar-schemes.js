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
  if (typeof trackUsage === 'function') trackUsage('action', 'scheme:' + schemeCode);
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

// Кнопка внизу AR: пока камера не работает — «Включить камеру» (нажатие —
// это жест пользователя, после которого браузер честно покажет запрос
// доступа), когда работает — «Сменить камеру».
function updateARCameraButton() {
  const label = document.getElementById('arCameraBtnLabel');
  if (label) label.textContent = arActive ? 'Сменить камеру' : 'Включить камеру';
  document.getElementById('arModal')?.classList.toggle('ar-camera-live', arActive);
}

async function startARCamera() {
  // Проверяем, поддерживается ли getUserMedia
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn('getUserMedia не поддерживается');
    showToast('Ваш браузер не поддерживает камеру, схема отображается на фоне');
    showARCameraHelp('unsupported');
    updateARCameraButton();
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
      document.getElementById('arModal')?.querySelector('.ar-camera-help')?.remove();
    }
    updateARCameraButton();
  } catch (e) {
    arActive = false;
    updateARCameraButton();
    console.error('Ошибка доступа к камере:', e);
    let errorMsg = 'Нет доступа к камере. ';
    if (e.name === 'NotAllowedError') {
      errorMsg += 'Разрешите камеру в настройках сайта. Если Aegis открыт как приложение, откройте меню приложения → «Открыть в браузере», затем нажмите на значок замка/настроек сайта и включите «Камера». Схема уже доступна без камеры.';
    } else if (e.name === 'NotFoundError') {
      errorMsg += 'Камера не найдена на устройстве.';
    } else {
      errorMsg += 'Схема будет показана на тёмном фоне.';
    }
    showToast(errorMsg);
    showARCameraHelp(e.name === 'NotAllowedError' ? 'denied' : (e.name === 'NotFoundError' ? 'missing' : 'failed'));
    // Не падаем — схема всё равно рендерится поверх чёрного фона
  }
}

const AR_CAMERA_HELP = {
  denied: ['Доступ к камере запрещён', 'Разрешите камеру для этого сайта: нажмите на значок слева от адреса (или «аА» в Safari) → «Разрешения» / «Камера» → «Разрешить», затем нажмите «Включить камеру» внизу. На iPhone и iPad проверьте также Настройки → Safari → Камера. Схема работает и без камеры.'],
  missing: ['Камера не найдена', 'На устройстве нет доступной камеры. Схема работает и без неё.'],
  unsupported: ['Камера недоступна в этом браузере', 'Откройте сайт в Safari или Chrome по адресу https://. Схема работает и без камеры.'],
  failed: ['Не удалось включить камеру', 'Возможно, камера занята другим приложением. Закройте его и нажмите «Включить камеру» внизу.'],
};

function showARCameraHelp(reason) {
  const modal = document.getElementById('arModal');
  if (!modal) return;
  modal.querySelector('.ar-camera-help')?.remove();
  const [title, text] = AR_CAMERA_HELP[reason] || AR_CAMERA_HELP.failed;
  const help = document.createElement('div');
  help.className = 'ar-camera-help';
  help.setAttribute('role', 'status');
  help.append(
    Object.assign(document.createElement('strong'), { textContent: title }),
    Object.assign(document.createElement('span'), { textContent: text }),
  );
  // Карточка не должна навсегда закрывать схему: касание её убирает.
  help.title = 'Нажмите, чтобы скрыть';
  help.addEventListener('click', () => help.remove());
  modal.querySelector('.ar-container')?.appendChild(help);
}
function closeAR() {
  console.log('closeAR вызвана');
  document.getElementById('arModal')?.querySelector('.ar-camera-help')?.remove();
  const toggle = document.getElementById('arViewModeToggle');
  if (toggle) toggle.style.display = 'none';
  
  // Останавливаем камеру
  if (arStream) {
    arStream.getTracks().forEach(t => t.stop());
    arStream = null;
  }
  
  arActive = false;
  updateARCameraButton();
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
  // Камера ещё не включена (не дали доступ, занята) — кнопка её включает.
  if (!arActive) {
    await startARCamera();
    return;
  }
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
