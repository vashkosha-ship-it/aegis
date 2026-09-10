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

function flashNode(tagName, text, staticStyle) {
  const node = document.createElement(tagName);
  if (staticStyle) node.setAttribute('data-static-style', staticStyle);
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function renderFlashMessage(container, firstLine, secondLine, staticStyle) {
  const message = flashNode('div', undefined, staticStyle);
  message.append(
    document.createTextNode(firstLine),
    document.createElement('br'),
    document.createElement('br'),
    document.createTextNode(secondLine),
  );
  container.replaceChildren(message);
}

async function openReviewMode() {
  const ex = document.getElementById('reviewModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'reviewModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  const panel = flashNode('div', undefined, 'a491');
  const header = flashNode('div', undefined, 'a126');
  const heading = flashNode('h3', 'Повторение', 'a492');
  const close = flashNode('button', '✕', 'a493');
  close.addEventListener('click', () => m.remove());
  header.append(heading, close);
  const body = flashNode('div', 'Готовлю карточки…', 'a494');
  body.id = 'reviewBody';
  panel.append(header, body);
  m.appendChild(panel);
  document.body.appendChild(m);

  const all = await buildFlashcards();
  if (!all.length) {
    replaceWithStaticText(document.getElementById('reviewBody'), 'Нет карточек. Делайте выделения и заметки в книгах — они станут карточками для повторения.', 'a495');
    return;
  }
  _reviewQueue = dueCards(all);
  if (!_reviewQueue.length) {
    renderFlashMessage(document.getElementById('reviewBody'), 'На сегодня всё повторено! 🎉', `Всего карточек: ${all.length}. Возвращайтесь завтра.`, 'a495');
    return;
  }
  _reviewIdx = 0;
  renderReviewCard();
}

function renderReviewCard() {
  const body = document.getElementById('reviewBody');
  if (!body) return;
  if (_reviewIdx >= _reviewQueue.length) {
    renderFlashMessage(body, 'Сессия завершена! 🎉', `Повторено карточек: ${_reviewQueue.length}`, 'a496');
    return;
  }
  const c = _reviewQueue[_reviewIdx];
  const progress = flashNode('div', `${_reviewIdx + 1} из ${_reviewQueue.length} · ${c.bookTitle}`, 'a497');
  const card = flashNode('div', undefined, 'a498');
  card.id = 'flashcard';
  const front = flashNode('div', c.front, 'a499');
  front.id = 'flashFront';
  const back = flashNode('div', c.back, 'a500');
  back.id = 'flashBack';
  card.append(front, back);
  card.addEventListener('click', flipFlashcard);
  const hint = flashNode('div', 'Нажмите на карточку, чтобы увидеть ответ', 'a501');
  hint.id = 'flashHint';
  const rating = flashNode('div', undefined, 'a502');
  rating.id = 'flashRating';
  const retry = flashNode('button', 'Повторить ещё', 'a503');
  retry.addEventListener('click', () => rateCard(false));
  const remember = flashNode('button', 'Помню', 'a504');
  remember.addEventListener('click', () => rateCard(true));
  rating.append(retry, remember);
  body.replaceChildren(progress, card, hint, rating);
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
