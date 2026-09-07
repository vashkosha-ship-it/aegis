'use strict';

/* Рендеринг и взаимодействия с аннотациями в PDF-читалке. */

async function convertToNote(annId) {
  const list = await getAnnotations(currentBookId);
  const ann = list.find(a => a.id === annId);
  if (!ann) return;
  showPromptModal({
    title: 'Заметка',
    placeholder: 'Введите текст заметки…',
    confirmText: 'Сохранить',
    onConfirm: (noteText) => { if (noteText) convertToNoteSave(ann, noteText); },
  });
}

async function convertToNoteSave(ann, noteText) {

  try {
    await api.library.addAnnotation(currentBookId, {
      type: 'note',
      page: ann.page,
      selected_text: ann.text,
      note_text: noteText.trim(),
      position: ann.position || {},
    });
    await api.library.deleteAnnotation(ann.id);

    delete annotationsCache[currentBookId];
    document.querySelectorAll('.note-tooltip').forEach(e => e.remove());
    await renderAnnotations();
    showToast('Заметка сохранена!');
  } catch (err) {
    showToast('Не удалось преобразовать');
  }
}

function annotationPercent(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : fallback;
}

function annotationColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : '#fbbf24';
}

async function renderAnnotations() {
  if (isEpubMode) return;
  const layer = document.getElementById('annotationLayer');
  if (!layer || !currentBookId) return;
  const list = await getAnnotations(currentBookId);
  const onPage = list.filter(a => a.page === pdfCurrentPage);
  layer.innerHTML = onPage.map(a => {
    const x = annotationPercent(a.position?.x, a.type === 'highlight' ? 10 : 15);
    const y = annotationPercent(a.position?.y, a.type === 'highlight' ? 10 : 15);
    if (a.type === 'highlight') {
      const width = annotationPercent(a.position?.w, 30);
      const height = annotationPercent(a.position?.h, 3);
      const color = annotationColor(a.position?.color);
      return `<div class="highlight-mark" style="left:${x}%;top:${y}%;width:${width}%;height:${height}%;background:${color}55;border-bottom:2px solid ${color};" title="${eh(a.text)}" data-onclick="showAnnotationDetail(${a.id})"></div>`;
    }
    return `<div class="note-indicator" style="left:${x}%;top:${y}%;" data-onclick="showNoteTooltip(${a.id})">${ICONS.bookmark}</div>`;
  }).join('');
}

async function showAnnotationDetail(id) {
  const list = await getAnnotations(currentBookId);
  const ann = list.find(a => a.id === id);
  if (!ann) return;
  document.querySelectorAll('.note-tooltip').forEach(e => e.remove());
  const t = document.createElement('div');
  t.className = 'note-tooltip';
  t.innerHTML = `<div data-static-style="a228">${eh(ann.text.substring(0, 100))}${ann.text.length > 100 ? '...' : ''}</div><div data-static-style="a229"><button class="btn-sm" data-onclick="deleteAnnotationFromTooltip(${currentBookId},${id},2)" data-nonce="${sensitiveNonce()}" data-args="this">${ICONS.trash} Удалить</button>${ann.type === 'highlight' ? `<button class="btn-sm" data-onclick="convertToNote(${id})">${ICONS.bookmark} Заметка</button>` : ''}</div>`;
  t.style.left = (ann.position?.x || 10) + '%';
  t.style.top = ((ann.position?.y || 10) + 5) + '%';
  document.getElementById('pdfViewport').appendChild(t);
}

async function showNoteTooltip(id) {
  const list = await getAnnotations(currentBookId);
  const ann = list.find(a => a.id === id);
  if (!ann) return;
  document.querySelectorAll('.note-tooltip').forEach(e => e.remove());
  const t = document.createElement('div');
  t.className = 'note-tooltip';
  t.innerHTML = `<div data-static-style="a230">${ICONS.bookmark} Заметка</div><div data-static-style="a228">${eh(ann.note)}</div><button class="btn-sm" data-onclick="deleteAnnotationFromTooltip(${currentBookId},${id},1)" data-nonce="${sensitiveNonce()}" data-args="this">${ICONS.trash} Удалить</button>`;
  t.style.left = (ann.position?.x || 15) + '%';
  t.style.top = ((ann.position?.y || 15) + 3) + '%';
  document.getElementById('pdfViewport').appendChild(t);
}

async function deleteAnnotationFromTooltip(bookId, annId, removeLevels, element) {
  const deleted = await deleteAnnotation(bookId, annId);
  if (!deleted) return false;
  const tooltip = element && typeof element.closest === 'function'
    ? element.closest('.note-tooltip')
    : null;
  if (tooltip) tooltip.remove();
  else document.querySelectorAll('.note-tooltip').forEach(node => node.remove());
  return true;
}
