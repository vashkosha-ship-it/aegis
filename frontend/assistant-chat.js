// Main AI assistant UI, streaming, history and quick actions.
// Loaded as a classic script before app.js; public handlers intentionally remain global.

// ========== AI АССИСТЕНТ ==========

let assistantMessages = [];
let assistantBusy = false;

// ============================================================================
// Единый "движок" ассистента (DeepSeek через api.assistantChat).
// Используется и полноэкранным экраном (#assistantScreen), и панелью в
// читалке (#aiPanel). Различия — только в наборе DOM-элементов (surface).
// ============================================================================
function assistantSurface(kind) {
  if (kind === 'reader') {
    return {
      kind,
      get messages() { return readerAiMessages; },
      set messages(v) { readerAiMessages = v; },
      get busy() { return readerAiBusy; },
      set busy(v) { readerAiBusy = v; },
      messagesEl: () => document.getElementById('aiChat'),
      inputEl: () => document.getElementById('aiInput'),
      sendBtnEl: () => null,
    };
  }
  return {
    kind: 'full',
    get messages() { return assistantMessages; },
    set messages(v) { assistantMessages = v; },
    get busy() { return assistantBusy; },
    set busy(v) { assistantBusy = v; },
    messagesEl: () => document.getElementById('assistantMessages'),
    inputEl: () => document.getElementById('assistantInput'),
    sendBtnEl: () => document.getElementById('assistantSendBtn'),
  };
}

// Лёгкое и безопасное форматирование ответа ассистента (markdown-подмножество).
// Сначала экранируем HTML, затем применяем разметку к уже безопасному тексту.
function mdAssistant(src) {
  let s = eh(src || '');

  // Блоки кода ```...```
  const blocks = [];
  s = s.replace(/```(?:[a-zA-Z0-9_+-]+)?\n?([\s\S]*?)```/g, (_m, code) => {
    blocks.push(code.replace(/\n$/, ''));
    return `\u0000CB${blocks.length - 1}\u0000`;
  });
  // Инлайн-код `...`
  const inlines = [];
  s = s.replace(/`([^`\n]+)`/g, (_m, c) => {
    inlines.push(c);
    return `\u0000IC${inlines.length - 1}\u0000`;
  });

  // Жирный / курсив
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
       .replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

  // Ссылки [текст](http...)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Построчно собираем абзацы, списки и заголовки
  const lines = s.split('\n');
  let out = '';
  let i = 0;
  const isUL = (l) => /^\s*[-*•]\s+/.test(l);
  const isOL = (l) => /^\s*\d+[.)]\s+/.test(l);
  while (i < lines.length) {
    let line = lines[i];

    if (line.trim() === '') { i++; continue; }

    // Заголовки # ## ###
    const h = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (h) { out += `<div class="ai-h">${h[1]}</div>`; i++; continue; }

    if (isUL(line)) {
      out += '<ul>';
      while (i < lines.length && isUL(lines[i])) {
        out += `<li>${lines[i].replace(/^\s*[-*•]\s+/, '')}</li>`;
        i++;
      }
      out += '</ul>';
      continue;
    }
    if (isOL(line)) {
      out += '<ol>';
      while (i < lines.length && isOL(lines[i])) {
        out += `<li>${lines[i].replace(/^\s*\d+[.)]\s+/, '')}</li>`;
        i++;
      }
      out += '</ol>';
      continue;
    }

    // Параграф: собираем подряд идущие непустые/несписочные строки
    const para = [];
    while (i < lines.length && lines[i].trim() !== '' && !isUL(lines[i]) && !isOL(lines[i]) && !/^\s*#{1,6}\s+/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    out += `<p>${para.join('<br>')}</p>`;
  }

  // Возвращаем код на место
  out = out.replace(/\u0000IC(\d+)\u0000/g, (_m, n) => `<code>${inlines[+n]}</code>`);
  out = out.replace(/\u0000CB(\d+)\u0000/g, (_m, n) => `<pre><code>${blocks[+n]}</code></pre>`);
  return out;
}

const COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

function assistantRenderBubble(m, surfaceKind, idx) {
  if (m._loading) {
    return `<div class="ai-msg-wrap bot"><div class="ai-bubble bot"><span class="ai-typing"><i></i><i></i><i></i></span></div></div>`;
  }

  const isUser = m.role === 'user';
  let inner = isUser ? eh(m.content).replace(/\n/g, '<br>') : mdAssistant(m.content);

  if (m._picker && Array.isArray(m._picker.books)) {
    const action = m._picker.action; // 'summary' | 'quiz'
    inner += `<div class="ai-book-picker">` + m._picker.books.map(b =>
      `<button class="ai-book-option" data-onclick="assistantPickBook('${surfaceKind}','${action}',${b.id})"><span class="t">${eh(b.title)}</span></button>`
    ).join('') + `</div>`;
  }

  if (m._action === 'goto_quiz' && m._bookId != null) {
    inner += `<button class="ai-action-btn" data-onclick="assistantGotoQuiz(${m._bookId})">` +
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>` +
      `Перейти к тесту</button>`;
  }

  const copyBtn = `<button class="ai-copy" data-onclick="assistantCopy('${surfaceKind}',${idx})" title="Скопировать">${COPY_SVG}<span>Копировать</span></button>`;

  return `<div class="ai-msg-wrap ${isUser ? 'user' : 'bot'}">` +
    `<div class="ai-bubble ${isUser ? 'user' : 'bot'}">${inner}</div>` +
    copyBtn +
  `</div>`;
}

