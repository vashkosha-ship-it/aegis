'use strict';

/* Обсуждения книги: комментарии, ответы и удаление. */

// ===== Обсуждения книги (комментарии + ответы) =====
let _replyingTo = null;

async function renderDiscussion() {
  const c = document.getElementById('detailTabDiscussion');
  if (!c || !currentBookId) return;
  c.innerHTML = `
    <div data-static-style="a204">
      <textarea id="discussInput" placeholder="Написать комментарий..." rows="3" data-static-style="a205"></textarea>
      <div id="discussReplyHint" data-static-style="a206"></div>
      <div data-static-style="a207">
        <button data-onclick="submitComment()" class="set-save-btn" data-static-style="a004">Отправить</button>
        <button id="discussCancelReply" data-onclick="cancelReply()" data-static-style="a208">Отмена</button>
      </div>
    </div>
    <div id="discussList" data-static-style="a129">Загрузка...</div>
  `;
  loadComments();
}

async function loadComments() {
  const list = document.getElementById('discussList');
  if (!list) return;
  try {
    const comments = await api.library.bookComments(currentBookId);
    if (!comments.length) {
      list.style.textAlign = 'center';
      list.innerHTML = '<div data-static-style="a209">Пока нет комментариев. Будьте первым!</div>';
      return;
    }
    list.style.textAlign = 'left';
    list.style.padding = '0';
    list.innerHTML = comments.map(renderCommentNode).join('');
  } catch (e) {
    list.innerHTML = '<div data-static-style="a137">Не удалось загрузить обсуждение.</div>';
  }
}

function _commentBubble(c, isReply) {
  const name = eh(c.author.full_name || c.author.username);
  const when = _formatCommentDate(c.created_at);
  const avatar = c.author.has_avatar
    ? `<img src="${api.users.avatarUrl(c.author.id)}" data-static-style="a210">`
    : `<div data-static-style="a211">${name.charAt(0).toUpperCase()}</div>`;
  return `
    <div style="display:flex;gap:10px;padding:10px 0;${isReply ? 'margin-left:42px;' : ''}">
      ${avatar}
      <div data-static-style="a015">
        <div data-static-style="a212">
          <span data-static-style="a213">${name}</span>
          <span data-static-style="a099">${when}</span>
        </div>
        <div data-static-style="a214">${eh(c.text)}</div>
        <div data-static-style="a215">
          ${!isReply ? `<button data-onclick="startReply(${c.id}, '${name.replace(/'/g, "\\'")}')" data-static-style="a216">Ответить</button>` : ''}
          ${c.can_delete ? `<button data-onclick="deleteComment(${c.id})" data-nonce="${sensitiveNonce()}" data-static-style="a217">Удалить</button>` : ''}
        </div>
      </div>
    </div>`;
}

function renderCommentNode(c) {
  const replies = (c.replies || []).map(r => _commentBubble(r, true)).join('');
  return `<div data-static-style="a218">${_commentBubble(c, false)}${replies}</div>`;
}

function _formatCommentDate(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'только что';
    if (diff < 3600) return Math.floor(diff / 60) + ' мин назад';
    if (diff < 86400) return Math.floor(diff / 3600) + ' ч назад';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) { return ''; }
}

function startReply(commentId, name) {
  _replyingTo = commentId;
  const hint = document.getElementById('discussReplyHint');
  const cancel = document.getElementById('discussCancelReply');
  const input = document.getElementById('discussInput');
  if (hint) { hint.style.display = 'block'; hint.textContent = `Ответ для ${name}`; }
  if (cancel) cancel.style.display = 'block';
  if (input) input.focus();
}

function cancelReply() {
  _replyingTo = null;
  const hint = document.getElementById('discussReplyHint');
  const cancel = document.getElementById('discussCancelReply');
  if (hint) hint.style.display = 'none';
  if (cancel) cancel.style.display = 'none';
}

async function submitComment() {
  const input = document.getElementById('discussInput');
  const text = (input?.value || '').trim();
  if (!text) { showToast('Введите текст'); return; }
  try {
    await api.library.addBookComment(currentBookId, text, _replyingTo);
    input.value = '';
    cancelReply();
    if (navigator.vibrate) navigator.vibrate(10);
    loadComments();
  } catch (e) {
    showToast(e && e.detail ? e.detail : 'Не удалось отправить');
  }
}

async function deleteComment(commentId) {
  showConfirmModal({
    title: 'Удалить комментарий?',
    message: 'Комментарий и ответы на него будут удалены.',
    confirmText: 'Удалить',
    cancelText: 'Отмена',
    danger: true,
    onConfirm: async () => {
      try {
        await api.library.deleteBookComment(currentBookId, commentId);
        loadComments();
      } catch (e) {
        showToast(e && e.detail ? e.detail : 'Не удалось удалить');
      }
    },
  });
}
