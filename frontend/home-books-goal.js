// ===== D: Виджет цели по книгам =====
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
        <div data-dynamic-style="${dynamicStyleToken`height:100%;width:${pct}%;background:var(--accent-gradient);transition:width 0.4s;`}"></div>
      </div>
      <div data-static-style="a319">${pct >= 100 ? '🎉 Цель достигнута!' : `Осталось ${goal.count - done} — продолжайте!`}</div>
    </div>`;
}
