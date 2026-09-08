// Оглавление книги и прогресс чтения по главам.
// ===== E2: Оглавление (TOC) с прогрессом по главам =====
let _currentTOC = null;

async function buildTOC() {
  // Возвращает [{title, page}] из PDF outline или EPUB navigation
  const items = [];
  try {
    if (isEpubMode && epubBook) {
      const nav = await epubBook.loaded.navigation;
      (nav.toc || []).forEach((it, i) => {
        items.push({ title: it.label.trim(), page: i + 1, href: it.href });
      });
    } else if (pdfDoc) {
      const outline = await pdfDoc.getOutline();
      if (outline) {
        for (const it of outline) {
          let page = null;
          try {
            if (it.dest) {
              const dest = typeof it.dest === 'string' ? await pdfDoc.getDestination(it.dest) : it.dest;
              if (dest && dest[0]) {
                const idx = await pdfDoc.getPageIndex(dest[0]);
                page = idx + 1;
              }
            }
          } catch (_) { /* Оставляем главу без номера страницы. */ }
          items.push({ title: it.title.trim(), page: page });
        }
      }
    }
  } catch (_) { /* Повреждённое оглавление трактуем как пустое. */ }
  return items;
}

const TOC_READ_KEY = 'aegis_toc_read';
function getTocRead(bookId) {
  try { return JSON.parse(lsGet(TOC_READ_KEY) || '{}')[bookId] || []; } catch (_) { return []; }
}
function toggleTocRead(bookId, idx) {
  let all = {};
  try { all = JSON.parse(lsGet(TOC_READ_KEY) || '{}'); } catch (_) { /* Начинаем с пустого прогресса. */ }
  const list = all[bookId] || [];
  const i = list.indexOf(idx);
  if (i >= 0) list.splice(i, 1); else list.push(idx);
  all[bookId] = list;
  lsSet(TOC_READ_KEY, JSON.stringify(all));
  if (navigator.vibrate) navigator.vibrate(8);
  renderTocPanel();
}

async function openTOC() {
  if (!currentBookId) return;
  const ex = document.getElementById('tocModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'tocModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  m.innerHTML = `<div data-static-style="a304">
    <div data-static-style="a126">
      <h3 data-static-style="a127">Оглавление</h3>
      <button data-onclick="closeModal('tocModal')" data-static-style="a128">✕</button>
    </div>
    <div id="tocPanelBody" data-static-style="a129">Загружаю оглавление…</div>
  </div>`;
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  document.body.appendChild(m);
  _currentTOC = await buildTOC();
  renderTocPanel();
}

function renderTocPanel() {
  const body = document.getElementById('tocPanelBody');
  if (!body) return;
  if (!_currentTOC || !_currentTOC.length) {
    body.style.textAlign = 'center';
    body.innerHTML = '<div data-static-style="a130">В этой книге нет встроенного оглавления.</div>';
    return;
  }
  const read = getTocRead(currentBookId);
  const total = _currentTOC.length;
  const doneCount = read.length;
  const pct = Math.round(doneCount / total * 100);
  body.style.textAlign = 'left';
  body.style.padding = '0';
  body.innerHTML = `
    <div data-static-style="a472">
      <div data-static-style="a505"><span>Прогресс по главам</span><span>${doneCount}/${total} · ${pct}%</span></div>
      <div data-static-style="a446"><div style="height:100%;width:${pct}%;background:var(--accent-gradient);"></div></div>
    </div>
    ${_currentTOC.map((it, i) => {
      const isRead = read.includes(i);
      return `<div data-static-style="a506">
        <button data-onclick="toggleTocRead(${currentBookId},${i})" title="Отметить прочитанным" style="width:22px;height:22px;flex-shrink:0;border-radius:6px;border:2px solid ${isRead ? 'var(--accent)' : 'var(--border-light)'};background:${isRead ? 'var(--accent)' : 'transparent'};color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;">${isRead ? '✓' : ''}</button>
        <div ${it.page ? `data-onclick="tocGoTo(${it.page})"` : ''} style="flex:1;cursor:${it.page ? 'pointer' : 'default'};font-size:13px;color:${isRead ? 'var(--text-muted)' : 'var(--text-primary)'};${isRead ? 'text-decoration:line-through;' : ''}">
          ${eh(it.title)}${it.page ? `<span data-static-style="a140"> · стр. ${it.page}</span>` : ''}
        </div>
      </div>`;
    }).join('')}`;
}

function tocGoTo(page) {
  const m = document.getElementById('tocModal');
  if (m) m.remove();
  goToPage(page);
}
