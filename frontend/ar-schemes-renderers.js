// DOM renderers for AR cybersecurity schemes.
// Public functions intentionally remain global for classic-script handlers.

const AR_3D = {
  cube: '',
  pyramid: '',
  layers: '',
  octa: '',
};

function renderOwaspScheme() {
  const stages = AR_OWASP.stages;
  const colors = ['#ef4444','#f97316','#f97316','#f59e0b','#f59e0b',
                  '#eab308','#84cc16','#84cc16','#10b981','#3b82f6'];
  const nodes = _createArSchemeShell({
    scrollStyle: 'a012',
    wrapperStyle: 'a013',
    nodesStyle: 'a014',
    detailStyle: 'a018',
    detailHeaderStyle: 'a019',
    detailTitleStyle: 'a023',
    title: 'НАЖМИТЕ НА УЯЗВИМОСТЬ',
    hint: 'Нажми на уязвимость, чтобы узнать подробнее',
  });
  if (!nodes) return;

  stages.forEach((stage, index) => {
    const color = colors[index] || '#3b82f6';
    nodes.appendChild(_arDetailNode('button', {
      id: 'arNode' + stage.id,
      dynamicStyle: dynamicStyleToken`display:flex;align-items:center;gap:12px;width:100%;padding:10px 14px;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);border:1px solid ${color}44;border-left:4px solid ${color};border-radius:10px;color:#fff;font-family:inherit;cursor:pointer;text-align:left;transition:all 0.2s;pointer-events:auto;`,
      onClick: () => selectKillChainStage(stage.id),
    }, [
      _arDetailNode('div', {
        dynamicStyle: dynamicStyleToken`width:36px;height:36px;border-radius:8px;background:${color}22;border:1px solid ${color};color:${color};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;`,
        text: 'A' + String(stage.id).padStart(2, '0'),
      }),
      _arDetailNode('div', { staticStyle: 'a015' }, [
        _arDetailNode('div', { staticStyle: 'a016', text: stage.nameRu }),
        _arDetailNode('div', { staticStyle: 'a017', text: stage.name }),
      ]),
      _arDetailNode('div', {
        dynamicStyle: dynamicStyleToken`width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;`,
      }),
    ]));
  });

  _decorateArStageCollection(stages, 'arNode', 'owasp');
  initStageDetailsSwipe();
  initARPan();
  setTimeout(() => {
    stages.forEach((stage, index) => {
      const node = document.getElementById('arNode' + stage.id);
      if (!node) return;
      node.style.opacity = '0';
      node.style.transform = 'translateX(-32px)';
      setTimeout(() => {
        node.style.transition = 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.22,1,0.36,1), border-color 0.2s';
        node.style.opacity = '1';
        node.style.transform = 'translateX(0)';
      }, index * 60);
    });
  }, 50);
}

// ─── OSI: горизонтальные слои-плашки (L7 сверху, L1 снизу) ──────────────────
// ─── Универсальный рендер для линейных схем (NIST, IR, Defense in Depth, STRIDE) ───
// ─── NIST CSF: круговой цикл из 5 функций (SVG-кольцо) ──────────────────────
function _arSvgElement(tagName, attributes = {}, options = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tagName);
  Object.entries(attributes).forEach(([name, value]) => {
    if (value !== undefined && value !== null) node.setAttribute(name, String(value));
  });
  if (options.staticStyle) node.setAttribute('data-static-style', options.staticStyle);
  if (options.dynamicStyle) node.setAttribute('data-dynamic-style', options.dynamicStyle);
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.onClick) node.addEventListener('click', options.onClick);
  return node;
}

function _decorateArStageControl(node, stage, variant = 'card') {
  if (!node || !stage) return node;
  node.classList.add('ar-stage-control', 'ar-stage-control--' + variant);
  node.dataset.arStageId = String(stage.id);
  node.setAttribute('aria-label', `${stage.nameRu || stage.name || stage.code}: открыть описание этапа`);
  node.setAttribute('aria-pressed', 'false');
  if (node.tagName.toLowerCase() !== 'button') {
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      selectKillChainStage(stage.id);
    });
  } else {
    node.type = 'button';
  }
  return node;
}

function _decorateArStageCollection(stages, idPrefix = 'arNode', variant = 'card') {
  stages.forEach(stage => {
    _decorateArStageControl(document.getElementById(idPrefix + stage.id), stage, variant);
  });
}

