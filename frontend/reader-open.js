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
  if (btnSearch && !btnSearch.innerHTML.trim()) btnSearch.innerHTML = ICONS.search;
  // Заполняем SVG-иконки в кнопках шапки читалки
  const btnPom = document.getElementById('btnPomodoro');
  const btnExp = document.getElementById('btnExportNotes');
  if (btnPom && !btnPom.innerHTML.trim()) btnPom.innerHTML = ICONS.timer;
  if (btnExp && !btnExp.innerHTML.trim()) btnExp.innerHTML = ICONS.export;
  // Также заполняем SVG в toolbar выделения текста PDF
  const btnHighlight = document.getElementById('btnPdfHighlight');
  const btnNote = document.getElementById('btnPdfNote');
  if (btnHighlight && !btnHighlight.querySelector('svg')) {
    btnHighlight.innerHTML = ICONS.marker + '<span>Маркер</span>';
  }
  if (btnNote && !btnNote.querySelector('svg')) {
    btnNote.innerHTML = ICONS.note + '<span>Заметка</span>';
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
