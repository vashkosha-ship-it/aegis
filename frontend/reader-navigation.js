// Переходы между страницами PDF и EPUB.
function goToPage(pn) {
  const total = isEpubMode ? (epubTotalPages || 1) : pdfTotalPages;
  const target = Math.max(1, Math.min(pn, total));
  if (navigator.vibrate) navigator.vibrate(8);

  if (isEpubMode && !epubLocationsReady) {
    // Нумерация ещё считается: перейти на страницу по номеру нельзя,
    // соседние страницы листаются через goToNextPage/goToPrevPage.
    showToast('Страницы ещё считаются, переход по номеру будет доступен через несколько секунд');
    return;
  }

  if (isEpubMode) {
    epubCurrentPage = target;
    if (epubRendition) {
      const cfi = epubBook?.locations?.cfiFromLocation(target - 1);
      epubRendition.display(typeof cfi === 'string' ? cfi : undefined);
    }
  } else {
    pdfCurrentPage = target;
  }

  if (state.currentBook) {
    state.readingProgress[state.currentBook.id].currentPage = target;
    scheduleProgressSave(state.currentBook.id);
  }
  updatePageIndicator();
  renderAnnotations();
  if (!isEpubMode && pdfDoc) renderPdfPage(target);
  else if (!isEpubMode) generateDemoPdf(state.currentBook);
}

function updateSlider() {
  updatePageIndicator();
}


// ===== Переход на конкретную страницу =====
// Нажатие на «12 / 363» в панели читалки (или «…» → «Перейти на страницу»)
// открывает окно с номером страницы и ползунком.
function readerPageBounds() {
  const total = isEpubMode ? (epubTotalPages || 1) : (pdfTotalPages || 1);
  const current = isEpubMode ? (epubCurrentPage || 1) : (pdfCurrentPage || 1);
  return { total, current };
}

function parseTargetPage(value, total) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return { error: 'Введите номер страницы цифрами' };
  const page = Number(text);
  if (page < 1 || page > total) return { error: `Страницы с таким номером нет: в книге от 1 до ${total}` };
  return { page };
}

function openGoToPageDialog() {
  if (isEpubMode && !epubLocationsReady) {
    showToast('Страницы ещё считаются, переход по номеру будет доступен через несколько секунд');
    return;
  }
  const { total, current } = readerPageBounds();
  const { overlay, panel } = createDialogShell('goToPageModal', 'Перейти на страницу');
  panel.classList.add('goto-page-dialog');

  const form = document.createElement('form');
  form.className = 'goto-page-form';
  form.noValidate = true;

  const row = document.createElement('div');
  row.className = 'goto-page-row';
  const input = document.createElement('input');
  input.type = 'number';
  input.id = 'goToPageInput';
  input.className = 'app-dialog-input goto-page-input';
  input.inputMode = 'numeric';
  input.min = '1';
  input.max = String(total);
  input.value = String(current);
  input.setAttribute('aria-label', `Номер страницы, от 1 до ${total}`);
  const of = document.createElement('span');
  of.className = 'goto-page-total';
  of.textContent = `из ${total}`;
  row.append(input, of);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'goto-page-slider';
  slider.min = '1';
  slider.max = String(total);
  slider.value = String(current);
  slider.setAttribute('aria-label', 'Выбрать страницу ползунком');
  slider.addEventListener('input', () => { input.value = slider.value; error.textContent = ''; });
  input.addEventListener('input', () => {
    const n = Number(input.value);
    if (Number.isInteger(n) && n >= 1 && n <= total) slider.value = String(n);
    error.textContent = '';
  });

  const error = document.createElement('div');
  error.className = 'goto-page-error';
  error.setAttribute('role', 'alert');

  const actions = document.createElement('div');
  actions.className = 'app-dialog-actions';
  const cancel = createDialogButton('goToPageCancel', 'Отмена', 'app-dialog-button app-dialog-button--cancel');
  const go = createDialogButton('goToPageOk', 'Перейти', 'app-dialog-button app-dialog-button--confirm');
  go.type = 'submit';
  actions.append(cancel, go);

  form.append(row, slider, error, actions);
  panel.appendChild(form);

  let keyHandler;
  const close = () => { overlay.remove(); document.removeEventListener('keydown', keyHandler); };
  keyHandler = event => { if (event.key === 'Escape') close(); };
  document.addEventListener('keydown', keyHandler);
  cancel.addEventListener('click', close);
  bindDialogClose(overlay, close);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const result = parseTargetPage(input.value, total);
    if (result.error) { error.textContent = result.error; input.focus(); return; }
    close();
    if (result.page !== current) goToPage(result.page);
  });

  input.focus();
  input.select();
}
