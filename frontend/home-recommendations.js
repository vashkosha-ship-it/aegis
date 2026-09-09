// Рекомендации на главной странице.
function renderRecommendations() {
  const container = document.getElementById('sectionRecommendations');
  const list = document.getElementById('recommendationsList');
  if (!container || !list) return;

  const recs = getRecommendations(5);
  if (recs.length === 0) {
    container.style.display = 'none';
    return;
  }

  // Заголовок секции: если есть подразделение — подсказываем, что подборка под него
  const titleEl = container.querySelector('.section-title');
  if (titleEl) {
    const dep = state.currentUser && state.currentUser.department;
    titleEl.textContent = (dep && departmentTopicKeywords())
      ? `Рекомендуем для вашего подразделения`
      : 'Рекомендации';
  }

  container.style.display = 'block';
  list.innerHTML = recs.map(b => `
    <div class="recommendation-card" data-onclick="openBookDetail(${b.id})">
      <div data-static-style="a309">
        ${b.has_cover ? `<img src="${api.books.coverUrl(b.id)}" alt="" data-static-style="a310" data-onerror="replaceWithFallback()" data-args="this" data-fallback="cover">` : ICONS.bookCover}
      </div>
      <div>
        <div data-static-style="a311">${eh(b.title)}</div>
        <div data-static-style="a192">${eh(b.author)} • ${b.rating}</div>
      </div>
    </div>
  `).join('');
}