function renderNistScheme() {
  const stages = AR_NIST.stages;
  const count = stages.length;
  const cx = 150, cy = 150, rOuter = 130, rInner = 70;
  const gap = 0.04;
  const segmentAngle = (Math.PI * 2) / count;

  function polar(radius, angle) {
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  }
  function segmentPath(index) {
    const start = -Math.PI / 2 + index * segmentAngle + gap / 2;
    const end = -Math.PI / 2 + (index + 1) * segmentAngle - gap / 2;
    const [x0o, y0o] = polar(rOuter, start);
    const [x1o, y1o] = polar(rOuter, end);
    const [x1i, y1i] = polar(rInner, end);
    const [x0i, y0i] = polar(rInner, start);
    const large = end - start > Math.PI ? 1 : 0;
    return `M ${x0o} ${y0o} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${rInner} ${rInner} 0 ${large} 0 ${x0i} ${y0i} Z`;
  }
  function labelPosition(index) {
    const middle = -Math.PI / 2 + (index + 0.5) * segmentAngle;
    return polar((rOuter + rInner) / 2, middle);
  }

  const nodes = _createArSchemeShell({
    scrollStyle: 'a030',
    nodesStyle: 'a031',
    title: 'НАЖМИТЕ НА ФУНКЦИЮ',
    hint: 'Нажми на функцию цикла, чтобы узнать подробнее',
  });
  if (!nodes) return;

  const svg = _arSvgElement('svg', {
    width: 300,
    height: 300,
    viewBox: '0 0 300 300',
  }, { staticStyle: 'a032' });
  svg.appendChild(_arSvgElement('circle', {
    cx, cy, r: rInner - 6,
    fill: 'rgba(0,212,255,0.06)',
    stroke: 'rgba(0,212,255,0.4)',
    'stroke-width': 1.5,
  }));
  svg.appendChild(_arSvgElement('text', {
    x: cx, y: cy - 6, 'text-anchor': 'middle',
    fill: '#00d4ff', 'font-size': 20, 'font-weight': 800,
  }, { staticStyle: 'a033', text: 'NIST' }));
  svg.appendChild(_arSvgElement('text', {
    x: cx, y: cy + 14, 'text-anchor': 'middle',
    fill: 'rgba(255,255,255,0.7)', 'font-size': 11,
  }, { staticStyle: 'a033', text: 'CSF' }));

  const arrows = _arSvgElement('g', { id: 'nistArrows' }, { staticStyle: 'a034' });
  stages.forEach((stage, index) => {
    const end = -Math.PI / 2 + (index + 1) * segmentAngle;
    const [x, y] = polar(rOuter + 12, end);
    const rotation = end * 180 / Math.PI + 90;
    arrows.appendChild(_arSvgElement('text', {
      x, y, 'text-anchor': 'middle',
      fill: 'rgba(0,212,255,0.6)', 'font-size': 12,
      transform: `rotate(${rotation} ${x} ${y})`,
    }, { staticStyle: 'a027', text: '▶' }));
  });
  svg.appendChild(arrows);

  stages.forEach((stage, index) => {
    const color = (stage.defenseMethod && stage.defenseMethod.color) || '#3b82f6';
    const [labelX, labelY] = labelPosition(index);
    svg.appendChild(_arSvgElement('path', {
      id: 'nistSeg' + stage.id,
      d: segmentPath(index),
      fill: color,
      'fill-opacity': 0.22,
      stroke: color,
      'stroke-width': 2,
    }, {
      dynamicStyle: dynamicStyleToken`cursor:pointer;transition:fill-opacity 0.25s, transform 0.4s cubic-bezier(0.22,1,0.36,1);transform-origin:${cx}px ${cy}px;opacity:0;`,
      onClick: () => selectKillChainStage(stage.id),
    }));
    svg.appendChild(_arSvgElement('text', {
      x: labelX, y: labelY + 5, 'text-anchor': 'middle',
      fill: '#fff', 'font-size': 15, 'font-weight': 800,
    }, { staticStyle: 'a026', text: stage.code }));
  });
  nodes.appendChild(svg);
  _decorateArStageCollection(stages, 'nistSeg', 'nist');

  initStageDetailsSwipe();
  initARPan();
  setTimeout(() => {
    stages.forEach((stage, index) => {
      const segment = document.getElementById('nistSeg' + stage.id);
      if (!segment) return;
      segment.style.transform = 'scale(0.6)';
      setTimeout(() => {
        segment.style.opacity = '1';
        segment.style.transform = 'scale(1)';
      }, index * 130);
    });
    const arrowsElement = document.getElementById('nistArrows');
    if (arrowsElement) setTimeout(() => { arrowsElement.style.opacity = '1'; }, count * 130 + 200);
  }, 60);
}

