// Gestures, zoom and stage details for AR cybersecurity schemes.
// Loaded before the AR controller; handlers intentionally remain global.


// Панорамирование схемы: нативный скролл (тачпад/колесо) + drag мышью
function initARPan() {
  const sc = document.getElementById('killChainScrollContainer');
  if (!sc) return;
  // Колесо/тачпад: вертикальный жест → горизонтальная прокрутка ТОЛЬКО если
  // по горизонтали скроллить некуда нативно (узкий контент). Иначе не мешаем.
  sc.onwheel = (e) => {
    const canScrollV = sc.scrollHeight > sc.clientHeight;
    const canScrollH = sc.scrollWidth > sc.clientWidth;
    // Если контент шире, чем выше, и вертикально скроллить некуда — конвертим
    if (canScrollH && !canScrollV && e.deltaX === 0) {
      sc.scrollLeft += e.deltaY;
      e.preventDefault();
    }
    // во всех остальных случаях — нативный скролл (работает на тачпаде сам)
  };
  // Drag-to-pan мышью (для обычной мыши без колеса-горизонтали)
  let dragging = false, sx = 0, sy = 0, sl = 0, st = 0, moved = false;
  sc.onmousedown = (e) => {
    if (e.target.closest('button')) return;
    dragging = true; moved = false;
    sx = e.clientX; sy = e.clientY;
    sl = sc.scrollLeft; st = sc.scrollTop;
    sc.style.cursor = 'grabbing';
  };
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    sc.scrollLeft = sl - dx;
    sc.scrollTop = st - dy;
  });
  window.addEventListener('mouseup', () => { dragging = false; sc.style.cursor = ''; });
}

// Панель с информацией об этапе. Раньше это была шторка с «язычком»: в
// закрытом виде торчала пустой полосой внизу, тянулась пальцем, а её
// размеры задавались в момент открытия и ломались при повороте экрана.
// Теперь: панели нет, пока этап не выбран; открывается целиком; где ей
// быть (сбоку или снизу), решает CSS. Закрыть — ✕, касание мимо панели,
// смахивание вниз, Esc или «назад».
function arDetailsIsOpen() {
  const panel = document.getElementById('arStageDetails');
  return Boolean(panel && panel.classList.contains('is-open'));
}

function initStageDetailsSwipe() {
  const panel = document.getElementById('arStageDetails');
  const scroll = document.getElementById('killChainScrollContainer');
  if (panel && !panel.dataset.ready) {
    panel.dataset.ready = '1';
    // Смахивание вниз по шапке панели закрывает её.
    const header = panel.querySelector('.ar-details-header');
    let startY = null;
    header?.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
    header?.addEventListener('touchend', e => {
      if (startY === null) return;
      const dy = (e.changedTouches[0]?.clientY ?? startY) - startY;
      startY = null;
      if (dy > 50) closeKillChainStage();
    });
  }
  // Касание по пустому месту схемы (не по этапу) закрывает панель.
  if (scroll && !scroll.dataset.closeReady) {
    scroll.dataset.closeReady = '1';
    scroll.addEventListener('click', e => {
      if (!arDetailsIsOpen()) return;
      if (e.target.closest('.ar-stage-control, button, a')) return;
      closeKillChainStage();
    });
  }
  initARPinchZoom();
}

// Масштаб схемы — CSS zoom на всём содержимом: одинаково для списка этапов,
// колец, таблиц; прокрутка знает новый размер. Раньше «+» менял размеры
// только кружков старой Kill Chain и на карточках этапов давал обратный
// эффект, а на остальных схемах не делал ничего.
let currentARSchemeZoom = 1;
const AR_ZOOM_MIN = 0.6;
const AR_ZOOM_MAX = 2.5;
const AR_ZOOM_STEP = 0.2;

function _arZoomTarget() {
  return document.getElementById('killChainWrapper') || document.getElementById('killChainNodes');
}

function applyARSchemeZoom() {
  const target = _arZoomTarget();
  if (!target) return;
  target.style.zoom = String(currentARSchemeZoom);
  target.style.transform = 'none';
}

