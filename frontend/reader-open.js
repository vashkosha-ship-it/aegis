// Открытие книги и подготовка интерфейса читалки.
function openReader(id) {
  const b = state.books.find(x => x.id === id);
  if (!b) return;
  // Открыли заново — значит книга снова актуальна, возвращаем её
  // в блок «Продолжить», даже если раньше её оттуда убрали.
  unhideFromResume(id);
  currentBookId = id;
  state.currentBook = b;
  hideReaderEmptyStub();
  if (!state.readingProgress[id]) state.readingProgress[id] = { currentPage: 1, totalPages: 10, started: false };
  state.readingProgress[id].started = true;
  if (!state.mylist[id]) state.mylist[id] = 'reading';

  saveState();
  api.library.updateProgress(id, state.readingProgress[id].currentPage, state.readingProgress[id].totalPages).catch(e => console.error('progress on open failed:', e));
  setTimeout(() => { if (navigator.onLine) refreshGamificationFromApi(); }, 500);
  // Запоминаем откуда пришли (для умного возврата)
  state._readerReturnTo = state.currentScreen === 'reader' ? 'home' : state.currentScreen;
  navigateTo('reader');
  const btnSearch = document.getElementById('btnReaderSearch');
  if (btnSearch && !btnSearch.hasChildNodes()) appendTrustedIcon(btnSearch, ICONS.search);
  // Заполняем SVG-иконки в кнопках шапки читалки
  const btnPom = document.getElementById('btnPomodoro');
  const btnExp = document.getElementById('btnExportNotes');
  if (btnPom && !btnPom.hasChildNodes()) appendTrustedIcon(btnPom, ICONS.timer);
  if (btnExp && !btnExp.hasChildNodes()) appendTrustedIcon(btnExp, ICONS.export);
  // Также заполняем SVG в toolbar выделения текста PDF
  const btnHighlight = document.getElementById('btnPdfHighlight');
  const btnNote = document.getElementById('btnPdfNote');
  if (btnHighlight && !btnHighlight.querySelector('svg')) {
    appendTrustedIcon(btnHighlight, ICONS.marker);
    const label = document.createElement('span');
    label.textContent = 'Маркер';
    btnHighlight.appendChild(label);
  }
  if (btnNote && !btnNote.querySelector('svg')) {
    appendTrustedIcon(btnNote, ICONS.note);
    const label = document.createElement('span');
    label.textContent = 'Заметка';
    btnNote.appendChild(label);
  }
  // Применяем сохранённую тему чтения
  applyReaderTheme(getReaderTheme());
  document.getElementById('readerBookName').textContent = b.title;

  const format = b.file_format || 'pdf';
  document.getElementById('readerFormatBadge').textContent = format.toUpperCase();

  initReaderGestures();

  if (format === 'epub') {
    loadEpub(b);
  } else {
    loadPdf(b);
  }
}