// ─── Defense in Depth: концентрические кольца (эшелоны вокруг данных) ───────
function renderDidScheme() {
  const stages = AR_DID.stages;
  const count = stages.length;
  const cx = 160, cy = 160;
  const rMax = 150, rMin = 34;
  const step = (rMax - rMin) / count;
  const rings = stages.map((stage, index) => {
    const rOuter = rMax - index * step;
    const rInner = rMax - (index + 1) * step;
    return {
      stage,
      rOuter,
      rInner,
      color: (stage.defenseMethod && stage.defenseMethod.color) || '#3b82f6',
      isCenter: index === count - 1,
    };
  });

  const nodes = _createArSchemeShell({
    scrollStyle: 'a030',
    nodesStyle: 'a031',
    title: 'НАЖМИТЕ НА СЛОЙ',
    hint: 'Нажми на слой защиты, чтобы узнать подробнее',
  });
  if (!nodes) return;

  const svg = _arSvgElement('svg', {
    width: 320,
    height: 320,
    viewBox: '0 0 320 320',
  }, { staticStyle: 'a039' });

  rings.forEach(({ stage, rOuter, color, isCenter }) => {
    svg.appendChild(_arSvgElement('circle', {
      id: 'didRing' + stage.id,
      cx, cy, r: rOuter,
      fill: color,
      'fill-opacity': isCenter ? 0.35 : 0.10,
      stroke: color,
      'stroke-width': 2,
    }, {
      staticStyle: 'a038',
      onClick: () => selectKillChainStage(stage.id),
    }));
  });
  rings.forEach(({ stage, rOuter, rInner, isCenter }) => {
    svg.appendChild(_arSvgElement('text', {
      x: cx,
      y: isCenter ? cy + 4 : cy - (rOuter + rInner) / 2 + 4,
      'text-anchor': 'middle',
      fill: '#fff',
      'font-size': isCenter ? 12 : 10,
      'font-weight': isCenter ? 800 : 700,
    }, { staticStyle: 'a026', text: stage.nameRu }));
  });
  nodes.appendChild(svg);
  _decorateArStageCollection(stages, 'didRing', 'did');

  initStageDetailsSwipe();
  initARPan();
  setTimeout(() => {
    rings.forEach(({ stage }, index) => {
      const ring = document.getElementById('didRing' + stage.id);
      if (!ring) return;
      setTimeout(() => { ring.style.opacity = '1'; }, index * 120);
    });
  }, 60);
}

// ─── Incident Response: вертикальный таймлайн вех ──────────────────────────

