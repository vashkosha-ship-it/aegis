// ============================================================================
// API-слой: связь фронта с бэкендом NEON STACK.
// Использование: api.login(...), api.books.list(), api.books.uploadPdf(...)
// Токены хранятся в localStorage. При 401 пытаемся обновить refresh-токеном.
// ============================================================================
(function () {
  const BASE = 'http://localhost:8000/api';

  // --- хранение токенов ----------------------------------------------------
  const TOKEN_KEY = 'neon_access_token';
  const REFRESH_KEY = 'neon_refresh_token';

  const tokens = {
    get access() { return localStorage.getItem(TOKEN_KEY); },
    get refresh() { return localStorage.getItem(REFRESH_KEY); },
    set(access, refresh) {
      localStorage.setItem(TOKEN_KEY, access);
      localStorage.setItem(REFRESH_KEY, refresh);
    },
    clear() {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
    },
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
    const opts = { method, headers: { ...headers } };

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
    if (response.status === 401 && auth && tokens.refresh && path !== '/auth/refresh') {
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
    try {
      const data = await request('/auth/refresh', {
        method: 'POST',
        body: { refresh_token: tokens.refresh },
        auth: false,
      });
      tokens.set(data.access_token, data.refresh_token);
      return true;
    } catch (e) {
      tokens.clear();
      return false;
    }
  }

  // --- публичный API -------------------------------------------------------
  const api = {
    isAuthenticated: () => !!tokens.access,
    tokens,
    ApiError,
    request,

    async login(username, password) {
      const data = await request('/auth/login', {
        method: 'POST',
        body: { username, password },
        auth: false,
      });
      tokens.set(data.access_token, data.refresh_token);
      return data;
    },

    async register(username, password, email = null, full_name = null, department = null) {
    const data = await request('/auth/register', {
      method: 'POST',
      body: { username, password, email, full_name, department },
      auth: false,
    });
      tokens.set(data.access_token, data.refresh_token);
      return data;
    },

    logout() {
      tokens.clear();
    },

    me() {
      return request('/auth/me');
    },

    updateMe(payload) {
      // payload: {full_name?: string|null}
      return request('/me', { method: 'PATCH', body: payload });
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
      quiz(bookId) { return request('/books/' + bookId + '/quiz'); },
      submitQuiz(bookId, answers) {
        return request('/books/' + bookId + '/quiz/submit', {
          method: 'POST',
          body: { answers },
        });
      },
      myQuizAttempts() { return request('/me/quiz-attempts'); },
      // Achievements
      myAchievements() { return request('/me/achievements'); },
      allAchievements() { return request('/achievements'); },
      // Лидерборд (бэк отдаёт через /admin/leaderboard, но доступен всем авторизованным)
      leaderboard(limit = 50) { return request('/admin/leaderboard?limit=' + limit); },
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
    },
  };

  window.api = api;
})();
