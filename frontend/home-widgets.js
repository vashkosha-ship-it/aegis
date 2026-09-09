// Виджеты рекомендаций и книжной цели на главной странице.
function renderRecommendations() {
  const container = document.getElementById('sectionRecommendations');
  const list = document.getElementById('recommendationsList');
  if (!container || !list) return;

  const recs = getRecommendations(5);
  if (recs.length === 0) {
    container.style.display = 'none';
    return;
  }

  const titleEl = container.querySelector('.section-title');
  if (titleEl) {
    const dep = state.currentUser && state.currentUser.department;
    titleEl.textContent = (dep && departmentTopicKeywords())
      ? 'Рекомендуем для вашего подразделения'
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

function renderBooksGoalWidget() {
  const section = document.getElementById('sectionBooksGoal');
  const wrap = document.getElementById('booksGoalWidget');
  if (!section || !wrap) return;
  const goal = getBooksGoal();
  if (!goal) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  const done = booksCompletedInPeriod();
  const pct = Math.min(100, Math.round(done / goal.count * 100));
  const periodLabel = goal.period === 'month' ? 'месяц' : goal.period === 'quarter' ? 'квартал' : 'год';
  wrap.innerHTML = `
    <div data-static-style="a316">
      <div data-static-style="a113">
        <div data-static-style="a317">Цель: ${goal.count} книг за ${periodLabel}</div>
        <div data-static-style="a318">${done}/${goal.count}</div>
      </div>
      <div data-static-style="a200">
        <div style="height:100%;width:${pct}%;background:var(--accent-gradient);transition:width 0.4s;"></div>
      </div>
      <div data-static-style="a319">${pct >= 100 ? '🎉 Цель достигнута!' : `Осталось ${goal.count - done} — продолжайте!`}</div>
    </div>`;
}