function assistantRender(surface) {
  const el = surface.messagesEl();
  if (!el) return;
  el.innerHTML = surface.messages.map((m, i) => assistantRenderBubble(m, surface.kind, i)).join('');
  el.scrollTop = el.scrollHeight;
}

// Плавное обновление последнего (AI) сообщения во время стриминга
function assistantRenderStreaming(surface, fullText) {
  const el = surface.messagesEl();
  if (!el) return;
  const bubbles = el.querySelectorAll('.ai-bubble.bot');
  const last = bubbles[bubbles.length - 1];
  const wasAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  if (last) {
    last.innerHTML = (typeof mdAssistant === 'function' ? mdAssistant(fullText) : eh(fullText).replace(/\n/g, '<br>'))
      + '<span class="ai-type-cursor">▋</span>';
  }
  if (wasAtBottom) el.scrollTop = el.scrollHeight;
}

// Копирование текста сообщения (и пользователя, и ассистента)
function assistantCopy(kind, idx) {
  const surface = assistantSurface(kind);
  const m = surface.messages[idx];
  if (!m) return;
  const text = m.content || '';
  const done = () => showToast('Скопировано');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => assistantFallbackCopy(text, done));
  } else {
    assistantFallbackCopy(text, done);
  }
}
function assistantFallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy'); } catch (_) {}
  ta.remove();
  if (cb) cb();
}

async function assistantSend(surface, text, opts = {}) {
  if (surface.busy) return;
  text = (text || '').trim();
  if (!text) return;
  if (text.length > 4000) { showToast('Слишком длинное сообщение'); return; }

  const userMsg = { role: 'user', content: text };
  surface.messages.push(userMsg);
  surface.messages.push({ role: 'assistant', content: '', _loading: true });
  assistantRender(surface);
  surface.busy = true;

  const sendBtn = surface.sendBtnEl();
  if (sendBtn) { sendBtn.disabled = true; sendBtn.style.opacity = '0.5'; }

  try {
    const apiMessages = surface.messages
      .filter((m, i) => !m._loading && !m._picker && !(i === 0 && m.role === 'assistant'))
      .map(m => ({ role: m.role, content: m.content }));
    // Структурированный контекст уходит в отдельные поля запроса (бэкенд их понимает).
    const context = buildAssistantContext(text);

    // Заменяем «загрузку» на пустое сообщение, которое будем наполнять по буквам
    surface.messages.pop();
    const aiMsg = { role: 'assistant', content: '' };
    surface.messages.push(aiMsg);
    assistantRender(surface);

    let streamed = false;
    try {
      await api.assistantChatStream(apiMessages, context, (delta, full) => {
        streamed = true;
        aiMsg.content = full;
        assistantRenderStreaming(surface, full);
      });
    } catch (streamErr) {
      // Фолбэк на обычный (нестриминговый) ответ, если стрим не сработал
      if (!streamed) {
        const data = await api.assistantChat(apiMessages, context);
        aiMsg.content = data.reply;
      } else {
        throw streamErr;
      }
    }
    assistantRender(surface);
  } catch (e) {
    // убираем пустое/частичное AI-сообщение и показываем ошибку
    if (surface.messages.length && surface.messages[surface.messages.length - 1].role === 'assistant') {
      surface.messages.pop();
    }
    const errText = e.status === 429
      ? (e.detail || 'Слишком много запросов. Попробуйте позже.')
      : (e.status === 502 ? 'AI временно недоступен. Попробуйте позже.' : 'Не удалось получить ответ.');
    surface.messages.push({ role: 'assistant', content: '⚠ ' + errText });
    console.error('Assistant error:', e);
  } finally {
    surface.busy = false;
    if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = '1'; }
    assistantRender(surface);
    const input = surface.inputEl();
    if (input) input.focus();
    // E1: сохраняем диалог в историю (фоном, без блокировки)
    persistCurrentChat();
  }
}

