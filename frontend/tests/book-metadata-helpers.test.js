'use strict';

// Названия из имён файлов при массовой загрузке и выбор схемы атаки для книги.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FRONTEND = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(FRONTEND, name), 'utf8');

function extract(source, pattern) {
  const match = source.match(pattern);
  assert.ok(match, `не найдено: ${pattern}`);
  return match[0];
}

const bulk = read('admin-bulk-upload.js');
const titleContext = {};
vm.createContext(titleContext);
vm.runInContext(extract(bulk, /function titleFromFilename[\s\S]*?\n}\n/), titleContext);
const title = titleContext.titleFromFilename;

assert.equal(title('Building_Quantum_Software_in_Python_A_developer_39_s_guide.pdf'), "Building Quantum Software in Python A developer's guide");
assert.equal(title('A developer&#39;s guide.epub'), "A developer's guide");
assert.equal(title('media books kontroliruemyj vzlom 3 izd CKba2sE.pdf'), 'kontroliruemyj vzlom 3 izd');
assert.equal(title('Sebastiano M Cossu - Beginning Game AI 2021 Apress - libgen.li.pdf'), 'Sebastiano M Cossu Beginning Game AI 2021 Apress');
assert.equal(title('Java-Beginners-To-Advance.pdf'), 'Java Beginners To Advance');
assert.equal(title('Объектно-ориентированный Python.pdf'), 'Объектно-ориентированный Python');
// Обычное слово из 7 букв в конце — не служебный хвост.
assert.equal(title('Mastering Unity Program.pdf'), 'Mastering Unity Program');
assert.equal(title('.pdf'), 'Без названия');
assert.match(bulk, /meta\.title \|\| titleFromFilename/);
assert.match(bulk, /author: meta\.author \|\| '—'/);

const renderers = read('ar-schemes-renderers.js');
const schemeContext = {};
vm.createContext(schemeContext);
vm.runInContext(read('ar-schemes-data.js'), schemeContext);
vm.runInContext([
  extract(renderers, /const SCHEME_FOR_CATEGORY = \{[\s\S]*?\n\};\n/),
  extract(renderers, /const SCHEME_TITLES = \{[\s\S]*?\n\};\n/),
  extract(renderers, /function findSchemeStageForBook[\s\S]*?\n}\n/),
  'this.findSchemeStageForBook = findSchemeStageForBook; this.AR_SCHEMES = AR_SCHEMES; this.SCHEME_FOR_CATEGORY = SCHEME_FOR_CATEGORY;',
].join('\n'), schemeContext);
const find = schemeContext.findSchemeStageForBook;

// Книга по сетям — модель OSI, а не Cyber Kill Chain.
const networks = find({ categories: ['Компьютерные сети', 'Сетевая архитектура и защита периметра (Defensive Blue Team)'] });
assert.equal(networks.schemeCode, 'osi');
assert.equal(networks.stage.relatedCategory, 'Сетевая архитектура и защита периметра (Defensive Blue Team)');
assert.equal(find({ categories: ['Веб-безопасность'] }).schemeCode, 'owasp');
assert.equal(find({ categories: ['Социальная инженерия и человеческий фактор'] }).schemeCode, 'killchain');
assert.equal(find({ categories: ['Программирование'] }), null);
assert.equal(find({}), null);

// Каждая категория, на которую ссылаются схемы, ведёт хотя бы в одну схему,
// и в данных нет расходящихся написаний одной и той же категории.
const used = new Set();
for (const scheme of Object.values(schemeContext.AR_SCHEMES)) {
  for (const stage of scheme.stages) if (stage.relatedCategory) used.add(stage.relatedCategory);
}
for (const category of used) {
  assert.ok(schemeContext.SCHEME_FOR_CATEGORY[category], `нет схемы для «${category}»`);
}
assert.ok(!used.has('Управление безопасности данных'));
assert.ok(!used.has('Практический менеджмент и GRC (Управление, риск, соответствие)'));

// Дубликаты в пачке массовой загрузки сравниваются по нормализованному названию.
const keyContext = {};
vm.createContext(keyContext);
vm.runInContext(extract(bulk, /function normalizeTitleKey[\s\S]*?\n}\n/), keyContext);
assert.equal(keyContext.normalizeTitleKey('  Ёжик, в тумане! '), 'ежик в тумане');
assert.equal(keyContext.normalizeTitleKey('SQL — Курс'), keyContext.normalizeTitleKey('sql курс'));
assert.match(bulk, /item\.status = 'skipped'/);
assert.match(bulk, /uploadErr\.status === 409/);

console.log('Book metadata helper tests passed');
