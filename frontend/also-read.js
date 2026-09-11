// Рекомендации «Также читают» на странице книги.
async function loadAlsoRead(bookId) {
  const container = document.getElementById('alsoReadSection');
  if (!container) return;
  try {
    const books = await api.library.alsoRead(bookId, 8);
    if (!books || !books.length) { container.replaceChildren(); return; }
    replaceWithAppMarkup(container, `
      <div class="section-title" data-static-style="a472">Также читают</div>
      <div data-static-style="a473">
        ${books.map(book => `
          <div data-onclick="openBookDetail(${book.id})" data-static-style="a474">
            <div data-static-style="a475">
              ${book.has_cover ? `<img src="${api.books.coverUrl(book.id)}" alt="" data-static-style="a118">` : '<div data-static-style="a476">📕</div>'}
            </div>
            <div data-static-style="a477">${eh(book.title)}</div>
            <div data-static-style="a344">${eh(book.author)}</div>
          </div>
        `).join('')}
      </div>`);
  } catch (_) {
    container.replaceChildren();
  }
}