// ===== E1: автосохранение/история диалогов AI =====
let _currentChatId = null;
async function persistCurrentChat() {
  try {
    const msgs = (assistantMessages || [])
      .filter(m => !m._loading && !m._picker && (m.role === 'user' || m.role === 'assistant') && m.content)
      .map(m => ({ role: m.role, content: m.content }));
    if (msgs.length < 2) return; // нечего сохранять
    if (_currentChatId) {
      await api.library.syncChatMessages(_currentChatId, msgs);
    } else {
      const created = await api.library.createChat(msgs);
      _currentChatId = created.id;
    }
  } catch (_) { /* история — не критично */ }
}

async function openChatHistory() {
  const ex = document.getElementById('chatHistoryModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'chatHistoryModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  m.innerHTML = `<div data-static-style="a304">
    <div data-static-style="a126">
      <h3 data-static-style="a127">История диалогов</h3>
      <button data-onclick="closeModal('chatHistoryModal')" data-static-style="a128">✕</button>
    </div>
    <div id="chatHistoryBody" data-static-style="a129">Загружаю…</div>
  </div>`;
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  document.body.appendChild(m);
  try {
    const chats = await api.library.chats();
    const body = document.getElementById('chatHistoryBody');
    if (!chats.length) { body.innerHTML = '<div data-static-style="a130">Сохранённых диалогов пока нет.</div>'; return; }
    body.style.textAlign = 'left'; body.style.padding = '0';
    body.innerHTML = chats.map(c => `
      <div data-static-style="a305">
        <div data-onclick="loadChatFromHistory(${c.id})" data-static-style="a306">
          <div data-static-style="a307">${eh(c.title)}</div>
          <div data-static-style="a099">${c.message_count} сообщений</div>
        </div>
        <button data-onclick="deleteChatFromHistory(${c.id})" data-nonce="${sensitiveNonce()}" data-static-style="a308">✕</button>
      </div>`).join('');
  } catch (_) {
    const body = document.getElementById('chatHistoryBody');
    if (body) body.innerHTML = '<div data-static-style="a137">Не удалось загрузить историю.</div>';
  }
}

async function loadChatFromHistory(chatId) {
  try {
    const chat = await api.library.chat(chatId);
    assistantMessages = (chat.messages || []).map(m => ({ role: m.role, content: m.content }));
    _currentChatId = chatId;
    const m = document.getElementById('chatHistoryModal');
    if (m) m.remove();
    if (state.currentScreen !== 'assistant') navigateTo('assistant');
    renderAssistantScreen();
  } catch (_) { showToast('Не удалось открыть диалог'); }
}

async function deleteChatFromHistory(chatId) {
  try {
    await api.library.deleteChat(chatId);
    if (_currentChatId === chatId) _currentChatId = null;
    openChatHistory();
  } catch (_) { showToast('Не удалось удалить'); }
}

function startNewChat() {
  assistantMessages = [];
  _currentChatId = null;
  renderAssistantScreen();
}

// Структурированный контекст для бэкенда: книга/страница (#8), библиотека (#9),
// подразделение и уровень (#10). Все поля опциональны.
function buildAssistantContext(text) {
  const ctx = {};

  // #10 — профиль
  if (state.currentUser?.department) ctx.department = state.currentUser.department;
  if (state.currentUser?.cyber_level) ctx.level = state.currentUser.cyber_level;

  // #8 — текущая книга/страница (только в читалке)
  if (state.currentScreen === 'reader' && state.currentBook) {
    const b = state.currentBook;
    ctx.book_context = {
      title: b.title || null,
      author: b.author || null,
      page: pdfCurrentPage || null,
      total_pages: pdfTotalPages || b.total_pages || null,
      page_text: (readerCurrentPageText || '').trim().slice(0, 6000) || null,
    };
  }

  // #9 — библиотеку шлём, когда вопрос про рекомендации/выбор книги
  const t = (text || '').toLowerCase();
  if (/рекоменд|посоветуй|что почитать|какую книг|подбери|с чего начать|порекоменд|почитат/.test(t)) {
    const statusRu = { reading: 'читаю', planned: 'в планах', completed: 'прочитано', dropped: 'брошено', liked: 'нравится' };
    ctx.library = (state.books || []).slice(0, 60).map(b => ({
      title: b.title,
      author: b.author || null,
      categories: b.categories || [],
      status: state.mylist[b.id] ? (statusRu[state.mylist[b.id]] || state.mylist[b.id]) : null,
    }));
  }

  return ctx;
}

// Быстрые действия (чипы). Если книга в контексте — действуем сразу,
// иначе показываем выбор книги прямо в чате.
function assistantHandleQuick(surface, action) {
  if (surface.busy) return;
  const book = state.currentBook;

  if (action === 'recommend') {
    const dep = state.currentUser && state.currentUser.department;
    const depPart = (dep && departmentTopicKeywords())
      ? ` Я работаю в подразделении «${dep}» — учитывай его специфику.`
      : '';
    const prompt = `Посоветуй, что мне почитать из моей библиотеки с учётом моего уровня.${depPart}`;
    assistantSend(surface, prompt);
    return;
  }
  if (action === 'vacation') {
    assistantSend(surface, 'Я уезжаю в отпуск и хочу взять с собой что-то лёгкое и интересное по кибербезопасности из моей библиотеки. Посоветуй 2-3 книги, которые приятно читать без напряжения, и кратко объясни почему.');
    return;
  }
  if (action === 'exam') {
    const dep = state.currentUser && state.currentUser.department;
    const depPart = dep ? ` Мой профиль — «${dep}».` : '';
    assistantSend(surface, `Мне скоро сдавать экзамен/аттестацию по информационной безопасности.${depPart} Составь из моей библиотеки план интенсивной подготовки: какие книги читать в первую очередь и на что обратить внимание.`);
    return;
  }
  if (action === 'summary') {
    if (book) { assistantSend(surface, summaryPrompt(book)); return; }
    assistantShowBookPicker(surface, 'summary', 'По какой книге сделать саммари?');
    return;
  }
  if (action === 'quiz') {
    if (book) { assistantOfferQuiz(surface, book); return; }
    assistantShowBookPicker(surface, 'quiz', 'По какой книге пройти тест?');
    return;
  }
}

function summaryPrompt(book) {
  return `Сделай краткое саммари книги «${book.title}»${book.author ? ` (автор: ${book.author})` : ''}: о чём она и ключевые идеи.`;
}

function assistantBookChoices(limit = 8) {
  const inList = state.books.filter(b => state.mylist[b.id] || state.readingProgress[b.id]?.started);
  const rest = state.books.filter(b => !inList.includes(b));
  const ordered = [...inList, ...rest.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))];
  return ordered.slice(0, limit);
}