function _createArSchemeShell({
  scrollStyle,
  nodesStyle = null,
  nodesDynamicStyle = null,
  title,
  hint,
  wrapperStyle = null,
  rootStyle = 'a008',
  zoomButtonStyle = 'a028',
  resetButtonStyle = 'a029',
  detailStyle = 'a035',
  detailHeaderStyle = 'a036',
  detailTitleStyle = 'a037',
  beforeScroll = [],
}) {
  const container = document.getElementById('arSchemeContainer');
  if (!container) return null;

  const controls = _arDetailNode('div', { staticStyle: 'a009' }, [
    _arDetailNode('button', { staticStyle: zoomButtonStyle, text: '+', onClick: () => zoomARScheme('in') }),
    _arDetailNode('button', { staticStyle: zoomButtonStyle, text: '−', onClick: () => zoomARScheme('out') }),
    _arDetailNode('button', { staticStyle: resetButtonStyle, text: '⟳', onClick: resetARSchemeZoom }),
  ]);

  const nodes = _arDetailNode('div', {
    id: 'killChainNodes',
    staticStyle: nodesStyle,
    dynamicStyle: nodesDynamicStyle,
  });
  let scrollChild = nodes;
  if (wrapperStyle) {
    scrollChild = _arDetailNode('div', {
      id: 'killChainWrapper',
      staticStyle: wrapperStyle,
    }, [nodes]);
  }
  const scroll = _arDetailNode('div', {
    id: 'killChainScrollContainer',
    staticStyle: scrollStyle,
  }, [scrollChild]);

  const toggleIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  toggleIcon.setAttribute('width', '18');
  toggleIcon.setAttribute('height', '18');
  toggleIcon.setAttribute('viewBox', '0 0 24 24');
  toggleIcon.setAttribute('fill', 'none');
  toggleIcon.setAttribute('stroke', 'currentColor');
  toggleIcon.setAttribute('stroke-width', '2.5');
  toggleIcon.setAttribute('stroke-linecap', 'round');
  toggleIcon.setAttribute('stroke-linejoin', 'round');
  toggleIcon.dataset.staticStyle = 'a022';
  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  chevron.setAttribute('points', '18 15 12 9 6 15');
  toggleIcon.appendChild(chevron);

  const toggle = _arDetailNode('button', {
    id: 'arStageToggleBtn',
    staticStyle: 'a021',
    onClick: toggleStageDetailsPanel,
  }, [toggleIcon]);
  toggle.title = 'Развернуть/свернуть';

  const details = _arDetailNode('div', {
    id: 'arStageDetails',
    className: 'ar-stage-details-panel',
    staticStyle: detailStyle,
  }, [
    _arDetailNode('div', { staticStyle: detailHeaderStyle }, [
      _arDetailNode('div', { staticStyle: 'a020' }),
      toggle,
      _arDetailNode('div', {
        id: 'arStageDetailTitle',
        staticStyle: detailTitleStyle,
        text: title,
      }),
    ]),
    _arDetailNode('div', { id: 'arStageDetailContent', staticStyle: 'a024' }),
  ]);

  const root = _arDetailNode('div', { id: 'arSchemeRoot', staticStyle: rootStyle }, [
    controls,
    ...beforeScroll,
    scroll,
    details,
    _arDetailNode('div', { id: 'arStageHint', staticStyle: 'a025', text: hint }),
  ]);
  container.replaceChildren(root);
  return nodes;
}

function renderIrScheme() {
  const stages = AR_IR.stages;
  const nodes = _createArSchemeShell({
    scrollStyle: 'a044',
    nodesStyle: 'a045',
    title: 'НАЖМИТЕ НА ЭТАП',
    hint: 'Нажми на этап реагирования, чтобы узнать подробнее',
  });
  if (!nodes) return;

  stages.forEach((stage, index) => {
    const color = (stage.defenseMethod && stage.defenseMethod.color) || '#3b82f6';
    const timeline = _arDetailNode('div', { staticStyle: 'a041' });
    timeline.appendChild(_arDetailNode('div', {
      id: 'arNode' + stage.id,
      dynamicStyle: dynamicStyleToken`width:36px;height:36px;border-radius:50%;background:${color}22;border:2px solid ${color};color:${color};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;cursor:pointer;flex-shrink:0;transition:all 0.25s;z-index:2;`,
      text: index + 1,
      onClick: () => selectKillChainStage(stage.id),
    }));
    if (index < stages.length - 1) {
      const nextColor = (stages[index + 1].defenseMethod && stages[index + 1].defenseMethod.color) || color;
      timeline.appendChild(_arDetailNode('div', {
        dynamicStyle: dynamicStyleToken`flex:1;width:2px;background:linear-gradient(${color},${nextColor});min-height:24px;opacity:0.5;`,
      }));
    }

    const card = _arDetailNode('button', {
      id: 'arCard' + stage.id,
      dynamicStyle: dynamicStyleToken`flex:1;text-align:left;margin-bottom:14px;padding:12px 14px;background:rgba(0,0,0,0.6);backdrop-filter:blur(10px);border:1px solid ${color}44;border-left:3px solid ${color};border-radius:10px;color:#fff;font-family:inherit;cursor:pointer;transition:all 0.2s;opacity:0;transform:translateX(20px);`,
      onClick: () => selectKillChainStage(stage.id),
    }, [
      _arDetailNode('div', { staticStyle: 'a042', text: stage.nameRu }),
      _arDetailNode('div', { staticStyle: 'a043', text: stage.name }),
    ]);
    nodes.appendChild(_arDetailNode('div', { staticStyle: 'a040' }, [timeline, card]));
  });
  _decorateArStageCollection(stages, 'arCard', 'ir');

  initStageDetailsSwipe();
  initARPan();
  setTimeout(() => {
    stages.forEach((stage, index) => {
      const card = document.getElementById('arCard' + stage.id);
      if (!card) return;
      setTimeout(() => {
        card.style.transition = 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.22,1,0.36,1)';
        card.style.opacity = '1';
        card.style.transform = 'translateX(0)';
      }, index * 90);
    });
  }, 60);
}

