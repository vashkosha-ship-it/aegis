// ===== Рекомендации =====
// Учитываем уровень знаний (cyber_level), личную историю чтения и
// популярность; книги по кибербезопасности получают дополнительный вес.

function bookMatchesKeywords(book, keywords) {
  if (!keywords) return false;
  const hay = ((book.categories || []).join(' ') + ' ' + (book.title || '') + ' ' + (book.author || '')).toLowerCase();
  return keywords.some(k => hay.includes(k));
}

// Ключевые слова сложности для уровня знаний сопоставляем с темами книг.
const LEVEL_TOPICS = {
  gate_guardian:    ['основ', 'введен', 'beginner', 'для начинающих', 'азбук', 'чайник', 'basics', 'fundamental'],
  scout:            ['основ', 'practical', 'практическ', 'hands-on', 'introduction', 'web', 'сет'],
  stronghold:       ['security engineering', 'pentest', 'пентест', 'attacking', 'cloud', 'практическ', 'defense', 'защит'],
  shadow_architect: ['advanced', 'продвинут', 'architecture', 'архитектур', 'apt', 'red team', 'exploit', 'reverse'],
  abyss_warden:     ['advanced', 'architecture', 'архитектур', 'cyberwar', 'нулев', 'zero day', 'research', 'эксперт', 'strategy'],
};

function levelTopicKeywords() {
  const lvl = state.currentUser && state.currentUser.cyber_level;
  if (!lvl) return null;
  return LEVEL_TOPICS[lvl] || null;
}

// Темы безопасности получают дополнительный вес: Aegis — библиотека по
// кибербезопасности, и среди равных кандидатов первыми должны идти книги
// по ИБ, а не Delphi или квантовые вычисления.
const SECURITY_CATEGORY_RE = /безопасн|security|appsec|devsecops|пентест|оффенсив|offensive|blue team|защит|криминалист|dfir|инцидент|вредонос|malware|реверс|reverse|социальная инженерия|grc|риски|соответствие|криптограф/i;
const SECURITY_BOOST = 45;

function isSecurityBook(book) {
  return (book.categories || []).some(category => SECURITY_CATEGORY_RE.test(category));
}

function getRecommendations(limit = 5) {
  if (!state.currentUser) return [];
  const levelKeywords = levelTopicKeywords();

  const ub = Object.entries(state.mylist || {}).filter(([, s]) => ['reading', 'completed', 'liked'].includes(s)).map(([id]) => parseInt(id));
  const cats = new Set(), auths = new Set();
  ub.forEach(id => {
    const b = state.books.find(x => x.id === id);
    if (b) { (b.categories || []).forEach(c => cats.add(c)); auths.add(b.author); }
  });

  return state.books.filter(b => !ub.includes(b.id))
    .map(b => {
      const bookCats = b.categories || [];
      const hasMatchingCategory = bookCats.some(c => cats.has(c));
      const lvlMatch = bookMatchesKeywords(b, levelKeywords);
      const score = (lvlMatch ? 50 : 0)                 // по уровню знаний
                  + (hasMatchingCategory ? 40 : 0)      // затем — личная история
                  + (auths.has(b.author) ? 25 : 0)
                  + (isSecurityBook(b) ? SECURITY_BOOST : 0)
                  + (b.popularity || 0) / 20;
      return { b, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.b);
}