function setARSchemeZoom(value, { indicator = true } = {}) {
  const next = Math.round(Math.min(AR_ZOOM_MAX, Math.max(AR_ZOOM_MIN, value)) * 100) / 100;
  const scroll = document.getElementById('killChainScrollContainer');
  // Центр видимой области остаётся на месте.
  let cx = 0.5, cy = 0.5;
  if (scroll && scroll.scrollWidth && scroll.scrollHeight) {
    cx = (scroll.scrollLeft + scroll.clientWidth / 2) / scroll.scrollWidth;
    cy = (scroll.scrollTop + scroll.clientHeight / 2) / scroll.scrollHeight;
  }
  currentARSchemeZoom = next;
  applyARSchemeZoom();
  if (scroll) {
    scroll.scrollLeft = Math.max(0, cx * scroll.scrollWidth - scroll.clientWidth / 2);
    scroll.scrollTop = Math.max(0, cy * scroll.scrollHeight - scroll.clientHeight / 2);
  }
  const controls = document.querySelectorAll('.ar-zoom-controls button');
  if (controls[0]) controls[0].disabled = next >= AR_ZOOM_MAX;
  if (controls[1]) controls[1].disabled = next <= AR_ZOOM_MIN;
  if (indicator) showZoomIndicator(Math.round(next * 100));
}

function zoomARScheme(direction) {
  setARSchemeZoom(currentARSchemeZoom + (direction === 'in' ? AR_ZOOM_STEP : -AR_ZOOM_STEP));
}

function resetARSchemeZoom() {
  setARSchemeZoom(1, { indicator: false });
}

// Щипок двумя пальцами — масштаб схемы (браузерный масштаб в приложении выключен).
function initARPinchZoom() {
  const scroll = document.getElementById('killChainScrollContainer');
  if (!scroll || scroll.dataset.pinchReady) return;
  scroll.dataset.pinchReady = '1';
  let startDist = 0;
  let startZoom = 1;
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  scroll.addEventListener('touchstart', e => {
    if (e.touches.length !== 2) return;
    startDist = dist(e.touches) || 1;
    startZoom = currentARSchemeZoom;
  }, { passive: true });
  scroll.addEventListener('touchmove', e => {
    if (e.touches.length !== 2 || !startDist) return;
    e.preventDefault();
    setARSchemeZoom(startZoom * dist(e.touches) / startDist, { indicator: false });
  }, { passive: false });
  scroll.addEventListener('touchend', e => {
    if (e.touches.length < 2 && startDist) {
      startDist = 0;
      showZoomIndicator(Math.round(currentARSchemeZoom * 100));
    }
  }, { passive: true });
}

function showZoomIndicator(percent) {
  const old = document.getElementById('zoomIndicator');
  if (old) old.remove();

  const indicator = document.createElement('div');
  indicator.id = 'zoomIndicator';
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(svgNamespace, 'svg');
  icon.setAttribute('width', '20');
  icon.setAttribute('height', '20');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('data-static-style', 'a076');

  const circle = document.createElementNS(svgNamespace, 'circle');
  circle.setAttribute('cx', '11');
  circle.setAttribute('cy', '11');
  circle.setAttribute('r', '8');
  icon.appendChild(circle);
  [
    ['21', '21', '16.65', '16.65'],
    ['11', '8', '11', '14'],
    ['8', '11', '14', '11'],
  ].forEach(([x1, y1, x2, y2]) => {
    const line = document.createElementNS(svgNamespace, 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    icon.appendChild(line);
  });
  const label = document.createElement('span');
  label.textContent = `${Math.round(Number(percent) || 0)}%`;
  indicator.append(icon, label);
  indicator.style.cssText = `
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0,0,0,0.85);
    backdrop-filter: blur(12px);
    color: var(--accent);
    font-size: 16px; font-weight: 700;
    padding: 10px 20px;
    border-radius: 48px;
    z-index: 100; pointer-events: none;
    font-family: 'JetBrains Mono', monospace;
    display: inline-flex; align-items: center;
    border: 1px solid rgba(var(--accent-rgb),0.3);
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    animation: zoomFadeOut 0.8s forwards;
  `;
  document.body.appendChild(indicator);
  setTimeout(() => indicator.remove(), 800);
}

function _arDetailNode(tagName, options, children) {
  options = options || {};
  children = children || [];
  const node = document.createElement(tagName);
  if (options.id) node.id = options.id;
  if (options.className) node.className = options.className;
  if (options.staticStyle) node.dataset.staticStyle = options.staticStyle;
  if (options.dynamicStyle) node.dataset.dynamicStyle = options.dynamicStyle;
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.disabled) node.disabled = true;
  if (options.onClick) node.addEventListener('click', options.onClick);
  children.forEach(child => node.appendChild(child));
  return node;
}