// ─── STRIDE: сетка 2×3 карточек категорий угроз ────────────────────────────
function renderStrideScheme() {
  const stages = AR_STRIDE.stages;
  const nodes = _createArSchemeShell({
    scrollStyle: 'a048',
    nodesStyle: 'a049',
    title: 'НАЖМИТЕ НА КАТЕГОРИЮ',
    hint: 'Нажми на категорию угроз, чтобы узнать подробнее',
  });
  if (!nodes) return;

  stages.forEach(stage => {
    const color = (stage.defenseMethod && stage.defenseMethod.color) || '#3b82f6';
    nodes.appendChild(_arDetailNode('button', {
      id: 'arCard' + stage.id,
      dynamicStyle: dynamicStyleToken`position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;aspect-ratio:1;padding:12px 8px;background:rgba(0,0,0,0.6);backdrop-filter:blur(10px);border:1px solid ${color}55;border-radius:14px;color:#fff;font-family:inherit;cursor:pointer;transition:all 0.25s;overflow:hidden;opacity:0;transform:scale(0.8);`,
      onClick: () => selectKillChainStage(stage.id),
    }, [
      _arDetailNode('div', {
        dynamicStyle: dynamicStyleToken`position:absolute;top:-10px;right:-6px;font-size:64px;font-weight:900;color:${color};opacity:0.13;line-height:1;`,
        text: stage.code,
      }),
      _arDetailNode('div', {
        dynamicStyle: dynamicStyleToken`width:42px;height:42px;border-radius:12px;background:${color}22;border:1.5px solid ${color};color:${color};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:20px;margin-bottom:8px;z-index:1;`,
        text: stage.code,
      }),
      _arDetailNode('div', { staticStyle: 'a046', text: stage.nameRu }),
      _arDetailNode('div', { staticStyle: 'a047', text: stage.name }),
    ]));
  });
  _decorateArStageCollection(stages, 'arCard', 'stride');

  initStageDetailsSwipe();
  initARPan();
  setTimeout(() => {
    stages.forEach((stage, index) => {
      const card = document.getElementById('arCard' + stage.id);
      if (!card) return;
      setTimeout(() => {
        card.style.transition = 'opacity 0.3s ease, transform 0.4s cubic-bezier(0.22,1,0.36,1)';
        card.style.opacity = '1';
        card.style.transform = 'scale(1)';
      }, index * 80);
    });
  }, 60);
}

function renderGenericScheme(scheme) {
  if (!scheme) return;
  const stages = scheme.stages;
  const nodes = _createArSchemeShell({
    scrollStyle: 'a012',
    wrapperStyle: 'a013',
    nodesStyle: 'a014',
    title: 'НАЖМИТЕ НА ЭТАП',
    hint: 'Нажми на этап, чтобы узнать подробнее',
  });
  if (!nodes) return;

  stages.forEach(stage => {
    const color = (stage.defenseMethod && stage.defenseMethod.color) || '#3b82f6';
    const badge = (stage.code || String(stage.id)).toUpperCase().slice(0, 4);
    nodes.appendChild(_arDetailNode('button', {
      id: 'arNode' + stage.id,
      dynamicStyle: dynamicStyleToken`display:flex;align-items:center;gap:12px;width:100%;padding:10px 14px;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);border:1px solid ${color}44;border-left:4px solid ${color};border-radius:10px;color:#fff;font-family:inherit;cursor:pointer;text-align:left;transition:all 0.2s;pointer-events:auto;`,
      onClick: () => selectKillChainStage(stage.id),
    }, [
      _arDetailNode('div', {
        dynamicStyle: dynamicStyleToken`width:40px;height:36px;border-radius:8px;background:${color}22;border:1px solid ${color};color:${color};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex-shrink:0;`,
        text: badge,
      }),
      _arDetailNode('div', { staticStyle: 'a015' }, [
        _arDetailNode('div', { staticStyle: 'a050', text: stage.nameRu }),
        _arDetailNode('div', { staticStyle: 'a051', text: stage.name }),
      ]),
      _arDetailNode('div', {
        dynamicStyle: dynamicStyleToken`width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;`,
      }),
    ]));
  });
  _decorateArStageCollection(stages, 'arNode', 'generic');

  initStageDetailsSwipe();
  initARPan();
  setTimeout(() => {
    stages.forEach((stage, index) => {
      const node = document.getElementById('arNode' + stage.id);
      if (!node) return;
      node.style.opacity = '0';
      node.style.transform = 'translateX(-32px)';
      setTimeout(() => {
        node.style.transition = 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.22,1,0.36,1), border-color 0.2s';
        node.style.opacity = '1';
        node.style.transform = 'translateX(0)';
      }, index * 60);
    });
  }, 50);
}

