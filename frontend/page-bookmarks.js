// ===== D: Закладки страниц (быстрый переход, отдельно от аннотаций) =====
const PAGE_BOOKMARKS_KEY = 'aegis_page_bookmarks';
function getPageBookmarks() {
  try { return JSON.parse(lsGet(PAGE_BOOKMARKS_KEY) || '{}'); } catch (_) { return {}; }
}
function savePageBookmarks(obj) { lsSet(PAGE_BOOKMARKS_KEY, JSON.stringify(obj)); }
function getBookBookmarks(bookId) {
  const all = getPageBookmarks();
  return (all[bookId] || []).filter(page => Number.isInteger(page) && page > 0);
}
function currentReaderPage() {
  return isEpubMode ? epubCurrentPage : pdfCurrentPage;
}
function togglePageBookmark() {
  if (!currentBookId) return;
  const all = getPageBookmarks();
  const page = currentReaderPage();
  const list = all[currentBookId] || [];
  const idx = list.indexOf(page);
  if (idx >= 0) { list.splice(idx, 1); showToast('Закладка убрана'); }
  else { list.push(page); list.sort((a, b) => a - b); showToast('Страница в закладках'); }
  all[currentBookId] = list;
  savePageBookmarks(all);
  if (navigator.vibrate) navigator.vibrate(12);
  updateBookmarkIcon();
}
function updateBookmarkIcon() {
  const icon = document.getElementById('bookmarkIcon');
  if (!icon || !currentBookId) return;
  const has = getBookBookmarks(currentBookId).includes(currentReaderPage());
  icon.setAttribute('fill', has ? 'var(--accent)' : 'none');
  icon.setAttribute('stroke', has ? 'var(--accent)' : 'currentColor');
}
function openBookmarksList() {
  if (!currentBookId) return;
  const list = getBookBookmarks(currentBookId);
  const ex = document.getElementById('bookmarksListModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'bookmarksListModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  const panel = document.createElement('div');
  panel.setAttribute('data-static-style', 'a490');
  const header = document.createElement('div');
  header.setAttribute('data-static-style', 'a126');
  const heading = document.createElement('h3');
  heading.setAttribute('data-static-style', 'a127');
  heading.textContent = 'Закладки';
  const close = document.createElement('button');
  close.setAttribute('data-static-style', 'a128');
  close.textContent = '✕';
  close.addEventListener('click', () => m.remove());
  header.append(heading, close);
  const rows = document.createElement('div');
  rows.id = 'bookmarksListRows';
  if (!list.length) {
    const empty = document.createElement('div');
    empty.setAttribute('data-static-style', 'a351');
    empty.textContent = 'Закладок пока нет. Нажмите на флажок в панели, чтобы добавить.';
    rows.appendChild(empty);
  } else {
    list.forEach(page => {
      const row = document.createElement('button');
      row.setAttribute('data-static-style', 'a488');
      const label = document.createElement('span');
      appendTrustedIcon(label, ICONS.bookmark);
      label.appendChild(document.createTextNode(` Страница ${page}`));
      const remove = document.createElement('span');
      remove.setAttribute('data-static-style', 'a489');
      remove.textContent = '✕';
      remove.addEventListener('click', event => {
        event.stopPropagation();
        removeBookmark(page);
      });
      row.append(label, remove);
      row.addEventListener('click', () => jumpToBookmark(page));
      rows.appendChild(row);
    });
  }
  panel.append(header, rows);
  m.appendChild(panel);
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  document.body.appendChild(m);
}
function jumpToBookmark(page) {
  const m = document.getElementById('bookmarksListModal');
  if (m) m.remove();
  goToPage(page);
}
function removeBookmark(page) {
  const all = getPageBookmarks();
  all[currentBookId] = (all[currentBookId] || []).filter(p => p !== page);
  savePageBookmarks(all);
  updateBookmarkIcon();
  openBookmarksList();
}
