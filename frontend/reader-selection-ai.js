// ========== TEXT SELECTION ==========
function showSelectionToolbar() {
  if (state.currentScreen !== 'reader' || isEpubMode) return false;
  const s = window.getSelection();
  const selectedText = s ? s.toString().trim() : '';
  if (selectedText && selectedText.length > 0 && s.rangeCount > 0) {
    lastSelection = { text: selectedText, range: s.getRangeAt(0) };
    const toolbar = document.getElementById('selectionToolbar');
    const r = s.getRangeAt(0).getBoundingClientRect();
    const v = document.getElementById('pdfViewport').getBoundingClientRect();
    toolbar.style.display = 'flex';
    toolbar.style.left = Math.min(Math.max(r.left - v.left + r.width / 2 - 70, 10), v.width - 150) + 'px';
    toolbar.style.top = Math.max(r.top - v.top - 45, 5) + 'px';
    return true;
  }
  return false;
}

function hideSelectionToolbarSoon() {
  setTimeout(() => {
    if (!document.querySelector('.note-tooltip:hover') &&
        !document.querySelector('.selection-toolbar:hover')) {
      const tb = document.getElementById('selectionToolbar');
      if (tb) tb.style.display = 'none';
      lastSelection = null;
    }
  }, 200);
}

document.addEventListener('mouseup', function (e) {
  if (state.currentScreen !== 'reader' || isEpubMode) return;
  if (e.target.closest('.selection-toolbar')) return;
  if (!showSelectionToolbar()) hideSelectionToolbarSoon();
});

// Мобильные устройства: выделение пальцем завершается touchend.
// Задержка — чтобы браузер успел сформировать выделение (range).
document.addEventListener('touchend', function (e) {
  if (state.currentScreen !== 'reader' || isEpubMode) return;
  if (e.target.closest('.selection-toolbar')) return;
  setTimeout(() => {
    if (!showSelectionToolbar()) {
      // не скрываем агрессивно — на мобиле выделение может появиться чуть позже
    }
  }, 350);
}, { passive: true });

// Подстраховка: реагируем на изменение выделения (особенно на мобиле через ручки выделения)
document.addEventListener('selectionchange', function () {
  if (state.currentScreen !== 'reader' || isEpubMode) return;
  const s = window.getSelection();
  if (s && s.toString().trim().length > 0) {
    // дебаунс, чтобы не дёргать на каждое микродвижение
    clearTimeout(window._selToolbarTimer);
    window._selToolbarTimer = setTimeout(showSelectionToolbar, 400);
  }
});

// ===== A1: ИИ-функции читалки (словарь / объяснение / конспект) =====
function showReaderAiPopup(title, loadingText) {
  const ex = document.getElementById('readerAiPopup');
  if (ex) ex.remove();
  const p = document.createElement('div');
  p.id = 'readerAiPopup';
  p.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  p.innerHTML = `<div data-static-style="a522">
    <div data-static-style="a126">
      <h3 data-static-style="a523">${ICONS.sparkles || ''}<span>${eh(title)}</span></h3>
      <button data-onclick="closeModal('readerAiPopup')" data-static-style="a524">✕</button>
    </div>
    <div id="readerAiContent" data-static-style="a525">
      <div data-static-style="a526"><span class="ai-spinner" data-static-style="a527"></span>${eh(loadingText)}</div>
    </div>
  </div>`;
  p.onclick = (e) => { if (e.target === p) p.remove(); };
  document.body.appendChild(p);
}

async function runReaderAi(prompt, title, loading) {
  if (navigator.vibrate) navigator.vibrate(10);
  const tb = document.getElementById('selectionToolbar');
  if (tb) tb.style.display = 'none';
  showReaderAiPopup(title, loading);
  try {
    const ctx = buildAssistantContext(prompt);
    const data = await api.assistantChat([{ role: 'user', content: prompt }], ctx);
    const text = (data && (data.reply || data.content || data.message)) || (typeof data === 'string' ? data : '');
    const el = document.getElementById('readerAiContent');
    if (el) el.innerHTML = (typeof mdAssistant === 'function') ? mdAssistant(text) : eh(text).replace(/\n/g, '<br>');
  } catch (err) {
    const el = document.getElementById('readerAiContent');
    if (el) el.innerHTML = `<div data-static-style="a454">Не удалось получить ответ. ${err && err.status ? '(' + err.status + ')' : ''}</div>`;
  }
}

function lookupSelectionWord() {
  const word = (lastSelection?.text || '').trim();
  if (!word) return;
  runReaderAi(
    `Дай краткое определение и перевод термина «${word}» в контексте информационной безопасности. Коротко: 1) определение одним-двумя предложениями, 2) перевод на английский если термин русский (или на русский если английский).`,
    'Словарь: ' + (word.length > 30 ? word.slice(0, 30) + '…' : word),
    'Ищу определение…'
  );
}

function explainSelectionTerm() {
  const term = (lastSelection?.text || '').trim();
  if (!term) return;
  runReaderAi(
    `Объясни простыми словами, что означает «${term}» в контексте этой книги по кибербезопасности. Приведи короткий пример. Не более 4 предложений.`,
    'Объяснение',
    'Объясняю…'
  );
}

function summarizeCurrentChapter() {
  const pageText = (readerCurrentPageText || '').trim();
  if (!pageText) { showToast('Нет текста страницы для конспекта'); return; }
  runReaderAi(
    `Сделай краткое содержание этого фрагмента одним абзацем (3-4 предложения), выделив главную мысль:\n\n${pageText.slice(0, 4000)}`,
    'Краткое содержание',
    'Составляю конспект…'
  );
}

function highlightSelection(color) {
  if (!lastSelection || !currentBookId || isEpubMode) return;
  const v = document.getElementById('pdfViewport');
  const vr = v.getBoundingClientRect();
  const r = lastSelection.range.getBoundingClientRect();
  addHighlight(currentBookId, lastSelection.text, pdfCurrentPage, {
    x: (r.left - vr.left) / v.scrollWidth * 100,
    y: (r.top - vr.top) / v.scrollHeight * 100,
    w: r.width / v.scrollWidth * 100,
    h: r.height / v.scrollHeight * 100,
    color: color || '#fbbf24',
  });
  document.getElementById('selectionToolbar').style.display = 'none';
  window.getSelection().removeAllRanges();
  if (navigator.vibrate) navigator.vibrate(15);
  showToast('Выделено!');
}

function addNoteToSelection() {
  if (!lastSelection || !currentBookId || isEpubMode) return;
  const sel = lastSelection;  // фиксируем выделение, т.к. модалка асинхронная
  const v = document.getElementById('pdfViewport');
  const page = pdfCurrentPage;
  document.getElementById('selectionToolbar').style.display = 'none';
  showPromptModal({
    title: 'Заметка к выделенному тексту',
    placeholder: 'Введите текст заметки…',
    confirmText: 'Сохранить',
    onConfirm: (n) => {
      if (!n) return;
      const vr = v.getBoundingClientRect();
      const r = sel.range.getBoundingClientRect();
      addNote(currentBookId, sel.text, n, page, {
        x: (r.left - vr.left) / v.scrollWidth * 100,
        y: (r.top - vr.top) / v.scrollHeight * 100,
        w: r.width / v.scrollWidth * 100,
        h: r.height / v.scrollHeight * 100,
      });
      window.getSelection().removeAllRanges();
      showToast('Заметка сохранена');
    },
  });
}

