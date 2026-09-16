// Gestures, zoom and stage details for AR cybersecurity schemes.
// Loaded before the AR controller; handlers intentionally remain global.

let detailsPanelStartY = 0;
let detailsPanelCurrentY = 0;
let detailsPanelIsDragging = false;
let detailsPanelOpen = false;
let detailsPanelDidDrag = false;

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

function initStageDetailsSwipe() {
  const panel = document.getElementById('arStageDetails');
  if (!panel) return;

  panel.removeEventListener('touchstart', onDetailsTouchStart);
  panel.removeEventListener('touchmove', onDetailsTouchMove);
  panel.removeEventListener('touchend', onDetailsTouchEnd);
  panel.removeEventListener('mousedown', onDetailsMouseDown);

  panel.addEventListener('touchstart', onDetailsTouchStart, { passive: false });
  panel.addEventListener('touchmove', onDetailsTouchMove, { passive: false });
  panel.addEventListener('touchend', onDetailsTouchEnd);
  panel.addEventListener('mousedown', onDetailsMouseDown);

  // Клик по панели (для ПК/тачпада): переключает открыто/закрыто.
  // Игнорируем клики по кнопкам и случаи, когда было перетаскивание.
  panel.removeEventListener('click', onDetailsClick);
  panel.addEventListener('click', onDetailsClick);
}

function toggleStageDetailsPanel(e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  const panel = document.getElementById('arStageDetails');
  if (!panel) { console.warn('AR: панель arStageDetails не найдена'); return; }
  if (getComputedStyle(panel).display === 'none') panel.style.display = 'block';
  panel.style.transition = 'transform 0.3s ease';
  const arrow = document.getElementById('arStageToggleBtn');
  const svg = arrow ? arrow.querySelector('svg') : null;

  const isDesktop = window.innerWidth >= 768;
  const xPart = isDesktop ? 'translateX(-50%) ' : '';

  // Определяем реальное состояние по положению панели на экране,
  // а не по флагу (флаг рассинхронизируется при выборе этапа).
  const rect = panel.getBoundingClientRect();
  const winH = window.innerHeight;
  // Если видимая часть панели меньше ~40% её высоты — считаем закрытой → открываем
  const visibleHeight = winH - rect.top;
  const isCurrentlyOpen = visibleHeight > rect.height * 0.55;
  const willOpen = !isCurrentlyOpen;

  if (willOpen) {
    panel.style.setProperty('transform', xPart + 'translateY(0px)', 'important');
  } else {
    const ph = panel.offsetHeight || 300;
    panel.style.setProperty('transform', xPart + `translateY(${ph - 60}px)`, 'important');
  }
  detailsPanelOpen = willOpen;
  if (svg) svg.style.transform = willOpen ? 'rotate(180deg)' : 'rotate(0deg)';
}

function onDetailsClick(e) {
  if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
  if (detailsPanelDidDrag) { detailsPanelDidDrag = false; return; } // это было перетаскивание
  const panel = document.getElementById('arStageDetails');
  if (!panel) return;
  panel.style.transition = 'transform 0.3s ease';
  if (detailsPanelOpen) {
    const ph = panel.offsetHeight;
    panel.style.transform = `translateY(${ph - 60}px)`;
    detailsPanelOpen = false;
  } else {
    panel.style.transform = 'translateY(0)';
    detailsPanelOpen = true;
  }
}

