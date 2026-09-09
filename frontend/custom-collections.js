// Пользовательские коллекции книг.
let _collectionsCache = null;

async function getCollections(force) {
  if (_collectionsCache && !force) return _collectionsCache;
  try { _collectionsCache = await api.library.collections(); } catch (_) { _collectionsCache = []; }
  return _collectionsCache;
}

async function openAddToCollection(bookId) {
  const cols = await getCollections(true);
  const ex = document.getElementById('addToColModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'addToColModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  const rows = cols.map(col => {
    const has = (col.book_ids || []).includes(bookId);
    return `<button data-onclick="toggleBookInCollection(${col.id},${bookId},${has})" data-dynamic-style="${dynamicStyleToken`display:flex;justify-content:space-between;align-items:center;width:100%;padding:12px 14px;margin-bottom:6px;border-radius:10px;border:1px solid ${has ? 'var(--accent)' : 'var(--border)'};background:${has ? 'rgba(0,212,255,0.1)' : 'var(--bg-primary)'};color:var(--text-primary);cursor:pointer;font-family:inherit;font-size:13px;`}">
      <span>${eh(col.icon || '📁')} ${eh(col.name)}</span><span data-static-style="a478">${has ? '✓' : '+'}</span>
    </button>`;
  }).join('');
  m.innerHTML = `<div data-static-style="a479">
    <div data-static-style="a126">
      <h3 data-static-style="a127">В коллекцию</h3>
      <button data-onclick="closeModal('addToColModal')" data-static-style="a128">✕</button>
    </div>
    <div id="addToColRows">${rows || '<div data-static-style="a480">Пока нет коллекций</div>'}</div>
    <div data-static-style="a481">
      <input id="newColName" placeholder="Новая коллекция" data-static-style="a482">
      <button data-onclick="createCollectionFromModal(${bookId})" data-static-style="a483">Создать</button>
    </div>
  </div>`;
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  document.body.appendChild(m);
}

async function toggleBookInCollection(colId, bookId, has) {
  try {
    if (has) await api.library.removeFromCollection(colId, bookId);
    else await api.library.addToCollection(colId, bookId);
    if (navigator.vibrate) navigator.vibrate(10);
    await getCollections(true);
    await openAddToCollection(bookId);
  } catch (_) { showToast('Ошибка'); }
}

async function createCollectionFromModal(bookId) {
  const name = document.getElementById('newColName')?.value.trim();
  if (!name) { showToast('Введите название'); return; }
  try {
    const col = await api.library.createCollection(name);
    await api.library.addToCollection(col.id, bookId);
    await getCollections(true);
    showToast('Коллекция создана');
    await openAddToCollection(bookId);
  } catch (err) {
    showToast(err && err.detail ? err.detail : 'Не удалось создать');
  }
}
