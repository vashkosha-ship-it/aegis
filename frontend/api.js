// ============================================================================
// API-слой: связь фронта с бэкендом NEON STACK.
// Использование: api.login(...), api.books.list(), api.books.uploadPdf(...)
// Access-токен хранится в памяти, refresh — в httpOnly-cookie.
// При 401 пытаемся обновить пару через /auth/refresh.
// ============================================================================
(function () {
  // Умное определение адреса API:
  // - localhost / 127.0.0.1 (локальная разработка) → backend на порту 8000
  // - любой другой хост (прод: IP или домен, http или https) → тот же origin + /api
  // Так один и тот же файл работает локально, на сервере по IP и на домене с HTTPS
  // без ручных правок после каждого деплоя.
  const BASE = (function () {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '') {
      return 'http://localhost:8000/api';
    }
    return window.location.origin + '/api';
  })();

  // --- хранение токенов ----------------------------------------------------
  // Refresh-токен живёт в httpOnly-cookie: JavaScript его не видит, поэтому
  // XSS не может его украсть. Access-токен держим только в памяти — при
  // перезагрузке страницы он теряется, и приложение получает новый через
  // /auth/refresh (cookie отправится сама).
  let _accessToken = null;

  // Разовая уборка: до перехода на cookie токены лежали в localStorage.
  // Оставлять их там нельзя — это ровно то, от чего мы уходили: любой скрипт
  // на странице (XSS) прочитал бы refresh-токен и получил доступ к аккаунту.
  (function purgeLegacyTokens() {
    try {
      for (const key of ['neon_access_token', 'neon_refresh_token']) {
        if (localStorage.getItem(key) !== null) {
          localStorage.removeItem(key);
          console.info('Удалён устаревший токен из localStorage:', key);
        }
      }
    } catch (_) { /* приватный режим — localStorage может быть недоступен */ }
  })();

  function getCsrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)aegis_csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  const tokens = {
    get access() { return _accessToken; },
    set(access) { _accessToken = access || null; },
    clear() { _accessToken = null; },
  };

  // --- ошибка с кодом и деталями (удобно ловить в catch) -------------------
  class ApiError extends Error {
    constructor(status, detail, body) {
      super(detail || `HTTP ${status}`);
      this.status = status;
      this.detail = detail;
      this.body = body;
    }
  }

  // --- базовый fetch с авторизацией и автообновлением токена ---------------
  async function request(path, { method = 'GET', body, headers = {}, auth = true, raw = false } = {}) {
    const url = path.startsWith('http') ? path : BASE + path;
    // credentials: cookie с refresh-токеном должна уходить на /auth/*
    const opts = { method, headers: { ...headers }, credentials: 'include' };

    if (auth && tokens.access) {
      opts.headers['Authorization'] = 'Bearer ' + tokens.access;
    }
    if (body !== undefined) {
      if (body instanceof FormData) {
        opts.body = body;  // браузер сам выставит multipart Content-Type с boundary
      } else {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
    }

    let response = await fetch(url, opts);

    // 401 + есть refresh — пробуем обновить токен и повторить запрос ровно один раз
    if (response.status === 401 && auth && path !== '/auth/refresh') {
      const refreshed = await tryRefresh();
      if (refreshed) {
        opts.headers['Authorization'] = 'Bearer ' + tokens.access;
        response = await fetch(url, opts);
      }
    }

    if (!response.ok) {
      let detail = null, errBody = null;
      try { errBody = await response.json(); detail = errBody.detail; } catch (_) { /* not JSON */ }
      throw new ApiError(response.status, detail, errBody);
    }

    if (raw) return response;
    if (response.status === 204) return null;
    return response.json();
  }

  async function tryRefresh() {
    const csrf = getCsrfToken();
    if (!csrf) { tokens.clear(); return false; }
    try {
      const data = await request('/auth/refresh', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrf },
        auth: false,
      });
      tokens.set(data.access_token);
      return true;
    } catch (e) {
      tokens.clear();
      return false;
    }
  }

  // --- публичный API -------------------------------------------------------
  const api = {
    isAuthenticated: () => !!tokens.access,

    // Восстановить сессию после перезагрузки страницы: access-токен в памяти
    // потерян, но refresh-cookie осталась.
    restoreSession: () => tryRefresh(),
    baseUrl: BASE,
    tokens,
    ApiError,
    request,

    async login(username, password) {
      const data = await request('/auth/login', {
        method: 'POST',
        body: { username, password },
        auth: false,
      });
      tokens.set(data.access_token);
      return data;
    },

    async register(username, password, email = null, full_name = null, department = null) {
      // Регистрация больше НЕ выдаёт токены — аккаунт ждёт подтверждения email
      return await request('/auth/register', {
        method: 'POST',
        body: { username, password, email, full_name, department },
        auth: false,
      });
    },

    async verifyEmail(email, code) {
      const data = await request('/auth/verify', {
        method: 'POST',
        body: { email, code },
        auth: false,
      });
      tokens.set(data.access_token);
      return data;
    },

    async resendCode(email) {
      return await request('/auth/resend-code', {
        method: 'POST',
        body: { email },
        auth: false,
      });
    },

    async forgotPassword(email) {
      return await request('/auth/forgot-password', {
        method: 'POST',
        body: { email },
        auth: false,
      });
    },

    async resetPassword(email, code, newPassword) {
      const data = await request('/auth/reset-password', {
        method: 'POST',
        body: { email, code, new_password: newPassword },
        auth: false,
      });
      if (data.access_token) tokens.set(data.access_token);
      return data;
    },

    async logout() {
      // Cookie удаляет сервер: из JS httpOnly-cookie не стереть. Заодно он
      // отзывает refresh-токен, иначе утёкшая копия работала бы и после выхода.
      const csrf = getCsrfToken();
      try {
        await request('/auth/logout', {
          method: 'POST',
          headers: csrf ? { 'X-CSRF-Token': csrf } : {},
          auth: false,
        });
      } catch (_) { /* даже если не вышло — локально разлогиниваемся */ }
      tokens.clear();
    },

    me() {
      return request('/auth/me');
    },

    updateMe(payload) {
      // payload: {full_name?: string|null}
      return request('/me', { method: 'PATCH', body: payload });
    },
    assistantChat(messages, context = {}) {
          return request('/me/assistant/chat', {
            method: 'POST',
            body: { messages, ...context },
          });
        },
    // Streaming: вызывает onDelta(piece) по мере прихода кусков, возвращает полный текст
    async assistantChatStream(messages, context = {}, onDelta, signal) {
      const url = BASE + '/me/assistant/chat/stream';
      const headers = { 'Content-Type': 'application/json' };
      if (tokens.access) headers['Authorization'] = 'Bearer ' + tokens.access;
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages, ...context }),
        signal,
      });
      if (resp.status === 401) {
        const ok = await tryRefresh();
        if (ok) return api.assistantChatStream(messages, context, onDelta, signal);
      }
      if (!resp.ok) {
        let detail = null; try { detail = (await resp.json()).detail; } catch (_) {}
        throw new ApiError(resp.status, detail);
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const json = trimmed.slice(5).trim();
          try {
            const obj = JSON.parse(json);
            if (obj.delta) { full += obj.delta; if (onDelta) onDelta(obj.delta, full); }
            else if (obj.error) { throw new ApiError(502, obj.error); }
          } catch (e) { if (e instanceof ApiError) throw e; }
        }
      }
      return full;
    },
    changePassword(currentPassword, newPassword) {
      return request('/me/password', {
        method: 'POST',
        body: { current_password: currentPassword, new_password: newPassword },
      });
    },
    requestEmailChange(newEmail, password) {
      return request('/me/email/request', { method: 'POST', body: { new_email: newEmail, password } });
    },
    confirmEmailChange(code) {
      return request('/me/email/confirm', { method: 'POST', body: { code } });
    },

    uploadAvatar(file) {
      const fd = new FormData();
      fd.append('file', file);
      return request('/me/avatar', { method: 'POST', body: fd });
    },

    deleteAvatar() {
      return request('/me/avatar', { method: 'DELETE' });
    },
    onboarding: {
      getQuiz() { return request('/me/onboarding'); },
      submit(answers) {
        return request('/me/onboarding/submit', {
          method: 'POST',
          body: { answers },
        });
      },
      getResult() { return request('/me/onboarding/result'); },
      selfAssess(level) {
        return request('/me/onboarding/self-assess', {
          method: 'POST',
          body: { level },
        });
      },
    },
    users: {
      avatarUrl(userId) { return BASE + '/users/' + userId + '/avatar'; },
    },

    books: {
      list(params = {}) {
        const q = new URLSearchParams(
          Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
        ).toString();
        return request('/books' + (q ? '?' + q : ''));
      },
      get(id) { return request('/books/' + id); },
      categories() { return request('/books/categories/all'); },
      create(payload) { return request('/books', { method: 'POST', body: payload }); },
      update(id, payload) { return request('/books/' + id, { method: 'PATCH', body: payload }); },
      delete(id) { return request('/books/' + id, { method: 'DELETE' }); },

      // URL'ы для прямой подстановки в <img src> и в pdf.js
      coverUrl(id) { return BASE + '/books/' + id + '/cover'; },
      pdfUrl(id) { return BASE + '/books/' + id + '/pdf'; },

      uploadPdf(id, file) {
        const fd = new FormData();
        fd.append('file', file);
        return request('/books/' + id + '/pdf', { method: 'POST', body: fd });
      },
      uploadCover(id, file) {
        const fd = new FormData();
        fd.append('file', file);
        return request('/books/' + id + '/cover', { method: 'POST', body: fd });
      },
      deletePdf(id) { return request('/books/' + id + '/pdf', { method: 'DELETE' }); },
      deleteCover(id) { return request('/books/' + id + '/cover', { method: 'DELETE' }); },

      // PDF возвращаем как ArrayBuffer — pdf.js принимает его напрямую
      async fetchPdfBytes(id) {
        const resp = await request('/books/' + id + '/pdf', { raw: true });
        return resp.arrayBuffer();
      },
      // Данные для прогрессивной загрузки PDF в pdf.js (по Range-запросам):
      // URL + заголовок авторизации. pdf.js сам тянет файл по частям.
      pdfStreamConfig(id) {
        return {
          url: BASE + '/books/' + id + '/pdf',
          httpHeaders: tokens.access ? { 'Authorization': 'Bearer ' + tokens.access } : {},
          withCredentials: false,
        };
      },
    },
    library: {
      // MyList
      mylist() { return request('/me/mylist'); },
      setMylistStatus(bookId, status) {
        return request('/books/' + bookId + '/mylist', {
          method: 'PUT',
          body: { status },
        });
      },
      removeFromMylist(bookId) {
        return request('/books/' + bookId + '/mylist', { method: 'DELETE' });
      },
      // Reading progress
      progress() { return request('/me/progress'); },
      updateProgress(bookId, currentPage, totalPages) {
        const body = { current_page: currentPage };
        if (totalPages) body.total_pages = totalPages;
        return request('/books/' + bookId + '/progress', {
          method: 'PUT',
          body,
        });
      },
      // Reviews
      reviews(bookId) { return request('/books/' + bookId + '/reviews'); },
      addReview(bookId, rating, text) {
        return request('/books/' + bookId + '/reviews', {
          method: 'POST',
          body: { rating, text },
        });
      },
      deleteReview(reviewId) {
        return request('/reviews/' + reviewId, { method: 'DELETE' });
      },
      // Annotations (highlights & notes)
      annotations(bookId) { return request('/books/' + bookId + '/annotations'); },
      addAnnotation(bookId, payload) {
        // payload: {type, page, selected_text, note_text?, position?}
        return request('/books/' + bookId + '/annotations', {
          method: 'POST',
          body: payload,
        });
      },
      deleteAnnotation(annotationId) {
        return request('/annotations/' + annotationId, { method: 'DELETE' });
      },
      // Quizzes
      // Возвращает { questions, sessionToken }. Токен сессии сервер отдаёт
      // заголовком X-Quiz-Session — он привязывает набор вопросов к попытке,
      // чтобы клиент не мог подменить состав при отправке.
      async quiz(bookId) {
        const resp = await request('/books/' + bookId + '/quiz', { raw: true });
        const questions = await resp.json();
        return { questions, sessionToken: resp.headers.get('X-Quiz-Session') || null };
      },
      regenerateQuiz(bookId) { return request('/books/' + bookId + '/quiz/regenerate', { method: 'POST' }); },
      regenerateAllQuizzes() { return request('/books/quiz/regenerate-all', { method: 'POST' }); },
      // Collaborative filtering: «также читают»
      alsoRead(bookId, limit = 8) { return request('/books/' + bookId + '/also-read?limit=' + limit); },
      // Кастомные коллекции
      collections() { return request('/me/collections'); },
      createCollection(name, icon = '📁') { return request('/me/collections', { method: 'POST', body: { name, icon } }); },
      updateCollection(id, payload) { return request('/me/collections/' + id, { method: 'PATCH', body: payload }); },
      deleteCollection(id) { return request('/me/collections/' + id, { method: 'DELETE' }); },
      addToCollection(id, bookId) { return request('/me/collections/' + id + '/books/' + bookId, { method: 'PUT' }); },
      removeFromCollection(id, bookId) { return request('/me/collections/' + id + '/books/' + bookId, { method: 'DELETE' }); },
      // Публичный профиль (с маскировкой email)
      publicProfile(userId) { return request('/users/' + userId + '/profile'); },
      // Удаление аккаунта
      deleteAccount(password, confirm) { return request('/me/delete', { method: 'POST', body: { password, confirm } }); },
      // E1: история диалогов AI
      chats() { return request('/me/chats'); },
      chat(id) { return request('/me/chats/' + id); },
      createChat(messages, title) { return request('/me/chats', { method: 'POST', body: { title: title || 'Новый диалог', messages } }); },
      syncChatMessages(id, messages) { return request('/me/chats/' + id + '/messages', { method: 'PUT', body: messages }); },
      renameChat(id, title) { return request('/me/chats/' + id, { method: 'PATCH', body: { title } }); },
      deleteChat(id) { return request('/me/chats/' + id, { method: 'DELETE' }); },
      // E4: обязательные книги
      setRequiredBook(bookId, department) { return request('/books/' + bookId + '/required', { method: 'POST', body: { department } }); },
      myRequiredBooks() { return request('/books/required/mine'); },
      // Полнотекстовый поиск по содержимому и метаданным
      searchBooks(query, limit = 20) { return request('/search?q=' + encodeURIComponent(query) + '&limit=' + limit); },
      // Переиндексация (админ)
      reindexBook(bookId) { return request('/books/' + bookId + '/reindex', { method: 'POST' }); },
      reindexAllBooks() { return request('/books/reindex-all', { method: 'POST' }); },
      reindexStatus() { return request('/books/reindex/status'); },
      adminLogs(limit = 50) { return request('/books/admin/logs?limit=' + limit); },
      // Обсуждения книги
      bookComments(bookId) { return request('/books/' + bookId + '/comments'); },
      addBookComment(bookId, text, parentId) { return request('/books/' + bookId + '/comments', { method: 'POST', body: { text, parent_id: parentId || null } }); },
      deleteBookComment(bookId, commentId) { return request('/books/' + bookId + '/comments/' + commentId, { method: 'DELETE' }); },
      // sessionToken обязателен: набор вопросов знает только сервер.
      submitQuiz(bookId, answers, sessionToken) {
        const body = { answers, session_token: sessionToken };
        return request('/books/' + bookId + '/quiz/submit', {
          method: 'POST',
          body,
        });
      },
      myQuizAttempts() { return request('/me/quiz-attempts'); },
      // Achievements
      myAchievements() { return request('/me/achievements'); },
      allAchievements() { return request('/achievements'); },
      // Рейтинг: переехал из /admin — к администрированию не относится
      leaderboard(limit = 50) { return request('/me/leaderboard?limit=' + limit); },
      // Heatmap (reading activity)
      heatmap(days = 90) { return request('/me/heatmap?days=' + days); },
            // Admin: users
      dayStats(date) {
        return request('/me/day-stats?date=' + encodeURIComponent(date));
      },
      adminUsers() { return request('/admin/users'); },
      adminDeleteUser(userId) {
        return request('/admin/users/' + userId, { method: 'DELETE' });
      },

      adminDashboard() {
        return request('/admin/dashboard');
      },

      adminBookAnalytics(bookId) {
        return request('/admin/books/' + bookId + '/analytics');
      },

      adminPendingUsers() {
        return request('/admin/users/pending');
      },
      adminCreateUser(payload) {
        return request('/admin/users/create', { method: 'POST', body: payload });
      },
      aiMatchArTopics(topics) {
        return request('/books/ai-match-ar-topics', { method: 'POST', body: { topics } });
      },
      async adminExportReading(dateFrom, dateTo) {
        let qs = [];
        if (dateFrom) qs.push('date_from=' + encodeURIComponent(dateFrom));
        if (dateTo) qs.push('date_to=' + encodeURIComponent(dateTo));
        const path = '/admin/export/reading' + (qs.length ? '?' + qs.join('&') : '');
        const resp = await request(path, { raw: true });
        return resp.blob();
      },
      certCategories() { return request('/certificates/categories'); },
      certMine() { return request('/certificates/mine'); },
      certStartExam(category) {
        return request('/certificates/exam/start', { method: 'POST', body: { category } });
      },
      certSubmitExam(examToken, answers) {
        return request('/certificates/exam/submit', { method: 'POST', body: { exam_token: examToken, answers } });
      },
      certPdfUrl(category) { return BASE + '/certificates/' + encodeURIComponent(category) + '/pdf'; },
      async certPdfBlob(category) {
        const resp = await request('/certificates/' + encodeURIComponent(category) + '/pdf', { raw: true });
        return resp.blob();
      },
      adminApproveUser(userId) {
        return request('/admin/users/' + userId + '/approve', { method: 'POST' });
      },
      adminRejectUser(userId) {
        return request('/admin/users/' + userId + '/reject', { method: 'POST' });
      },
    },
  };

  window.api = api;
})();