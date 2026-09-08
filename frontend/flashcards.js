// Карточки из заметок и интервальное повторение.
// ===== E3: Режим повторения (flashcards из заметок, spaced-repetition) =====
const SRS_KEY = 'aegis_srs';            // {cardId: {box, due}}
const SRS_BOXES = [1, 2, 4, 7, 14, 30]; // интервалы в днях по «коробкам» Лейтнера

function getSRS() { try { return JSON.parse(lsGet(SRS_KEY) || '{}'); } catch (_) { return {}; } }
function saveSRS(o) { lsSet(SRS_KEY, JSON.stringify(o)); }

function _cardId(bookId, ann) { return `${bookId}:${ann.page}:${(ann.text || '').slice(0, 24)}`; }

async function buildFlashcards() {
  // Карточки из всех аннотаций книг в mylist: лицо = выделение, оборот = заметка/контекст
  const cards = [];
  const bookIds = Object.keys(state.mylist || {});
  for (const bid of bookIds) {
    let ann = [];
    try { ann = await api.library.annotations(Number(bid)); } catch (_) { continue; }
    const b = (state.books || []).find(x => String(x.id) === String(bid));
    (ann || []).forEach(a => {
      const text = a.selected_text || '';
      const note = a.note_text || '';
      if (!text && !note) return;
      cards.push({
        id: _cardId(bid, { page: a.page, text }),
        bookTitle: b?.title || 'Книга',
        page: a.page,
        front: text || note,
        back: note || `Стр. ${a.page} · ${b?.title || ''}`,
      });
    });
  }
  return cards;
}

function dueCards(cards) {
  const srs = getSRS();
  const now = Date.now();
  // Карточка «к повторению», если её срок наступил или она новая
  return cards.filter(c => {
    const rec = srs[c.id];
    if (!rec) return true;
    return rec.due <= now;
  });
}

let _reviewQueue = [];
let _reviewIdx = 0;

async function openReviewMode() {
  const ex = document.getElementById('reviewModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'reviewModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  m.innerHTML = `<div data-static-style="a491">
    <div data-static-style="a126">
      <h3 data-static-style="a492">Повторение</h3>
      <button data-onclick="closeModal('reviewModal')" data-static-style="a493">✕</button>
    </div>
    <div id="reviewBody" data-static-style="a494">Готовлю карточки…</div>
  </div>`;
  document.body.appendChild(m);

  const all = await buildFlashcards();
  if (!all.length) {
    document.getElementById('reviewBody').innerHTML = '<div data-static-style="a495">Нет карточек. Делайте выделения и заметки в книгах — они станут карточками для повторения.</div>';
    return;
  }
  _reviewQueue = dueCards(all);
  if (!_reviewQueue.length) {
    document.getElementById('reviewBody').innerHTML = `<div data-static-style="a495">На сегодня всё повторено! 🎉<br><br>Всего карточек: ${all.length}. Возвращайтесь завтра.</div>`;
    return;
  }
  _reviewIdx = 0;
  renderReviewCard();
}

function renderReviewCard() {
  const body = document.getElementById('reviewBody');
  if (!body) return;
  if (_reviewIdx >= _reviewQueue.length) {
    body.innerHTML = `<div data-static-style="a496">Сессия завершена! 🎉<br><br>Повторено карточек: ${_reviewQueue.length}</div>`;
    return;
  }
  const c = _reviewQueue[_reviewIdx];
  body.innerHTML = `
    <div data-static-style="a497">${_reviewIdx + 1} из ${_reviewQueue.length} · ${eh(c.bookTitle)}</div>
    <div id="flashcard" data-onclick="flipFlashcard()" data-static-style="a498">
      <div id="flashFront" data-static-style="a499">${eh(c.front)}</div>
      <div id="flashBack" data-static-style="a500">${eh(c.back)}</div>
    </div>
    <div id="flashHint" data-static-style="a501">Нажмите на карточку, чтобы увидеть ответ</div>
    <div id="flashRating" data-static-style="a502">
      <button data-onclick="rateCard(false)" data-static-style="a503">Повторить ещё</button>
      <button data-onclick="rateCard(true)" data-static-style="a504">Помню</button>
    </div>`;
}

function flipFlashcard() {
  const back = document.getElementById('flashBack');
  const front = document.getElementById('flashFront');
  const hint = document.getElementById('flashHint');
  const rating = document.getElementById('flashRating');
  if (!back) return;
  front.style.display = 'none';
  back.style.display = 'block';
  if (hint) hint.style.display = 'none';
  if (rating) rating.style.display = 'flex';
  if (navigator.vibrate) navigator.vibrate(8);
}

function rateCard(remembered) {
  const c = _reviewQueue[_reviewIdx];
  const srs = getSRS();
  const rec = srs[c.id] || { box: 0 };
  if (remembered) rec.box = Math.min(rec.box + 1, SRS_BOXES.length - 1);
  else rec.box = 0;
  const days = SRS_BOXES[rec.box];
  rec.due = Date.now() + days * 24 * 60 * 60 * 1000;
  srs[c.id] = rec;
  saveSRS(srs);
  _reviewIdx++;
  renderReviewCard();
}
