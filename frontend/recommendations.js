// ===== Рекомендации по подразделению (#10) =====
// Каждое подразделение → ключевые слова тем. Сопоставляем с категориями книг
// в каталоге (регистронезависимо, по вхождению). Коды и полные названия — оба варианта.
const DEPARTMENT_TOPICS = {
  'ЦКЗ':   ['soc', 'мониторинг', 'incident', 'инцидент', 'threat', 'ВПО', 'malware', 'форензик', 'forensic', 'siem', 'сетев', 'анализ'],
  'ДПМ':   ['мошенничес', 'fraud', 'социальн', 'social', 'osint', 'фишинг', 'phishing', 'поведенч'],
  'УБД':   ['данны', 'data', 'dlp', 'приватнос', 'privacy', 'субд', 'database', 'классификац', 'gdpr'],
  'УКИИ':  ['ии', 'ai', 'machine learning', 'ml', 'нейросет', 'adversarial', 'модел'],
  'УКАИ':  ['криптограф', 'crypto', 'pki', 'tls', 'iam', 'аутентификац', 'идентификац', 'zero trust', 'ключ'],
  'УМК':   ['методолог', 'governance', 'compliance', 'риск', 'risk', 'дизайн', 'ux', 'метрик', 'nist'],
  'УЭК':   ['пентест', 'pentest', 'red team', 'эксплуатац', 'уязвим', 'web', 'веб', 'exploit', 'devops', 'devsecops'],
  'ЦКГ':   ['архитектур', 'стратег', 'лидер', 'ciso', 'enterprise', 'программ', 'devsecops', 'управлени'],
  'ЦУПКБ': ['продукт', 'product', 'vendor', 'рынок', 'mvp', 'управлени'],
  'ЦВВ':   ['коммуникац', 'переговор', 'влияни', 'изменени', 'команд', 'взаимодейств', 'поддержк'],
};

// Возвращает ключевые слова тем для текущего пользователя по его подразделению.
function departmentTopicKeywords() {
  const dep = (state.currentUser && state.currentUser.department) || '';
  if (!dep) return null;
  // Сопоставляем по коду в начале строки (ЦКЗ, ДПМ, ...) либо по подстроке.
  const upper = dep.toUpperCase();
  for (const code of Object.keys(DEPARTMENT_TOPICS)) {
    if (upper.startsWith(code) || upper.includes(code)) return DEPARTMENT_TOPICS[code];
  }
  return null; // «Другое» / не распознано → рекомендуем по уровню (см. ниже)
}

function bookMatchesDepartment(book, keywords) {
  if (!keywords) return false;
  const hay = ((book.categories || []).join(' ') + ' ' + (book.title || '') + ' ' + (book.author || '')).toLowerCase();
  return keywords.some(k => hay.includes(k));
}

// Для «Другое» / внешних людей — рекомендуем по уровню знаний (cyber_level).
// Ключевые слова сложности сопоставляем с темами книг.
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

function getRecommendations(limit = 5) {
  if (!state.currentUser) return [];
  const depKeywords = departmentTopicKeywords();
  // Если подразделение не распознано (или «Другое») — рекомендуем по уровню знаний.
  const levelKeywords = depKeywords ? null : levelTopicKeywords();

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
      const depMatch = bookMatchesDepartment(b, depKeywords);
      const lvlMatch = bookMatchesDepartment(b, levelKeywords);
      const score = (depMatch ? 60 : 0)               // приоритет — профиль подразделения
                  + (lvlMatch ? 50 : 0)                 // либо по уровню (для «Другое»)
                  + (hasMatchingCategory ? 40 : 0)      // затем — личная история
                  + (auths.has(b.author) ? 25 : 0)
                  + (b.popularity || 0) / 20;
      return { b, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.b);
}
