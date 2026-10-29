'use strict';

// Окно «Дубли книг»: группы с рекомендацией, выбор книги, которую оставить,
// и объединение — на сервер уходят выбранная книга и остальные копии.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');
const asScript = code => code.replace(/^'use strict';/m, '');

const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
const { window } = dom;
const merges = [];
let reloads = 0;
const groups = [
  {
    confidence: 'certain', keep_id: 3705, reasons: ['Совпадает название, авторы в другом порядке'],
    books: [
      { id: 3704, title: 'Знакомство с PyTorch', author: 'Делип Рао, Брайан Макмахан', total_pages: 256, file_format: 'pdf', has_file: true, readers: 0 },
      { id: 3705, title: 'Знакомство с PyTorch', author: 'Брайан Макмахан, Делип Рао', total_pages: 256, file_format: 'pdf', has_file: true, readers: 4 },
    ],
  },
  {
    confidence: 'likely', keep_id: 91, reasons: ['Похожее название, те же авторы и число страниц'],
    books: [
      { id: 91, title: 'Облачные микросервисы', author: 'Кофлер', total_pages: 626, file_format: 'pdf', has_file: true, readers: 0 },
      { id: 386, title: 'Облачные микросервисы: разработка на Kubernetes', author: 'Михаэль Кофлер', total_pages: 626, file_format: 'pdf', has_file: true, readers: 0 },
    ],
  },
];
window.api = {
  books: {
    duplicates: async () => groups,
    mergeDuplicates: async payload => { merges.push(payload); return { kept: payload.keep_id, removed: payload.remove_ids, moved_readers: 0 }; },
  },
};
window.loadBooksFromApi = async () => { reloads += 1; };
window.showToast = () => {};
window.eval(asScript(read('dialogs.js')));
window.eval(asScript(read('admin-duplicates.js')));

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

(async () => {
  await window.openDuplicatesModal();
  const modal = window.document.getElementById('duplicatesModal');
  assert.ok(modal, 'окно открылось');
  assert.match(modal.querySelector('.dup-lead').textContent, /Найдено групп: 2, лишних копий: 2/);
  const cards = modal.querySelectorAll('.dup-group');
  assert.equal(cards.length, 2);
  assert.equal(cards[0].querySelector('.dup-badge').textContent, 'Точный дубль');
  assert.equal(cards[1].querySelector('.dup-badge').textContent, 'Проверьте');
  assert.match(cards[0].textContent, /4 читателя/);

  // По умолчанию отмечена рекомендованная книга.
  const radios = cards[0].querySelectorAll('input[type="radio"]');
  assert.equal(cards[0].querySelector('input:checked').value, '3705');

  // Администратор выбирает другую — на сервер уходит его выбор.
  radios[0].checked = true;
  cards[0].querySelector('.dup-merge').click();
  await flush();
  assert.equal(JSON.stringify(merges), JSON.stringify([{ keep_id: 3704, remove_ids: [3705] }]));
  assert.ok(cards[0].classList.contains('dup-group--done'));
  assert.match(cards[0].querySelector('.dup-status').textContent, /оставлена #3704/);

  // Кнопки массового объединения: все группы и только точные.
  assert.match(modal.querySelector('.dup-merge-all').textContent, /Объединить все \(2\)/);
  assert.match(modal.querySelector('.dup-merge-certain').textContent, /Только точные \(1\)/);

  // «Объединить все» после подтверждения сливает оставшиеся группы.
  modal.querySelector('.dup-merge-all').click();
  const confirm = [...window.document.querySelectorAll('button')].find(b => b.textContent === 'Объединить' && !b.classList.contains('dup-merge'));
  assert.ok(confirm, 'спрашивает подтверждение');
  confirm.click();
  for (let i = 0; i < 20 && merges.length < 2; i += 1) await new Promise(resolve => setTimeout(resolve, 60));
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(JSON.stringify(merges[1]), JSON.stringify({ keep_id: 91, remove_ids: [386] }));
  assert.ok(cards[1].classList.contains('dup-group--done'));

  // Закрытие после объединения обновляет каталог.
  modal.querySelector('#duplicatesCloseBtn').click();
  await flush();
  assert.equal(window.document.getElementById('duplicatesModal'), null);
  assert.equal(reloads, 1);

  // Подключение: кнопка в админке, скрипт в index.html и в кэше.
  assert.match(read('admin-screens.js'), /adminDuplicatesBtn'\)\.addEventListener\('click', openDuplicatesModal\)/);
  assert.match(read('index.html'), /<script defer src="admin-duplicates\.js"><\/script>/);
  assert.ok(read('sw.js').includes("'/admin-duplicates.js'"));
  assert.ok(read('sw.js').includes("'/css/components/duplicates.css'"));
  console.log('admin-duplicates: ok');
})().catch(error => { console.error(error); process.exit(1); });
