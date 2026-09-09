// ========== ВЫДЕЛЕНИЕ ТЕКСТА В EPUB ==========

let epubSelectionPopup = null;

function handleEpubSelection(cfiRange, contents) {
  const sel = contents.window.getSelection();
  const text = (sel && sel.toString()) || '';
  if (!text || !text.trim()) return;

  // Координаты выделения относительно окна iframe
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // Координаты iframe в основном окне
  const iframe = contents.document.defaultView.frameElement;
  if (!iframe) return;
  const iframeRect = iframe.getBoundingClientRect();

  // Финальные координаты pop-up в основной странице
  const x = iframeRect.left + rect.left + rect.width / 2;
  const y = iframeRect.top + rect.top - 10;

  showEpubSelectionPopup(text.trim(), cfiRange, x, y, contents);
}

function showEpubSelectionPopup(selectedText, cfiRange, x, y, contents) {
  // Удаляем старый pop-up
  hideEpubSelectionPopup();

  const popup = document.createElement('div');
  popup.id = 'epubSelectionPopup';
  popup.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    transform: translate(-50%, -100%);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 6px;
    display: flex;
    gap: 4px;
    z-index: 9999;
    box-shadow: 0 6px 20px rgba(0,0,0,0.4);
  `;

  popup.innerHTML = `
    <button id="epubBtnHighlight" data-static-style="a486">
      ${ICONS.marker}<span>Маркер</span>
    </button>
    <button id="epubBtnNote" data-static-style="a487">
      ${ICONS.note}<span>Заметка</span>
    </button>
  `;

  document.body.appendChild(popup);
  epubSelectionPopup = popup;

  document.getElementById('epubBtnHighlight').onclick = async () => {
    hideEpubSelectionPopup();
    await saveEpubAnnotation('highlight', selectedText, cfiRange);
    if (contents && contents.window) contents.window.getSelection().removeAllRanges();
  };

  document.getElementById('epubBtnNote').onclick = async () => {
    hideEpubSelectionPopup();
    const sel = selectedText, cfi = cfiRange, ctx = contents;
    showPromptModal({
      title: 'Заметка к выделению',
      placeholder: 'Введите текст заметки…',
      confirmText: 'Сохранить',
      onConfirm: async (noteText) => {
        await saveEpubAnnotation('note', sel, cfi, noteText || '');
        if (ctx && ctx.window) ctx.window.getSelection().removeAllRanges();
      },
    });
  };

  // Авто-скрытие через 8 секунд
  setTimeout(hideEpubSelectionPopup, 8000);
}

function hideEpubSelectionPopup() {
  if (epubSelectionPopup) {
    epubSelectionPopup.remove();
    epubSelectionPopup = null;
  }
}

async function saveEpubAnnotation(type, text, cfiRange, noteText = '') {
  if (!state.currentBook) return;
  const bookId = state.currentBook.id;
  // position храним cfi — потом по нему восстановим выделение
  const pos = { cfi: cfiRange };
  const pageNum = epubCurrentPage || 1;

  if (type === 'highlight') {
    const created = await addHighlight(bookId, text, pageNum, pos);
    if (created) {
      applyEpubHighlight(cfiRange);
      showToast('Маркер сохранён');
    }
  } else if (type === 'note') {
    const created = await addNote(bookId, text, noteText, pageNum, pos);
    if (created) {
      applyEpubHighlight(cfiRange, true);
      showToast('Заметка сохранена');
    }
  }
}

function applyEpubHighlight(cfiRange, isNote = false) {
  // Используем встроенный механизм аннотаций epubjs
  if (!epubRendition) return;
  try {
    const color = isNote ? 'rgba(0, 212, 255, 0.35)' : 'rgba(251, 191, 36, 0.35)';
    epubRendition.annotations.highlight(
      cfiRange,
      {},
      () => {},  // onclick — пока ничего
      'epub-saved-highlight',
      { fill: color, 'fill-opacity': 1.0, 'mix-blend-mode': 'multiply' }
    );
  } catch (e) {
    console.warn('Не удалось применить highlight:', e);
  }
}

async function loadAndApplyEpubHighlights() {
  if (!state.currentBook || !epubRendition) return;
  try {
    const list = await getAnnotations(state.currentBook.id);
    list.forEach(a => {
      const cfi = a.position && a.position.cfi;
      if (cfi) applyEpubHighlight(cfi, a.type === 'note');
    });
  } catch (e) {
    console.warn('Не удалось загрузить highlights:', e);
  }
}

async function goToEpubAnnotation(bookId, cfi) {
  if (!cfi) return;
  // Открываем книгу. После того как читалка инициализируется, прыгаем к CFI.
  openReader(bookId);
  // Ждём готовности rendition и переходим к месту
  const tryGoto = () => {
    if (epubRendition) {
      try {
        epubRendition.display(cfi);
      } catch (e) {
        console.warn('Не удалось перейти к CFI:', e);
      }
    } else {
      setTimeout(tryGoto, 200);
    }
  };
  setTimeout(tryGoto, 800);  // даём время на загрузку EPUB
}