function _arDetailTab(id, label, staticStyle) {
  return _arDetailNode('button', {
    id: 'killChainTabBtn-' + id,
    className: 'killchain-tab-btn' + (id === 'attack' ? ' active' : ''),
    staticStyle,
    text: label,
    onClick: () => switchKillChainTab(id),
  });
}

function _arDetailList(id, items, visible) {
  const list = _arDetailNode('ul', { staticStyle: 'a086' });
  (items || []).forEach(item => {
    list.appendChild(_arDetailNode('li', { staticStyle: 'a087', text: item }));
  });
  return _arDetailNode('div', {
    id: 'killChainTabContent-' + id,
    className: 'killchain-tab-content',
    staticStyle: visible ? 'a085' : 'a088',
  }, [list]);
}

function _renderKillChainStageDetails(stage, relatedBooks, stageId) {
  const content = document.getElementById('arStageDetailContent');
  if (!content) return;

  const defense = stage.defenseMethod;
  const defenseColor = defense ? defense.color : '#666';

  const metaphor = _arDetailNode('div', { staticStyle: 'a077' }, [
    _arDetailNode('div', { staticStyle: 'a078', text: 'МЕТАФОРА' }),
    _arDetailNode('div', { staticStyle: 'a079', text: stage.metaphor || '—' }),
  ]);

  const defenseBadge = _arDetailNode('div', {
    dynamicStyle: dynamicStyleToken`display:flex;align-items:center;gap:10px;background:${defenseColor}20;border:1px solid ${defenseColor}66;border-radius:10px;padding:10px 12px;margin-bottom:14px;`,
  }, [
    _arDetailNode('div', {
      dynamicStyle: dynamicStyleToken`width:36px;height:36px;border-radius:50%;background:${defenseColor};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;flex-shrink:0;`,
      text: defense ? defense.code.charAt(0) : '?',
    }),
    _arDetailNode('div', { staticStyle: 'a004' }, [
      _arDetailNode('div', { staticStyle: 'a080', text: 'МЕТОД ЗАЩИТЫ (6D)' }),
      _arDetailNode('div', {
        dynamicStyle: dynamicStyleToken`font-size:13px;font-weight:700;color:${defense ? defense.color : '#fff'};`,
        text: defense ? defense.code + ' — ' + defense.nameRu : '—',
      }),
    ]),
  ]);

  const tabs = _arDetailNode('div', { staticStyle: 'a082' }, [
    _arDetailTab('attack', '⚔ АТАКА', 'a083'),
    _arDetailTab('defense', '🛡 ЗАЩИТА', 'a084'),
    _arDetailTab('tools', 'ИНСТРУМЕНТЫ', 'a084'),
  ]);

  let toolsContent;
  if (stage.defenseTools && stage.defenseTools.length) {
    const tools = _arDetailNode('div', { staticStyle: 'a089' });
    stage.defenseTools.forEach(tool => {
      tools.appendChild(_arDetailNode('div', {
        dynamicStyle: dynamicStyleToken`background:${defenseColor}25;border:1px solid ${defenseColor}55;color:${defense ? defense.color : '#fff'};padding:5px 10px;border-radius:14px;font-size:11px;font-weight:600;`,
        text: tool,
      }));
    });
    toolsContent = tools;
  } else {
    toolsContent = _arDetailNode('div', { staticStyle: 'a090', text: 'Список инструментов не задан' });
  }
  const toolsPanel = _arDetailNode('div', {
    id: 'killChainTabContent-tools',
    className: 'killchain-tab-content',
    staticStyle: 'a088',
  }, [toolsContent]);

  let booksSection;
  if (relatedBooks.length) {
    const books = _arDetailNode('div', { staticStyle: 'a093' });
    relatedBooks.slice(0, 3).forEach(book => {
      books.appendChild(_arDetailNode('button', {
        staticStyle: 'a094',
        onClick: () => openBookFromAR(book.id),
      }, [
        _arDetailNode('div', { staticStyle: 'a095', text: book.title }),
        _arDetailNode('div', { staticStyle: 'a096', text: book.author }),
      ]));
    });
    booksSection = _arDetailNode('div', { staticStyle: 'a091' }, [
      _arDetailNode('div', { staticStyle: 'a092', text: '📚 КНИГИ ПО ТЕМЕ' }),
      books,
    ]);
  } else {
    booksSection = _arDetailNode('div', {
      staticStyle: 'a097',
      text: 'Книг по теме «' + stage.relatedCategory + '» пока нет',
    });
  }

  const lastStage = activeScheme().stages.length;
  const previousDisabled = stageId === 1;
  const nextDisabled = stageId === lastStage;
  const navigation = _arDetailNode('div', { staticStyle: 'a098' }, [
    _arDetailNode('button', {
      disabled: previousDisabled,
      dynamicStyle: dynamicStyleToken`flex:1;padding:12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:10px;color:#fff;cursor:pointer;font-family:inherit;font-size:12px;font-weight:500;${previousDisabled ? 'opacity:0.4;cursor:default;' : ''}`,
      text: '← Назад',
      onClick: prevKillChainStage,
    }),
    _arDetailNode('button', {
      disabled: nextDisabled,
      dynamicStyle: dynamicStyleToken`flex:1;padding:12px;background:var(--accent-gradient);border:none;border-radius:10px;color:#000;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;${nextDisabled ? 'opacity:0.4;cursor:default;' : ''}`,
      text: 'Вперёд →',
      onClick: nextKillChainStage,
    }),
  ]);

  content.replaceChildren(
    metaphor,
    defenseBadge,
    _arDetailNode('div', { staticStyle: 'a081', text: stage.description }),
    tabs,
    _arDetailList('attack', stage.attacker, true),
    _arDetailList('defense', stage.defender, false),
    toolsPanel,
    booksSection,
    navigation,
  );
}