// ─── OSI: стопка из 7 слоёв (уровень 7 сверху, уровень 1 снизу) ────────────
function renderOsiScheme() {
  const stages = AR_OSI.stages.slice().reverse();
  const nodes = _createArSchemeShell({
    scrollStyle: 'a044',
    nodesStyle: 'a055',
    title: 'НАЖМИТЕ НА УРОВЕНЬ',
    hint: 'Нажми на уровень модели, чтобы узнать подробнее',
  });
  if (!nodes) return;

  nodes.appendChild(_arDetailNode('div', { staticStyle: 'a056', text: '▲ ДАННЫЕ ПОЛЬЗОВАТЕЛЯ' }));
  stages.forEach(stage => {
    const color = (stage.defenseMethod && stage.defenseMethod.color) || '#3b82f6';
    nodes.appendChild(_arDetailNode('button', {
      id: 'arNode' + stage.id,
      dynamicStyle: dynamicStyleToken`display:flex;align-items:center;gap:14px;width:100%;padding:14px 16px;background:linear-gradient(135deg, ${color}33, ${color}11);backdrop-filter:blur(10px);border:1px solid ${color}66;border-radius:10px;color:#fff;font-family:inherit;cursor:pointer;text-align:left;transition:all 0.25s;box-shadow:0 4px 14px ${color}22;opacity:0;transform:translateY(-16px);`,
      onClick: () => selectKillChainStage(stage.id),
    }, [
      _arDetailNode('div', {
        dynamicStyle: dynamicStyleToken`width:44px;height:44px;border-radius:10px;background:${color}33;border:1.5px solid ${color};color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;line-height:1;`,
      }, [
        _arDetailNode('div', { staticStyle: 'a052', text: 'LVL' }),
        _arDetailNode('div', { staticStyle: 'a053', text: stage.id }),
      ]),
      _arDetailNode('div', { staticStyle: 'a015' }, [
        _arDetailNode('div', { staticStyle: 'a042', text: stage.nameRu }),
        _arDetailNode('div', { staticStyle: 'a054', text: stage.name }),
      ]),
      _arDetailNode('div', {
        dynamicStyle: dynamicStyleToken`width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;box-shadow:0 0 8px ${color};`,
      }),
    ]));
  });
  _decorateArStageCollection(stages, 'arNode', 'osi');
  nodes.appendChild(_arDetailNode('div', { staticStyle: 'a057', text: 'ФИЗИЧЕСКАЯ СРЕДА ▼' }));

  initStageDetailsSwipe();
  initARPan();
  setTimeout(() => {
    stages.forEach((stage, index) => {
      const node = document.getElementById('arNode' + stage.id);
      if (!node) return;
      setTimeout(() => {
        node.style.transition = 'opacity 0.3s ease, transform 0.4s cubic-bezier(0.22,1,0.36,1)';
        node.style.opacity = '1';
        node.style.transform = 'translateY(0)';
      }, index * 80);
    });
  }, 60);
}

