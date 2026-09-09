// Экран «Мой список»: вкладки статусов и сетка книг.
document.getElementById('mylistTabs').addEventListener('click', e => {
  const t = e.target.closest('.mylist-tab');
  if (!t) return;
  state.mylistTab = t.dataset.mylist;
  renderMyList();
});

function renderMyList() {
  updateAvatar('avatarMylist');
  const g = { reading: [], planned: [], dropped: [], completed: [], liked: [] };
  state.books.forEach(b => {
    const s = state.mylist[b.id];
    if (s && g[s]) g[s].push(b);
  });
  document.querySelectorAll('.mylist-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.mylist === state.mylistTab);
    t.querySelector('.count').textContent = g[t.dataset.mylist]?.length || 0;
  });
  document.getElementById('mylistGrid').innerHTML = g[state.mylistTab]?.length
    ? g[state.mylistTab].map(b => cardHTML(b)).join('')
    : `<div class="mylist-empty"><div class="icon" data-static-style="a239">${ICONS.bookmark}</div><p>Пусто</p></div>`;

  initDragAndDrop();
}