function selectKillChainStage(stageId) {
  const stage = activeScheme().stages.find(s => s.id === stageId);
  if (!stage) return;

  arSelectedStage = stageId;

  document.querySelectorAll('.ar-stage-control').forEach(node => {
    const selected = Number(node.dataset.arStageId) === stageId;
    node.classList.toggle('is-selected', selected);
    node.setAttribute('aria-pressed', String(selected));
  });

  // Скрыть подсказку
  const stageHint = document.getElementById('arStageHint');
  if (stageHint) stageHint.style.display = 'none';

  // Найти связанные книги
  const relatedBooks = (state.books || []).filter(b => (b.categories || []).includes(stage.relatedCategory));

  // Обновляем заголовок панели
  const titleEl = document.getElementById('arStageDetailTitle');
  if (titleEl) {
    titleEl.textContent = `ЭТАП ${stage.id} — ${stage.nameRu.toUpperCase()}`;
  }

  // Обновляем содержимое панели безопасными DOM-операциями
  _renderKillChainStageDetails(stage, relatedBooks, stageId);

  // Показываем панель целиком; где — сбоку или снизу — решает CSS.
  const panel = document.getElementById('arStageDetails');
  if (panel) {
    panel.classList.add('is-open');
    panel.scrollTop = 0;
    const content = document.getElementById('arStageDetailContent');
    if (content) content.scrollTop = 0;
  }
  const root = document.getElementById('arSchemeRoot');
  if (root) root.classList.add('ar-details-open');
}
function switchKillChainTab(tab) {
  ['attack', 'defense', 'tools'].forEach(t => {
    const btn = document.getElementById('killChainTabBtn-' + t);
    const content = document.getElementById('killChainTabContent-' + t);
    if (!btn || !content) return;
    const isActive = t === tab;
    content.style.display = isActive ? 'block' : 'none';
    if (isActive) {
      // Цвет активной вкладки зависит от типа
      if (t === 'attack') btn.style.background = 'rgba(239,68,68,0.25)';
      else if (t === 'defense') btn.style.background = 'rgba(16,185,129,0.25)';
      else btn.style.background = 'rgba(168,85,247,0.25)';
      btn.style.color = '#fff';
    } else {
      btn.style.background = 'transparent';
      btn.style.color = 'rgba(255,255,255,0.6)';
    }
  });
}
function setKillChainViewMode(mode) {
  if (mode !== 'attack' && mode !== 'defense') mode = 'attack';
  arViewMode = mode;
  localStorage.setItem('aegis_killchain_mode', mode);

  // Перекрашиваем кнопки тумблера
  const btnAtt = document.getElementById('arViewBtnAttack');
  const btnDef = document.getElementById('arViewBtnDefense');
  if (btnAtt && btnDef) {
    if (mode === 'attack') {
      btnAtt.style.background = 'rgba(239,68,68,0.4)';
      btnAtt.style.color = '#fff';
      btnDef.style.background = 'transparent';
      btnDef.style.color = 'rgba(255,255,255,0.6)';
    } else {
      btnDef.style.background = 'rgba(16,185,129,0.4)';
      btnDef.style.color = '#fff';
      btnAtt.style.background = 'transparent';
      btnAtt.style.color = 'rgba(255,255,255,0.6)';
    }
  }

  // Перерисовываем узлы с новым стилем
  applyKillChainViewMode();

  // Если открыта детальная карточка этапа — переключаем активную вкладку
  if (arSelectedStage !== null) {
    switchKillChainTab(mode === 'defense' ? 'defense' : 'attack');
  }
}

