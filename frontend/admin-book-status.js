// Статус книги в админке: почему не проиндексировалась и почему скрыта от
// читателей. Отдельно от admin-books.js, чтобы тот не разрастался.

// Книга, которую нельзя открыть, скрыта от читателей; админ видит причину.
const FILE_PROBLEM_LABELS = {
  damaged: 'файл повреждён',
  password: 'файл под паролем',
  missing: 'файла нет на сервере',
};

function bookHiddenReason(book) {
  if (!book) return null;
  if (book.file_problem) return FILE_PROBLEM_LABELS[book.file_problem] || 'файл не открывается';
  if (!book.has_file) return 'нет файла';
  return null;
}

// Книга открывается, но файл плохой — подсказка админу (книга не скрыта).
const FILE_WARNING_LABELS = {
  pdf_conversion: 'Перегнана из PDF',
};
const FILE_WARNING_HINTS = {
  pdf_conversion: 'EPUB перегнан из PDF: в тексте пробелы вместо переносов («Ев ропол сооб щил»), каждая строка — отдельный абзац. Читать можно, но лучше загрузить оригинальный PDF или нормальный EPUB.',
};

function bookFileWarningLabel(book) {
  return (book && book.file_warning && FILE_WARNING_LABELS[book.file_warning]) || null;
}

function renderAdminBookHiddenNotice(book) {
  const notice = document.getElementById('adminBookHiddenNotice');
  if (!notice) return;
  const reason = bookHiddenReason(book);
  notice.hidden = !reason && !bookFileWarningLabel(book);
  notice.classList.toggle('admin-hidden-notice--warning', !reason && Boolean(bookFileWarningLabel(book)));
  if (!reason) {
    if (bookFileWarningLabel(book)) {
      notice.textContent = FILE_WARNING_HINTS[book.file_warning];
      notice.title = '';
    }
    return;
  }
  const fix = book.file_problem === 'password'
    ? 'Загрузите файл без пароля — книга снова появится у читателей.'
    : 'Загрузите целый файл — книга снова появится у читателей.';
  notice.textContent = `Скрыта от читателей: ${reason}. ${fix}`;
  notice.title = book.file_problem_detail || '';
}

const INDEX_ERROR_EXPLANATIONS = [
  [/FileNotDecrypted|not been decrypted|password|encrypt|паролем|DRM/i,
    'PDF защищён паролем — текст из него не прочитать. Нужен файл без пароля.'],
  [/отсутствует в хранилище|не найден в хранилище|нет активного файла/i,
    'Файла книги нет на сервере. Загрузите файл заново.'],
  [/EOF marker|startxref|trailer|xref|PdfReadError|PdfStreamError|Stream has ended|EmptyFileError|PdfiumError|Failed to load document|BadZipFile|не найден OPF|повреждён|не PDF|нет ни одной (главы|страницы)|нет описания книги|пустой/i,
    'Файл повреждён или загружен не полностью. Загрузите целый файл заново.'],
  [/ни одной секции/i,
    'В файле нет текста — скорее всего, это скан страниц. Читать книгу можно, искать по тексту — нет.'],
  [/ExtractionTimeout|заняло больше/i,
    'Книга разбиралась слишком долго и была остановлена. Попробуйте ещё раз, когда сервер не загружен.'],
  [/PdfTooLarge|больше допустимых/i,
    'Файл слишком большой для индексации.'],
  [/памят|memory/i,
    'Серверу не хватило памяти на эту книгу. Попробуйте ещё раз, когда сервер не загружен.'],
  [/[Оо]черед/i,
    'Не удалось поставить книгу в очередь. Нажмите «Повторить» ещё раз.'],
];

function explainIndexError(error) {
  const text = String(error || '');
  const match = INDEX_ERROR_EXPLANATIONS.find(([pattern]) => pattern.test(text));
  if (match) return match[1];
  return text.length > 240 ? `${text.slice(0, 237)}…` : text;
}

async function showBookIndexError(bookId, title) {
  let data;
  try {
    data = await api.books.indexStatus(bookId);
  } catch (err) {
    return showToast('Не удалось узнать причину ошибки');
  }
  const raw = String(data.error || '');
  const explained = raw ? explainIndexError(raw) : 'Причина не сохранилась. Попробуйте проиндексировать книгу ещё раз.';
  showInfoModal({
    id: 'indexErrorModal',
    title: title ? `Ошибка индексации: ${title}` : 'Ошибка индексации',
    message: explained,
    footnote: raw && explained !== raw ? `Техническая причина: ${raw.slice(0, 500)}` : '',
  });
}

function booksWithFileWarning() {
  return (state.books || []).filter(book => book.file_warning);
}

function booksWithFileProblem() {
  return (state.books || []).filter(book => book.has_file && book.file_problem);
}

// Пометка под названием книги в таблице админки.
function appendAdminBookStatusBadge(cell, book) {
  const hiddenReason = bookHiddenReason(book);
  const warning = bookFileWarningLabel(book);
  if (!hiddenReason && !warning) return;
  const badge = document.createElement('span');
  badge.className = hiddenReason ? 'admin-hidden-badge' : 'admin-hidden-badge admin-hidden-badge--warning';
  badge.textContent = hiddenReason ? `Скрыта: ${hiddenReason}` : warning;
  badge.title = hiddenReason
    ? (book.file_problem_detail || 'Читатели эту книгу не видят')
    : (FILE_WARNING_HINTS[book.file_warning] || '');
  cell.append(document.createElement('br'), badge);
}

// Кнопка-фильтр над таблицей: «Скрыты от читателей: 2» / «Показать все книги».
function updateAdminBookFilterButton(id, count, active, label) {
  const button = document.getElementById(id);
  if (!button) return;
  button.hidden = count === 0 && !active;
  button.textContent = active ? 'Показать все книги' : `${label}: ${count}`;
  button.classList.toggle('active', active);
}