function onDetailsMouseDown(e) {
  // Игнорируем клики по кнопкам внутри панели
  if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
  detailsPanelStartY = e.clientY;
  detailsPanelIsDragging = true;
  const panel = document.getElementById('arStageDetails');
  if (panel) panel.style.transition = 'none';
  const onMove = (ev) => {
    if (!detailsPanelIsDragging) return;
    const p = document.getElementById('arStageDetails');
    if (!p) return;
    const delta = ev.clientY - detailsPanelStartY;
    if (Math.abs(delta) > 5) detailsPanelDidDrag = true;
    const ph = p.offsetHeight;
    const base = detailsPanelOpen ? 0 : ph - 60;
    const nt = Math.max(0, Math.min(base + delta, ph - 60));
    p.style.transform = `translateY(${nt}px)`;
    detailsPanelCurrentY = nt;
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    onDetailsTouchEnd({ touches: [] });
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function onDetailsTouchStart(e) {
  detailsPanelStartY = e.touches[0].clientY;
  detailsPanelIsDragging = true;
  const panel = document.getElementById('arStageDetails');
  if (panel) {
    panel.style.transition = 'none';
  }
}

function onDetailsTouchMove(e) {
  if (!detailsPanelIsDragging) return;
  e.preventDefault();

  const currentY = e.touches[0].clientY;
  const deltaY = currentY - detailsPanelStartY;
  const panel = document.getElementById('arStageDetails');
  if (!panel) return;

  const panelHeight = panel.offsetHeight;
  const currentTransform = detailsPanelOpen ? 0 : panelHeight - 60;
  let newTransform = currentTransform + deltaY;

  // Ограничиваем диапазон
  newTransform = Math.max(0, Math.min(newTransform, panelHeight - 60));

  panel.style.transform = `translateY(${newTransform}px)`;
  detailsPanelCurrentY = newTransform;
}

function onDetailsTouchEnd(e) {
  if (!detailsPanelIsDragging) return;
  detailsPanelIsDragging = false;

  const panel = document.getElementById('arStageDetails');
  if (!panel) return;

  const panelHeight = panel.offsetHeight;
  const threshold = panelHeight * 0.3;

  // Решаем, открыть или закрыть
  if (detailsPanelCurrentY < threshold) {
    // Открыть полностью
    panel.style.transform = 'translateY(0)';
    detailsPanelOpen = true;
  } else if (detailsPanelCurrentY > panelHeight - 60 - threshold) {
    // Закрыть до минимального размера
    panel.style.transform = `translateY(${panelHeight - 60}px)`;
    detailsPanelOpen = false;
  } else {
    // Вернуться к предыдущему состоянию
    if (detailsPanelOpen) {
      panel.style.transform = 'translateY(0)';
    } else {
      panel.style.transform = `translateY(${panelHeight - 60}px)`;
    }
  }

  panel.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1)';
}
let currentARSchemeZoom = 1;
const AR_ZOOM_MIN = 0.5;
const AR_ZOOM_MAX = 2.5;

function zoomARScheme(direction) {
  const nodesContainer = document.getElementById('killChainNodes');
  if (!nodesContainer) return;

  if (direction === 'in') {
    currentARSchemeZoom = Math.min(currentARSchemeZoom + 0.15, AR_ZOOM_MAX);
  } else if (direction === 'out') {
    currentARSchemeZoom = Math.max(currentARSchemeZoom - 0.15, AR_ZOOM_MIN);
  }

  applyARSchemeZoom();
  showZoomIndicator(Math.round(currentARSchemeZoom * 100));
}

function applyARSchemeZoom() {
  // Меняем размеры всех нод и соединителей реальными CSS-свойствами,
  // а не transform: scale(). Это позволяет скроллу понимать новый размер.
  const isVertical = window.innerWidth < 768;
  const baseNodeSize = isVertical ? 80 : 64;
  const baseGap = isVertical ? 12 : 8;
  const baseConnectorMain = isVertical ? 24 : 24;       // длина по основной оси
  const baseConnectorCross = 2;                         // толщина
  const baseFontNum = isVertical ? 22 : 18;
  const baseFontLabel = isVertical ? 9 : 7;

  const z = currentARSchemeZoom;
  const nodeSize = Math.round(baseNodeSize * z);
  const gap = Math.round(baseGap * z);
  const connectorMain = Math.round(baseConnectorMain * z);
  const fontNum = Math.round(baseFontNum * z);
  const fontLabel = Math.round(baseFontLabel * z);

  const nodesContainer = document.getElementById('killChainNodes');
  if (nodesContainer) {
    nodesContainer.style.gap = gap + 'px';
    nodesContainer.style.transform = 'none';  // на всякий случай очищаем старый scale
  }

  // Обновляем все ноды
  activeScheme().stages.forEach(s => {
    const node = document.getElementById('arNode' + s.id);
    if (!node) return;
    node.style.width = nodeSize + 'px';
    node.style.height = nodeSize + 'px';
    const num = node.querySelector('div:first-child');
    const lbl = node.querySelector('div:last-child');
    if (num) num.style.fontSize = fontNum + 'px';
    if (lbl) lbl.style.fontSize = fontLabel + 'px';
  });

  // Обновляем соединители (тонкие линии между нодами)
  document.querySelectorAll('#killChainNodes > div:not([id])').forEach(c => {
    if (isVertical) {
      c.style.width = baseConnectorCross + 'px';
      c.style.height = connectorMain + 'px';
    } else {
      c.style.width = connectorMain + 'px';
      c.style.height = baseConnectorCross + 'px';
    }
  });
}
function resetARSchemeZoom() {
  currentARSchemeZoom = 1;
  const nodesContainer = document.getElementById('killChainNodes');
  const scrollContainer = document.getElementById('killChainScrollContainer');
  if (nodesContainer) {
    nodesContainer.style.transform = 'scale(1)';
    nodesContainer.style.transition = 'transform 0.2s ease';
  }
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
    scrollContainer.scrollLeft = 0;
  }
  if (typeof applyARSchemeZoom === 'function') applyARSchemeZoom();
  showZoomIndicator(100);
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
    color: #00d4ff;
    font-size: 16px; font-weight: 700;
    padding: 10px 20px;
    border-radius: 48px;
    z-index: 100; pointer-events: none;
    font-family: 'JetBrains Mono', monospace;
    display: inline-flex; align-items: center;
    border: 1px solid rgba(0,212,255,0.3);
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

  // Показываем панель и СРАЗУ открываем полностью (без свайпа)
  const panel = document.getElementById('arStageDetails');
  if (panel) {
    panel.style.display = 'block';
    const isWide = window.innerWidth >= 900;
    void panel.offsetHeight; // reflow для transition
    if (isWide) {
      // Правый сайдбар
      panel.style.top = '0';
      panel.style.bottom = '0';
      panel.style.left = 'auto';
      panel.style.right = '0';
      panel.style.width = 'min(420px, 42vw)';
      panel.style.maxHeight = '100%';
      panel.style.height = '100%';
      panel.style.borderRadius = '0';
      panel.style.borderTop = 'none';
      panel.style.borderLeft = '1px solid rgba(255,255,255,0.2)';
      panel.style.transform = 'translateX(0)';
      panel.classList.add('open');
    } else {
      // Узкий экран: нижняя шторка, СРАЗУ открыта полностью
      panel.classList.remove('open');
      panel.style.top = 'auto';
      panel.style.bottom = '0';
      panel.style.left = '0';
      panel.style.right = '0';
      panel.style.width = '100%';
      panel.style.height = 'auto';
      panel.style.maxHeight = '78%';
      panel.style.borderRadius = '20px 20px 0 0';
      panel.style.borderTop = '1px solid rgba(255,255,255,0.2)';
      panel.style.borderLeft = 'none';
      panel.style.transform = 'translateY(0)';
    }
    detailsPanelOpen = true;

    // Кнопка закрытия (добавляем один раз)
    if (!document.getElementById('arПанельCloseBtn')) {
      const cb = document.createElement('button');
      cb.id = 'arПанельCloseBtn';
      cb.textContent = '✕';
      cb.onclick = (e) => { e.stopPropagation(); closeKillChainStage(); };
      cb.style.cssText = 'position:absolute;top:10px;right:12px;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.25);color:#fff;font-size:16px;cursor:pointer;z-index:30;display:flex;align-items:center;justify-content:center;';
      panel.appendChild(cb);
    }
  }
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

    // Содержимое узла: номер (атака) или буква метода (защита)
    let label;
    if (arViewMode === 'defense' && s.defenseMethod) {
      label = s.defenseMethod.code.charAt(0);
    } else {
      label = String(s.id);
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
  const detailPanel = document.getElementById('arStageDetails');
  if (detailPanel) {
    detailPanel.classList.remove('open');
    detailPanel.style.display = 'none';
    // полный сброс инлайнов сайдбара
    ['top','bottom','left','right','width','maxHeight','height','borderRadius','borderTop','borderLeft','transform'].forEach(p => detailPanel.style[p] = '');
  }
  const root = document.getElementById('arSchemeRoot');
  if (root) root.classList.remove('panel-visible');
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

function openBookFromAR(bookId) {
  // Закрываем AR-экран и переходим на детальную страницу книги
  closeAR();
  openBookDetail(bookId);
}