function applyKillChainViewMode() {
  const root = document.getElementById('arSchemeRoot');
  if (root) root.dataset.viewMode = arViewMode;
  activeScheme().stages.forEach(s => {
    const node = document.getElementById('arNode' + s.id);
    if (!node) return;

    const isSelected = s.id === arSelectedStage;
    const isStudied = isKillChainStageStudied(s);

    // В узле всегда номер этапа. Раньше в режиме «Защита» туда ставилась
    // первая буква метода, и у четырёх этапов подряд выходило одинаковое «D»
    // (Detect, Deny, Disrupt, Degrade). Метод защиты теперь написан словами.
    const label = String(s.id);
    const action = node.querySelector('.ar-stage-action');
    if (action) {
      action.textContent = arViewMode === 'defense' && s.defenseMethod
        ? `Защита: ${s.defenseMethod.nameRu} (${s.defenseMethod.code})`
        : 'Открыть разбор';
    }
    // Обновляем только текстовый блок (первый <div> внутри button), не ломая остальное
    const labelDiv = node.querySelector('.killchain-node-label');
    if (labelDiv) labelDiv.textContent = label;
    else {
      // Если внутри сложная структура — найдём первый <div> с цифрой
      const first = node.querySelector('div');
      if (first) first.textContent = label;
    }

    node.classList.toggle('is-selected', isSelected);
    node.classList.toggle('is-studied', isStudied);
    node.setAttribute('aria-pressed', String(isSelected));
    // Цветовой акцент хранится отдельно: состояние карточки задаёт CSS.
    let borderColor;
    if (arViewMode === 'defense') {
      borderColor = s.defenseMethod ? s.defenseMethod.color : 'rgba(255,255,255,0.2)';
    } else {
      borderColor = isStudied ? '#10b981' : 'rgba(255,255,255,0.2)';
    }
    node.style.setProperty('--ar-stage-accent', borderColor);
  });
}

function closeKillChainStage() {
  arSelectedStage = null;
  document.querySelectorAll('.ar-stage-control').forEach(node => {
    node.classList.remove('is-selected');
    node.setAttribute('aria-pressed', 'false');
  });
  document.getElementById('arStageDetails')?.classList.remove('is-open');
  document.getElementById('arSchemeRoot')?.classList.remove('ar-details-open');
  const hint = document.getElementById('arStageHint');
  if (hint) hint.style.display = '';
}

function prevKillChainStage() {
  if (arSelectedStage && arSelectedStage > 1) {
    selectKillChainStage(arSelectedStage - 1);
  }
}

function nextKillChainStage() {
  if (arSelectedStage && arSelectedStage < activeScheme().stages.length) {
    selectKillChainStage(arSelectedStage + 1);
  }
}

// Книга из схемы: «назад» из книги возвращает в ту же схему и к тому же
// этапу, а не на главную.
function openBookFromAR(bookId) {
  const back = arCurrentScheme ? { scheme: arCurrentScheme, stage: arSelectedStage } : null;
  closeAR();
  openBookDetail(bookId);
  if (back) {
    state._detailReturnTo = 'scheme';
    state._schemeReturn = back;
  }
}

// Esc: сначала закрывает панель этапа, затем схему.
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const modal = document.getElementById('arModal');
    if (!modal || !modal.classList.contains('active')) return;
    if (arDetailsIsOpen()) closeKillChainStage();
    else closeAR();
  });
}