// ─── MITRE: матрица тактик 2 колонки с цветовой кодировкой фаз ───────────────
// ─── MITRE ATT&CK: горизонтальная лента тактик (путь атаки) ────────────────
function renderMitreScheme() {
  const stages = AR_MITRE.stages;
  function dangerColor(index, total) {
    const ratio = index / (total - 1);
    return `hsl(${200 - ratio * 200}, 70%, 55%)`;
  }

  const heading = _arDetailNode('div', {
    staticStyle: 'a063',
    text: 'РАЗВЕДКА ──────▶ ВОЗДЕЙСТВИЕ (листай вбок)',
  });
  const nodes = _createArSchemeShell({
    scrollStyle: 'a064',
    nodesStyle: 'a065',
    title: 'НАЖМИТЕ НА ТАКТИКУ',
    hint: 'Нажми на тактику атаки, чтобы узнать подробнее',
    beforeScroll: [heading],
  });
  if (!nodes) return;

  stages.forEach((stage, index) => {
    const color = dangerColor(index, stages.length);
    const group = _arDetailNode('div', { staticStyle: 'a058' });
    group.appendChild(_arDetailNode('button', {
      id: 'arNode' + stage.id,
      dynamicStyle: dynamicStyleToken`width:130px;min-height:120px;display:flex;flex-direction:column;align-items:flex-start;padding:12px;background:rgba(0,0,0,0.65);backdrop-filter:blur(10px);border:1px solid ${color}66;border-top:3px solid ${color};border-radius:12px;color:#fff;font-family:inherit;cursor:pointer;text-align:left;transition:all 0.25s;flex-shrink:0;opacity:0;transform:translateY(16px);`,
      onClick: () => selectKillChainStage(stage.id),
    }, [
      _arDetailNode('div', { staticStyle: 'a059' }, [
        _arDetailNode('div', {
          dynamicStyle: dynamicStyleToken`width:26px;height:26px;border-radius:7px;background:${color}33;border:1px solid ${color};color:${color};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;flex-shrink:0;`,
          text: index + 1,
        }),
        _arDetailNode('div', { staticStyle: 'a060', text: stage.code }),
      ]),
      _arDetailNode('div', { staticStyle: 'a061', text: stage.nameRu }),
      _arDetailNode('div', { staticStyle: 'a062', text: stage.name }),
    ]));
    if (index < stages.length - 1) {
      group.appendChild(_arDetailNode('div', {
        dynamicStyle: dynamicStyleToken`color:${color};font-size:18px;margin:0 4px;flex-shrink:0;opacity:0.7;`,
        text: '→',
      }));
    }
    nodes.appendChild(group);
  });
  _decorateArStageCollection(stages, 'arNode', 'mitre');

  initStageDetailsSwipe();
  initARPan();
  setTimeout(() => {
    stages.forEach((stage, index) => {
      const node = document.getElementById('arNode' + stage.id);
      if (!node) return;
      setTimeout(() => {
        node.style.transition = 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.22,1,0.36,1)';
        node.style.opacity = '1';
        node.style.transform = 'translateY(0)';
      }, index * 55);
    });
  }, 60);
}
function findKillChainStageForBook(book) {
  // Ищем первую категорию книги, которая привязана к этапу Kill Chain
  const cats = (book && book.categories) || [];
  for (const cat of cats) {
    const stage = activeScheme().stages.find(s => s.relatedCategory === cat);
    if (stage) return stage;
  }
  return null;
}
// Считается, что этап «изучен», если у юзера есть хотя бы одна книга
// из соответствующей категории со статусом completed
function isKillChainStageStudied(stage) {
  if (!state.currentUser || !state.books || !state.mylist) return false;
  const completedBookIds = Object.entries(state.mylist)
    .filter(([, status]) => status === 'completed')
    .map(([id]) => parseInt(id));
  if (completedBookIds.length === 0) return false;
  return state.books.some(b =>
    (b.categories || []).includes(stage.relatedCategory) && completedBookIds.includes(b.id)
  );
}

