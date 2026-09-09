// ========== EPUB RENDITION ==========
let epubRendition = null;
let epubBook = null;
let isEpubMode = false;

// ========== STATE ==========
const state = {
  currentUser: null, currentTab: 'login', currentScreen: 'auth', detailTab: 'info', aiOpen: false, catalogOpen: false,
  mylistTab: 'reading', mylistSort: 'date-desc', trainingTab: 'all',
  filters: { categories: [], sort: 'default', status: 'all' },
  books: [],
  readingProgress: {}, mylist: {}, reviews: {}, completedQuizzes: {},
  pendingAiAction: null,
  analyticsCache: null,
  heatmapData: null,
};
let pdfDoc = null, pdfCurrentPage = 1, pdfTotalPages = 0, currentBookId = null, lastSelection = null;
// Контроль параллельного рендера PDF: отменяем предыдущий рендер при быстром
// листании, иначе два page.render() в один canvas накладываются и страница
// получается перевёрнутой/искажённой (race condition).
let _pdfRenderTask = null;     // текущая задача pdf.js render()
let _pdfRenderToken = 0;       // токен последнего запроса рендера
let readerCurrentPageText = '';  // текст текущей страницы для AI-ассистента
let epubCurrentPage = 1, epubTotalPages = 0;
let currentQuiz = { bookId: null, questions: [], currentIndex: 0, score: 0, answers: [] };

function saveState() {
  // Раньше сохраняли state.userProfiles в localStorage.
  // После миграции профилей на бэк здесь больше ничего не делаем.
  // Функция оставлена как no-op, чтобы не править все места вызова.
}

state.gamification = {
  xp: 0,
  streakCount: 0,
  achievementsOwned: [],
  achievementsCatalog: [],
};