function assistantShowBookPicker(surface, action, prompt) {
  const books = assistantBookChoices(8);
  if (!books.length) {
    surface.messages.push({ role: 'assistant', content: 'Пока нет доступных книг.' });
    assistantRender(surface);
    return;
  }
  surface.messages.push({ role: 'assistant', content: prompt, _picker: { action, books } });
  assistantRender(surface);
}

function assistantPickBook(surfaceKind, action, bookId) {
  const surface = assistantSurface(surfaceKind);
  const book = state.books.find(b => b.id === bookId);
  if (!book) return;

  const last = surface.messages[surface.messages.length - 1];
  if (last && last._picker) delete last._picker;
  surface.messages.push({ role: 'user', content: book.title });

  if (action === 'summary') {
    assistantRender(surface);
    assistantSend(surface, summaryPrompt(book));
  } else if (action === 'quiz') {
    assistantOfferQuiz(surface, book);
  }
}

// Тест НЕ ведём в диалоге — даём кнопку «Перейти к тесту».
function assistantOfferQuiz(surface, book) {
  surface.messages.push({
    role: 'assistant',
    content: `Тест по книге «${book.title}» готов. Нажмите кнопку ниже — откроется тест в карточке книги.`,
    _action: 'goto_quiz',
    _bookId: book.id,
  });
  assistantRender(surface);
}

function assistantGotoQuiz(bookId) {
  closeAIPanel();                 // закрыть панель в читалке, если открыта
  startQuizFromTraining(bookId);  // открыть карточку книги и вкладку с тестом
}

// ===== Полноэкранный экран ассистента =====
function renderAssistantScreen() {
  const surface = assistantSurface('full');
  const sendBtn = surface.sendBtnEl();
  if (sendBtn && !sendBtn.innerHTML.trim()) {
    sendBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>';
  }

  const input = surface.inputEl();
  if (input && !input._handlersAttached) {
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAssistantMessage();
      }
    });
    input._handlersAttached = true;
  }

  if (surface.messages.length === 0) {
    surface.messages.push({
      role: 'assistant',
      content: 'Привет! Я AI-ассистент Aegis. Помогу разобраться с темами по кибербезопасности, объясню концепции и посоветую что почитать.\n\nС чего начнём?'
    });
  }
  assistantRender(surface);
  setTimeout(() => input && input.focus(), 100);
}

function sendAssistantMessage() {
  const surface = assistantSurface('full');
  const input = surface.inputEl();
  const text = input ? input.value : '';
  if (input) { input.value = ''; input.style.height = 'auto'; }
  assistantSend(surface, text);
}

function assistantQuick(action) {
  assistantHandleQuick(assistantSurface('full'), action);
}

function clearAssistantChat() {
  if (assistantMessages.length === 0) return;
  showConfirmModal({
    title: 'Очистить диалог?',
    message: 'История этого диалога будет удалена.',
    confirmText: 'Очистить',
    cancelText: 'Отмена',
    danger: true,
    onConfirm: () => {
      assistantMessages = [];
      _currentChatId = null;
      renderAssistantScreen();
    },
  });
}