function renderKillChainScheme() {
  const toggle = document.getElementById('arViewModeToggle');
  if (toggle) toggle.style.display = 'flex';

  const savedMode = localStorage.getItem('aegis_killchain_mode') || 'attack';
  arViewMode = savedMode;
  setTimeout(() => setKillChainViewMode(savedMode), 50);

  const stages = activeScheme().stages;
  const isVertical = true;
  currentARSchemeZoom = 1;

  const nodes = _createArSchemeShell({
    rootStyle: 'a066',
    zoomButtonStyle: 'a067',
    resetButtonStyle: 'a068',
    scrollStyle: 'a069',
    wrapperStyle: 'a013',
    nodesDynamicStyle: dynamicStyleToken`display:flex;flex-direction:${isVertical ? 'column' : 'row'};align-items:center;justify-content:center;gap:${isVertical ? '12px' : '8px'};transition:transform 0.2s ease;transform-origin:center center;`,
    detailStyle: 'a073',
    detailHeaderStyle: 'a074',
    detailTitleStyle: 'a075',
    title: 'НАЖМИТЕ НА ЭТАП',
    hint: 'Нажми на этап, чтобы узнать подробнее',
  });
  if (!nodes) {
    console.error('arSchemeContainer не найден');
    return;
  }

  stages.forEach((stage, index) => {
    if (index > 0) {
      nodes.appendChild(_arDetailNode('div', {
        className: 'ar-chain-link' + (isVertical ? ' vertical' : ''),
        dynamicStyle: dynamicStyleToken`width:${isVertical ? '16px' : '28px'};height:${isVertical ? '28px' : '16px'};border:3px solid rgba(0,212,255,0.45);border-radius:50%;flex-shrink:0;margin:${isVertical ? '-6px 0' : '0 -6px'};box-shadow:0 0 8px rgba(0,212,255,0.2),inset 0 0 4px rgba(0,0,0,0.4);`,
      }));
    }

    const studied = isKillChainStageStudied(stage);
    const borderColor = studied ? '#10b981' : 'rgba(0,212,255,0.5)';
    const label = _arDetailNode('span', {
      className: 'killchain-node-label',
      dynamicStyle: dynamicStyleToken`font-size:${isVertical ? '26px' : '20px'};font-weight:800;line-height:1;text-shadow:0 1px 3px rgba(0,0,0,0.6);`,
      text: stage.id,
    });
    const markerChildren = [label];
    if (studied) {
      markerChildren.push(_arDetailNode('span', { staticStyle: 'a070', text: '✓' }));
    }
    const marker = _arDetailNode('span', {
      className: 'ar-killchain-node',
      dynamicStyle: dynamicStyleToken`border-color:${borderColor};`,
    }, markerChildren);
    const card = _arDetailNode('button', {
      id: 'arNode' + stage.id,
      className: 'ar-stage-item' + (studied ? ' is-studied' : ''),
      staticStyle: 'a071',
      onClick: () => selectKillChainStage(stage.id),
    }, [
      marker,
      _arDetailNode('span', { className: 'ar-stage-copy' }, [
        _arDetailNode('span', { className: 'ar-stage-kicker', text: `Этап ${stage.id} · ${stage.code}` }),
        _arDetailNode('span', { className: 'ar-stage-name', staticStyle: 'a072', text: stage.nameRu }),
        _arDetailNode('span', { className: 'ar-stage-action', text: 'Открыть разбор' }),
      ]),
    ]);
    _decorateArStageControl(card, stage, 'killchain');
    nodes.appendChild(card);
  });

  initStageDetailsSwipe();
  initARPan();

  if (isVertical) {
    setTimeout(() => {
      const scrollContainer = document.getElementById('killChainScrollContainer');
      if (scrollContainer && stages.length > 4) {
        const scrollHint = document.createElement('div');
        scrollHint.style.cssText = 'position:absolute;bottom:100px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.6);border-radius:20px;padding:6px 14px;font-size:10px;color:#fff;pointer-events:none;animation:fadeOut 2s forwards;z-index:15;';
        scrollHint.textContent = '↓ Листай вниз ↓';
        document.getElementById('arSchemeRoot').appendChild(scrollHint);
        setTimeout(() => scrollHint.remove(), 2000);
      }
    }, 500);
  }

  setTimeout(() => {
    document.querySelectorAll('.ar-stage-control--killchain').forEach((node, index) => {
      node.style.opacity = '0';
      node.style.transform = 'scale(0.5)';
      setTimeout(() => {
        node.style.transition = 'opacity 0.35s ease, transform 0.35s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s';
        node.style.opacity = '1';
        node.style.transform = 'scale(1)';
      }, index * 80);
    });
    setTimeout(() => {
      const first = document.getElementById('arNode1');
      if (first) first.style.animation = 'arNodePulse 2s ease-in-out 3';
    }, stages.length * 80 + 200);

  }, 100);
}

// Глобальные переменные для свайпа
