// ========== НАСТРОЙКА PDF.JS ==========
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ========== EPUB RENDITION ==========
let epubRendition = null;
let epubBook = null;
let isEpubMode = false;

// ========== SVG-ИКОНКИ ==========
const ICONS = {
  home: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9L12 2L21 9V20A2 2 0 0 1 19 22H5A2 2 0 0 1 3 20V9Z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  bookmark: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21L12 16L5 21V5A2 2 0 0 1 7 3H17A2 2 0 0 1 19 5Z"/></svg>',
  education: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10L12 3L2 10L12 17L22 10Z"/><path d="M6 12V17C6 18.5 8.7 20 12 20C15.3 20 18 18.5 18 17V12"/></svg>',
  book: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20V22H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2Z"/></svg>',
  user: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21V19A4 4 0 0 0 16 15H8A4 4 0 0 0 4 19V21"/><circle cx="12" cy="7" r="4"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  catalog: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19A2 2 0 0 1 20 21H4A2 2 0 0 1 2 19V5A2 2 0 0 1 4 3H9L11 6H20A2 2 0 0 1 22 8Z"/></svg>',
  ai: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5A2 2 0 0 1 10 3H14A2 2 0 0 1 16 5V7"/><line x1="12" y1="11" x2="12" y2="15"/><circle cx="9" cy="17" r="1"/><circle cx="15" cy="17" r="1"/></svg>',
  ar: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2A14 14 0 0 0 12 22"/><path d="M2 12H22"/></svg>',
  admin: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg>',
  bookCover: '<svg width="36" height="44" viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 25.5A2.5 2.5 0 0 1 6.5 23H20"/><path d="M6.5 2H20V26H6.5A2.5 2.5 0 0 1 4 23.5V4.5A2.5 2.5 0 0 1 6.5 2Z"/></svg>',
  fire: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C8.5 7 5 9.5 5 14A7 7 0 1 0 19 14C19 9.5 15.5 7 12 2Z"/></svg>',
  shield: '<svg width="36" height="42" viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1L2 5V13C2 19.5 6.5 25.5 12 27C17.5 25.5 22 19.5 22 13V5L12 1Z"/><path d="M13 6L8 15H11L10 21L16 11H12.5L13 6Z"/></svg>',
  star: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  starEmpty: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  clock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V15"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  eye: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12S5 4 12 4S23 12 23 12S19 20 12 20S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6L18.4 19.6A2 2 0 0 1 16.4 22H7.6A2 2 0 0 1 5.6 19.6L5 6"/><path d="M10 11V17"/><path d="M14 11V17"/><path d="M9 6V4A1 1 0 0 1 10 3H14A1 1 0 0 1 15 4V6"/></svg>',
  settings: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15A1.65 1.65 0 0 0 21 13.67A1.65 1.65 0 0 0 19.4 12A1.65 1.65 0 0 0 17.8 13.67A1.65 1.65 0 0 0 19.4 15Z"/><path d="M6.2 8.4A2.2 2.2 0 0 0 8.4 6.2A2.2 2.2 0 0 0 6.2 4A2.2 2.2 0 0 0 4 6.2A2.2 2.2 0 0 0 6.2 8.4Z"/><path d="M2 14.7V17.3C2 17.7 2.3 18 2.7 18H5.3C5.7 18 6 17.7 6 17.3V14.7C6 14.3 5.7 14 5.3 14H2.7C2.3 14 2 14.3 2 14.7Z"/><path d="M18 6.7V9.3C18 9.7 18.3 10 18.7 10H21.3C21.7 10 22 9.7 22 9.3V6.7C22 6.3 21.7 6 21.3 6H18.7C18.3 6 18 6.3 18 6.7Z"/><path d="M10 2.7V5.3C10 5.7 10.3 6 10.7 6H13.3C13.7 6 14 5.7 14 5.3V2.7C14 2.3 13.7 2 13.3 2H10.7C10.3 2 10 2.3 10 2.7Z"/><path d="M5.3 18H2.7C2.3 18 2 18.3 2 18.7V21.3C2 21.7 2.3 22 2.7 22H5.3C5.7 22 6 21.7 6 21.3V18.7C6 18.3 5.7 18 5.3 18Z"/></svg>',
  plus: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  chevronLeft: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>',
  chevronRight: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>',
  dragHandle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="6" r="1"/><circle cx="16" cy="6" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="8" cy="18" r="1"/><circle cx="16" cy="18" r="1"/></svg>',
  cloudDownload: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 16L12 12L8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9H16.74A8 8 0 1 0 3 16.3"/></svg>',
  cloudCheck: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.39 18.39A5 5 0 0 0 18 9H16.74A8 8 0 1 0 3 16.3"/><polyline points="9 13 11 15 15 11"/></svg>',
  // === Уровни кибербезопасности ===
  levelGateGuardian: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
  levelScout: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  levelStronghold: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22V8l3-3v3h4V5l3-3 3 3v3h4l3 3v14H3z"/><path d="M10 22v-6h4v6"/><path d="M7 12h2"/><path d="M15 12h2"/></svg>',
  levelShadowArchitect: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z"/></svg>',
  levelAbyssWarden: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-9-4 9-6-7z"/><path d="M5 20h14"/><circle cx="12" cy="9" r="1" fill="currentColor"/></svg>',
  // === Иконки для онбординга ===
  list: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="18" rx="2"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M9 12h6"/><path d="M9 16h6"/><path d="M9 8h6"/></svg>',
  clock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  target: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  warningTriangle: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  fire: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  iconPlus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: block; margin: 0 auto;"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',fileText: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  iconBulb: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2v.3h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z"/></svg>',
  iconNote: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  iconChart: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  iconBot: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>',
  achReading: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  achQuiz: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/><circle cx="12" cy="12" r="10"/></svg>',
  achXp: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
  achReview: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  iconSword: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/></svg>',
  iconShield: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  iconBook: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
};

function icon(name) {
  return ICONS[name] || '';
}

// ========== УТИЛИТЫ ==========
function createParticles() {
  const c = document.getElementById('particlesContainer');
  if (!c) return;
  for (let i = 0; i < 15; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (Math.random() * 10 + 8) + 's';
    p.style.animationDelay = Math.random() * 8 + 's';
    c.appendChild(p);
  }
}
createParticles();

function getTodayISO() { return new Date().toISOString().split('T')[0]; }
function getYesterdayISO() { const d = new Date(Date.now() - 86400000); return d.toISOString().split('T')[0]; }
function eh(s) { const d = document.createElement('div'); d.textContent = (s || ''); return d.innerHTML; }

function bookCategoriesText(book) {
  if (!book.categories || book.categories.length === 0) {
    return 'Без категории';
  }
  return book.categories.join(', ');
}

// ========== SKELETON LOADING ==========
function showSkeleton(containerId, count = 4) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = Array(count).fill(`
    <div class="skeleton-card">
      <div class="skeleton skeleton-cover"></div>
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-text"></div>
    </div>
  `).join('');
}

function showListSkeleton(containerId, count = 3) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = Array(count).fill(`
    <div class="skeleton-list-item">
      <div class="skeleton skeleton-avatar"></div>
      <div style="flex:1;">
        <div class="skeleton skeleton-title" style="width:60%;"></div>
        <div class="skeleton skeleton-text" style="width:40%;"></div>
      </div>
    </div>
  `).join('');
}

// ========== AR SYSTEM ==========
// ========== AR SYSTEM (схемы атак поверх видео) ==========
let arStream = null;
let arActive = false;
let arFacingMode = 'environment';  // 'environment' = задняя камера, 'user' = фронтальная
let arCurrentScheme = null;          // 'killchain' | 'owasp' | ...

// Открытие меню выбора схемы из кнопки в хедере
function openARSchemeMenu() {
  document.getElementById('arSchemeMenuModal').classList.remove('hidden');
}

function closeARSchemeMenu() {
  document.getElementById('arSchemeMenuModal').classList.add('hidden');
}

// Открытие AR-экрана с конкретной схемой
async function openARWithScheme(schemeCode, initialStageId = null) {
  closeARSchemeMenu();
  arCurrentScheme = schemeCode;

  const titles = {
    killchain: 'Cyber Kill Chain',
    owasp: 'OWASP Top 10',
    osi: 'Модель OSI',
  };
  document.getElementById('arSchemeTitle').textContent = titles[schemeCode] || 'Схема';

  document.getElementById('arSchemeContainer').innerHTML = '';
  document.getElementById('arModal').classList.add('active');

  await startARCamera();
  renderARScheme(schemeCode);

  // Если передали этап — сразу его подсветить и открыть детали
  if (initialStageId && schemeCode === 'killchain') {
    // Дать DOM-у отрендериться, прежде чем выделять ноду
    setTimeout(() => selectKillChainStage(initialStageId), 100);
  }
}

async function startARCamera() {
  // Проверяем, поддерживается ли getUserMedia
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn('getUserMedia не поддерживается');
    showToast('Ваш браузер не поддерживает камеру, схема отображается на фоне');
    return;
  }

  try {
    // Для ПК используем 'environment' если есть камера, иначе 'user'
    const constraints = {
      video: { 
        facingMode: arFacingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false,
    };
    
    arStream = await navigator.mediaDevices.getUserMedia(constraints);
    const v = document.getElementById('arVideo');
    if (v) {
      v.srcObject = arStream;
      await v.play();
      arActive = true;
    }
  } catch (e) {
    console.error('Ошибка доступа к камере:', e);
    let errorMsg = 'Нет доступа к камере. ';
    if (e.name === 'NotAllowedError') {
      errorMsg += 'Разрешите доступ к камере в настройках браузера.';
    } else if (e.name === 'NotFoundError') {
      errorMsg += 'Камера не найдена на устройстве.';
    } else {
      errorMsg += 'Схема будет показана на тёмном фоне.';
    }
    showToast(errorMsg);
    // Не падаем — схема всё равно рендерится поверх чёрного фона
  }
}
function closeAR() {
  console.log('closeAR вызвана');
  
  // Останавливаем камеру
  if (arStream) {
    arStream.getTracks().forEach(t => t.stop());
    arStream = null;
  }
  
  arActive = false;
  arCurrentScheme = null;
  arSelectedStage = null;
  
  // Закрываем модалку
  const arModal = document.getElementById('arModal');
  if (arModal) {
    arModal.classList.remove('active');
    // Скрываем через style на случай, если classList не сработал
    arModal.style.display = 'none';
  }
  
  // ПОЛНОСТЬЮ ОЧИЩАЕМ контейнер схемы
  const schemeContainer = document.getElementById('arSchemeContainer');
  if (schemeContainer) {
    schemeContainer.innerHTML = '';
    // Убираем все inline стили, которые могли добавиться
    schemeContainer.removeAttribute('style');
  }
  
  // Останавливаем видео
  const video = document.getElementById('arVideo');
  if (video) {
    video.pause();
    video.srcObject = null;
    video.load();
  }
  
  // Убираем возможные остаточные панели
  const stageDetails = document.getElementById('arStageDetails');
  if (stageDetails) {
    stageDetails.style.display = 'none';
    stageDetails.innerHTML = '';
  }
  
  const stageHint = document.getElementById('arStageHint');
  if (stageHint) {
    stageHint.style.display = 'block';
  }
  
  // Сбрасываем overlay
  const overlay = document.querySelector('.ar-modal-overlay');
  if (overlay) {
    overlay.style.display = '';
  }
}

async function switchARCamera() {
  arFacingMode = arFacingMode === 'environment' ? 'user' : 'environment';
  // Останавливаем текущий поток
  if (arStream) {
    arStream.getTracks().forEach(t => t.stop());
    arStream = null;
  }
  // Перезапускаем с новым facingMode
  await startARCamera();
}
// Данные схемы Cyber Kill Chain — 7 этапов атаки
const AR_KILL_CHAIN = {
  title: 'Cyber Kill Chain',
  subtitle: '7 этапов кибератаки (Lockheed Martin)',
  stages: [
    {
      id: 1,
      code: 'recon',
      name: 'Reconnaissance',
      nameRu: 'Разведка',
      description: 'Атакующий собирает информацию о цели — людях, инфраструктуре, технологиях. Без активного взаимодействия с целевой системой.',
      attacker: [
        'OSINT — поиск в открытых источниках',
        'Сканирование DNS, поддоменов',
        'Сбор email-адресов сотрудников',
        'Изучение публикаций и стека компании',
      ],
      defender: [
        'Минимизация информации в открытых источниках',
        'Обучение сотрудников OPSEC',
        'Мониторинг threat intelligence-фидов',
      ],
      relatedCategory: 'Технический оффенсив',
    },
    {
      id: 2,
      code: 'weapon',
      name: 'Weaponization',
      nameRu: 'Вооружение',
      description: 'Атакующий готовит средство атаки — связку «эксплойт + полезная нагрузка» для конкретной цели.',
      attacker: [
        'Упаковка malware в офисный документ',
        'Создание PDF с эксплойтом',
        'Подготовка фейкового сайта',
        'Сборка фишингового письма',
      ],
      defender: [
        'Этот этап на стороне атакующего — напрямую защититься нельзя',
        'Threat intelligence помогает узнавать о свежих инструментах',
      ],
      relatedCategory: 'Реверс-инжиниринг и анализ вредоносного ПО',
    },
    {
      id: 3,
      code: 'deliver',
      name: 'Delivery',
      nameRu: 'Доставка',
      description: 'Атакующий передаёт оружие жертве. Первый этап, когда атакующий взаимодействует с целью.',
      attacker: [
        'Фишинговый email с вложением или ссылкой',
        'Заражение легитимного сайта (watering hole)',
        'USB-устройство, оставленное на парковке',
        'Эксплуатация публичных сервисов компании',
      ],
      defender: [
        'Фильтрация почты, sandboxing вложений',
        'Web-фильтрация и блокировка категорий',
        'Блокировка USB-устройств политикой',
        'Регулярный патчинг публичных сервисов',
      ],
      relatedCategory: 'Социальная инженерия и человеческий фактор',
    },
    {
      id: 4,
      code: 'exploit',
      name: 'Exploitation',
      nameRu: 'Эксплуатация',
      description: 'На стороне жертвы срабатывает эксплойт. Атакующий получает первичную возможность выполнения кода.',
      attacker: [
        'Эксплойт уязвимости в браузере/офисном пакете',
        'Обход sandbox',
        'Social engineering: «включите макросы»',
        'Эксплуатация неизвестных (zero-day) уязвимостей',
      ],
      defender: [
        'Быстрый патчинг',
        'EDR/антивирус с поведенческим анализом',
        'Отключение макросов по умолчанию',
        'ASLR, DEP, application whitelisting',
      ],
      relatedCategory: 'Разработка безопасного ПО (AppSec)',
    },
    {
      id: 5,
      code: 'install',
      name: 'Installation',
      nameRu: 'Установка',
      description: 'Атакующий закрепляется в системе. Устанавливает постоянный доступ, который переживёт перезагрузку.',
      attacker: [
        'Установка backdoor или RAT',
        'Размещение web-shell на сервере',
        'Добавление в автозагрузку',
        'Создание scheduled task или подмена службы',
      ],
      defender: [
        'EDR с поведенческим анализом',
        'Контроль целостности файлов',
        'Мониторинг подозрительных процессов',
        'Ограничение прав пользователей',
      ],
      relatedCategory: 'Цифровая криминалистика и реагирование на инциденты (DFIR)',
    },
    {
      id: 6,
      code: 'c2',
      name: 'Command & Control',
      nameRu: 'Управление (C2)',
      description: 'Атакующий устанавливает канал связи между жертвой и своей инфраструктурой. Через него отправляются команды.',
      attacker: [
        'HTTPS-туннели на свои серверы',
        'DNS-туннелирование',
        'Использование легитимных платформ (GitHub, Discord) как C2',
        'Domain fronting',
      ],
      defender: [
        'Анализ сетевого трафика (NDR)',
        'DNS-мониторинг и фильтрация',
        'Threat hunting по индикаторам компрометации',
        'Ограничение исходящего трафика',
      ],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)',
    },
    {
      id: 7,
      code: 'actions',
      name: 'Actions on Objectives',
      nameRu: 'Действия',
      description: 'Атакующий достигает основной цели — кражи данных, шифрования, саботажа или распространения внутри сети.',
      attacker: [
        'Эксфильтрация конфиденциальных данных',
        'Развёртывание ransomware',
        'Lateral movement к более ценным системам',
        'Привилегиэскалация (Domain Admin)',
      ],
      defender: [
        'Сегментация сети',
        'Шифрование чувствительных данных',
        'DLP-системы',
        'Регулярные резервные копии',
        'Privileged Access Management',
      ],
      relatedCategory: 'Практический менеджмент и GRC (Управление, риск, соответствие)',
    },
  ],
};

let arSelectedStage = null;  // id текущей раскрытой стадии (или null)
// Рендер схемы — пока заглушка, будет переписан в Итерации 2
function renderARScheme(schemeCode) {
  console.log('renderARScheme вызван с кодом:', schemeCode);
  
  const container = document.getElementById('arSchemeContainer');
  if (!container) {
    console.error('arSchemeContainer не найден!');
    return;
  }
  
  // Очищаем перед рендером
  container.innerHTML = '';
  arSelectedStage = null;

  if (schemeCode === 'killchain') {
    renderKillChainScheme();
  } else {
    container.innerHTML = `
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.6);backdrop-filter:blur(10px);padding:20px;border-radius:12px;color:#fff;text-align:center;pointer-events:none;">
        Схема в разработке
      </div>
    `;
  }
}
function findKillChainStageForBook(book) {
  // Ищем первую категорию книги, которая привязана к этапу Kill Chain
  const cats = (book && book.categories) || [];
  for (const cat of cats) {
    const stage = AR_KILL_CHAIN.stages.find(s => s.relatedCategory === cat);
    if (stage) return stage;
  }
  return null;
}
// Считается, что этап «изучен», если у юзера есть хотя бы одна книга
// из соответствующей категории со статусом completed
function isKillChainStageStudied(stage) {
  if (!state.currentUser || !state.books || !state.mylist) return false;
  const completedBookIds = Object.entries(state.mylist)
    .filter(([, status]) => status === 'completed')
    .map(([id]) => parseInt(id));
  if (completedBookIds.length === 0) return false;
  return state.books.some(b =>
    b.category === stage.relatedCategory && completedBookIds.includes(b.id)
  );
}

function renderKillChainScheme() {
  console.log('renderKillChainScheme вызван');
  const container = document.getElementById('arSchemeContainer');
  if (!container) {
    console.error('arSchemeContainer не найден');
    return;
  }
  
  const stages = AR_KILL_CHAIN.stages;
  
  // Определяем ориентацию
  const isMobile = window.innerWidth < 768;
  const isPortrait = window.innerHeight > window.innerWidth;
  const isVertical = isMobile && isPortrait;
  
  // Сбрасываем зум при открытии
  currentARSchemeZoom = 1;
  
  let html = `
    <div id="arSchemeRoot" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;pointer-events:none;background:rgba(0,0,0,0.3);">
      
      <!-- Контролы зума -->
      <div style="position:absolute;top:70px;right:12px;z-index:30;display:flex;flex-direction:column;gap:8px;pointer-events:auto;">
        <button onclick="zoomARScheme('in')" style="width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);border:1px solid rgba(0,212,255,0.5);color:#00d4ff;font-size:22px;font-weight:bold;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);">+</button>
        <button onclick="zoomARScheme('out')" style="width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);border:1px solid rgba(0,212,255,0.5);color:#00d4ff;font-size:22px;font-weight:bold;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);">−</button>
        <button onclick="resetARSchemeZoom()" style="width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);border:1px solid rgba(0,212,255,0.5);color:#00d4ff;font-size:14px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);">⟳</button>
      </div>
      
      <!-- Контейнер для скролла с поддержкой зума -->
      <div id="killChainScrollContainer" style="flex:1;overflow:auto;pointer-events:auto;padding:64px 16px 80px;-webkit-overflow-scrolling:touch;">
        <div id="killChainWrapper" style="display:flex;justify-content:center;min-width:min-content;">
          <div id="killChainNodes" style="display:flex;flex-direction:${isVertical ? 'column' : 'row'};align-items:center;justify-content:center;gap:${isVertical ? '12px' : '8px'};transition:transform 0.2s ease;transform-origin:center center;">
            ${stages.map((s, i) => `
              ${i > 0 ? `<div style="width:${isVertical ? '2px' : '24px'};height:${isVertical ? '24px' : '2px'};background:linear-gradient(${isVertical ? '180deg' : '90deg'},rgba(0,212,255,0.3),rgba(124,58,237,0.3));flex-shrink:0;"></div>` : ''}
              ${(() => {
                const studied = isKillChainStageStudied(s);
                const borderColor = studied ? '#10b981' : 'rgba(0,212,255,0.5)';
                const checkmark = studied ? `<div style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#10b981;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:bold;box-shadow:0 2px 4px rgba(0,0,0,0.3);">✓</div>` : '';
                return `
                <button onclick="selectKillChainStage(${s.id})" id="arNode${s.id}" class="ar-killchain-node" style="position:relative;width:${isVertical ? '80px' : '64px'};height:${isVertical ? '80px' : '64px'};border-radius:50%;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);border:2px solid ${borderColor};color:#fff;font-family:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:all 0.2s;flex-shrink:0;padding:0;margin:${isVertical ? '4px 0' : '0'};">
                  <div style="font-size:${isVertical ? '22px' : '18px'};font-weight:800;line-height:1;">${s.id}</div>
                  <div style="font-size:${isVertical ? '9px' : '7px'};opacity:0.8;margin-top:${isVertical ? '6px' : '2px'};text-align:center;line-height:1.2;padding:0 6px;">${s.nameRu}</div>
                  ${checkmark}
                </button>
                `;
              })()}
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Панель деталей этапа (с возможностью свайпа вверх) -->
      <div id="arStageDetails" class="ar-stage-details-panel" style="display:none;position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.95);backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,0.2);color:#fff;max-height:70%;overflow-y:auto;pointer-events:auto;z-index:20;transform:translateY(calc(100% - 60px));transition:transform 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1);border-radius:20px 20px 0 0;">
        <div style="position:sticky;top:0;background:inherit;backdrop-filter:blur(20px);padding:12px 20px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.1);cursor:grab;touch-action:pan-y;">
          <div style="width:40px;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;margin:0 auto 8px;"></div>
          <div style="font-size:10px;color:var(--accent);font-weight:600;" id="arStageDetailTitle">НАЖМИТЕ НА ЭТАП</div>
        </div>
        <div id="arStageDetailContent" style="padding:16px 20px 24px;">
          <!-- Содержимое будет подставлено -->
        </div>
      </div>
      
      <!-- Подсказка -->
      <div id="arStageHint" style="position:absolute;bottom:0;left:0;right:0;text-align:center;padding:16px;color:rgba(255,255,255,0.7);font-size:11px;background:linear-gradient(0deg,rgba(0,0,0,0.6) 0%,transparent 100%);pointer-events:none;z-index:5;">
        Нажми на этап, чтобы узнать подробнее
      </div>
    </div>
  `;

  container.innerHTML = html;
  
  // Инициализируем свайп для панели деталей
  initStageDetailsSwipe();
  
  if (isVertical) {
    setTimeout(() => {
      const scrollContainer = document.getElementById('killChainScrollContainer');
      if (scrollContainer && stages.length > 4) {
        const hint = document.createElement('div');
        hint.style.cssText = 'position:absolute;bottom:100px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.6);border-radius:20px;padding:6px 14px;font-size:10px;color:#fff;pointer-events:none;animation:fadeOut 2s forwards;z-index:15;';
        hint.textContent = '↓ Листай вниз ↓';
        document.getElementById('arSchemeRoot').appendChild(hint);
        setTimeout(() => hint.remove(), 2000);
      }
    }, 500);
  }
}

// Глобальные переменные для свайпа
let detailsPanelStartY = 0;
let detailsPanelCurrentY = 0;
let detailsPanelIsDragging = false;
let detailsPanelOpen = false;

function initStageDetailsSwipe() {
  const panel = document.getElementById('arStageDetails');
  if (!panel) return;
  
  // Удаляем старые обработчики
  panel.removeEventListener('touchstart', onDetailsTouchStart);
  panel.removeEventListener('touchmove', onDetailsTouchMove);
  panel.removeEventListener('touchend', onDetailsTouchEnd);
  
  // Добавляем новые
  panel.addEventListener('touchstart', onDetailsTouchStart, { passive: false });
  panel.addEventListener('touchmove', onDetailsTouchMove, { passive: false });
  panel.addEventListener('touchend', onDetailsTouchEnd);
}

function onDetailsTouchStart(e) {
  detailsPanelStartY = e.touches[0].clientY;
  detailsPanelIsDragging = true;
  const panel = document.getElementById('arStageDetails');
  if (panel) {
    panel.style.transition = 'none';
  }
}

function onDetailsTouchMove(e) {
  if (!detailsPanelIsDragging) return;
  e.preventDefault();
  
  const currentY = e.touches[0].clientY;
  const deltaY = currentY - detailsPanelStartY;
  const panel = document.getElementById('arStageDetails');
  if (!panel) return;
  
  const panelHeight = panel.offsetHeight;
  const currentTransform = detailsPanelOpen ? 0 : panelHeight - 60;
  let newTransform = currentTransform + deltaY;
  
  // Ограничиваем диапазон
  newTransform = Math.max(0, Math.min(newTransform, panelHeight - 60));
  
  panel.style.transform = `translateY(${newTransform}px)`;
  detailsPanelCurrentY = newTransform;
}

function onDetailsTouchEnd(e) {
  if (!detailsPanelIsDragging) return;
  detailsPanelIsDragging = false;
  
  const panel = document.getElementById('arStageDetails');
  if (!panel) return;
  
  const panelHeight = panel.offsetHeight;
  const threshold = panelHeight * 0.3;
  
  // Решаем, открыть или закрыть
  if (detailsPanelCurrentY < threshold) {
    // Открыть полностью
    panel.style.transform = 'translateY(0)';
    detailsPanelOpen = true;
  } else if (detailsPanelCurrentY > panelHeight - 60 - threshold) {
    // Закрыть до минимального размера
    panel.style.transform = `translateY(${panelHeight - 60}px)`;
    detailsPanelOpen = false;
  } else {
    // Вернуться к предыдущему состоянию
    if (detailsPanelOpen) {
      panel.style.transform = 'translateY(0)';
    } else {
      panel.style.transform = `translateY(${panelHeight - 60}px)`;
    }
  }
  
  panel.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1)';
}
let currentARSchemeZoom = 1;
const AR_ZOOM_MIN = 0.5;
const AR_ZOOM_MAX = 2.5;

function zoomARScheme(direction) {
  const nodesContainer = document.getElementById('killChainNodes');
  if (!nodesContainer) return;

  if (direction === 'in') {
    currentARSchemeZoom = Math.min(currentARSchemeZoom + 0.15, AR_ZOOM_MAX);
  } else if (direction === 'out') {
    currentARSchemeZoom = Math.max(currentARSchemeZoom - 0.15, AR_ZOOM_MIN);
  }

  applyARSchemeZoom();
  showZoomIndicator(Math.round(currentARSchemeZoom * 100));
}

function applyARSchemeZoom() {
  // Меняем размеры всех нод и соединителей реальными CSS-свойствами,
  // а не transform: scale(). Это позволяет скроллу понимать новый размер.
  const isVertical = window.innerWidth < 768;
  const baseNodeSize = isVertical ? 80 : 64;
  const baseGap = isVertical ? 12 : 8;
  const baseConnectorMain = isVertical ? 24 : 24;       // длина по основной оси
  const baseConnectorCross = 2;                         // толщина
  const baseFontNum = isVertical ? 22 : 18;
  const baseFontLabel = isVertical ? 9 : 7;

  const z = currentARSchemeZoom;
  const nodeSize = Math.round(baseNodeSize * z);
  const gap = Math.round(baseGap * z);
  const connectorMain = Math.round(baseConnectorMain * z);
  const fontNum = Math.round(baseFontNum * z);
  const fontLabel = Math.round(baseFontLabel * z);

  const nodesContainer = document.getElementById('killChainNodes');
  if (nodesContainer) {
    nodesContainer.style.gap = gap + 'px';
    nodesContainer.style.transform = 'none';  // на всякий случай очищаем старый scale
  }

  // Обновляем все ноды
  AR_KILL_CHAIN.stages.forEach(s => {
    const node = document.getElementById('arNode' + s.id);
    if (!node) return;
    node.style.width = nodeSize + 'px';
    node.style.height = nodeSize + 'px';
    const num = node.querySelector('div:first-child');
    const lbl = node.querySelector('div:last-child');
    if (num) num.style.fontSize = fontNum + 'px';
    if (lbl) lbl.style.fontSize = fontLabel + 'px';
  });

  // Обновляем соединители (тонкие линии между нодами)
  document.querySelectorAll('#killChainNodes > div:not([id])').forEach(c => {
    if (isVertical) {
      c.style.width = baseConnectorCross + 'px';
      c.style.height = connectorMain + 'px';
    } else {
      c.style.width = connectorMain + 'px';
      c.style.height = baseConnectorCross + 'px';
    }
  });
}

function resetARSchemeZoom() {
  currentARSchemeZoom = 1;
  applyARSchemeZoom();
  const scrollContainer = document.getElementById('killChainScrollContainer');
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
    scrollContainer.scrollLeft = 0;
  }
  showZoomIndicator(100);
}

function resetARSchemeZoom() {
  currentARSchemeZoom = 1;
  const nodesContainer = document.getElementById('killChainNodes');
  const scrollContainer = document.getElementById('killChainScrollContainer');
  
  if (nodesContainer) {
    nodesContainer.style.transform = 'scale(1)';
  }
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
  }
  
  showZoomIndicator(100);
}

// Функция для показа индикатора зума с SVG вместо эмодзи
function showZoomIndicator(percent) {
  // Удаляем старый индикатор
  const oldIndicator = document.getElementById('zoomIndicator');
  if (oldIndicator) oldIndicator.remove();
  
  // Создаём новый индикатор с SVG иконкой
  const indicator = document.createElement('div');
  indicator.id = 'zoomIndicator';
  indicator.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle; margin-right:8px;">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      <line x1="11" y1="8" x2="11" y2="14"/>
      <line x1="8" y1="11" x2="14" y2="11"/>
    </svg>
    <span>${percent}%</span>
  `;
  indicator.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0,0,0,0.85);
    backdrop-filter: blur(12px);
    color: #00d4ff;
    font-size: 18px;
    font-weight: bold;
    padding: 12px 24px;
    border-radius: 48px;
    z-index: 100;
    pointer-events: none;
    animation: zoomFadeOut 0.8s forwards;
    font-family: 'JetBrains Mono', monospace;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid rgba(0,212,255,0.3);
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  `;
  document.body.appendChild(indicator);
  
  setTimeout(() => indicator.remove(), 800);
}


function resetARSchemeZoom() {
  currentARSchemeZoom = 1;
  const nodesContainer = document.getElementById('killChainNodes');
  if (nodesContainer) {
    nodesContainer.style.transform = 'scale(1)';
    nodesContainer.style.transition = 'transform 0.2s ease';
  }
  showZoomIndicator(100);
}

function showZoomIndicator(percent) {
  // Удаляем старый индикатор
  const oldIndicator = document.getElementById('zoomIndicator');
  if (oldIndicator) oldIndicator.remove();
  
  // Создаём новый
  const indicator = document.createElement('div');
  indicator.id = 'zoomIndicator';
  indicator.textContent = `${percent}%`;
  indicator.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0,0,0,0.8);
    backdrop-filter: blur(10px);
    color: #00d4ff;
    font-size: 20px;
    font-weight: bold;
    padding: 12px 24px;
    border-radius: 40px;
    z-index: 100;
    pointer-events: none;
    animation: zoomFadeOut 0.8s forwards;
    font-family: 'JetBrains Mono', monospace;
  `;
  document.body.appendChild(indicator);
  
  setTimeout(() => indicator.remove(), 800);
}

// Добавляем анимацию для индикатора зума
const style = document.createElement('style');
style.textContent = `
  @keyframes zoomFadeOut {
    0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    70% { opacity: 0.8; }
    100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
  }
  
  @keyframes fadeOut {
    0% { opacity: 1; }
    100% { opacity: 0; }
  }
  
  .ar-killchain-node {
    transition: all 0.2s ease;
  }
  
  .ar-killchain-node:active {
    transform: scale(0.95);
  }
`;
document.head.appendChild(style);

function selectKillChainStage(stageId) {
  const stage = AR_KILL_CHAIN.stages.find(s => s.id === stageId);
  if (!stage) return;

  arSelectedStage = stageId;

  // Подсветить выбранную ноду
  AR_KILL_CHAIN.stages.forEach(s => {
    const node = document.getElementById('arNode' + s.id);
    if (!node) return;
    if (s.id === stageId) {
      node.style.background = 'var(--accent-gradient)';
      node.style.borderColor = '#fff';
      node.style.transform = 'scale(1.15)';
      node.style.boxShadow = '0 0 24px rgba(0,212,255,0.7)';
    } else {
      node.style.background = 'rgba(0,0,0,0.5)';
      node.style.borderColor = isKillChainStageStudied(s) ? '#10b981' : 'rgba(255,255,255,0.2)';
      node.style.transform = 'scale(1)';
      node.style.boxShadow = 'none';
    }
  });

  // На мобильных скроллим к элементу
  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    const selectedNode = document.getElementById('arNode' + stageId);
    const scrollContainer = document.getElementById('killChainScrollContainer');
    if (selectedNode && scrollContainer) {
      const nodeRect = selectedNode.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      const scrollOffset = nodeRect.top - containerRect.top + scrollContainer.scrollTop - 100;
      scrollContainer.scrollTo({ top: scrollOffset, behavior: 'smooth' });
    }
  }

  // Скрыть подсказку
  const stageHint = document.getElementById('arStageHint');
  if (stageHint) stageHint.style.display = 'none';

  // Найти связанные книги
  const relatedBooks = (state.books || []).filter(b => (b.categories || []).includes(stage.relatedCategory));

  // Обновляем заголовок панели
  const titleEl = document.getElementById('arStageDetailTitle');
  if (titleEl) {
    titleEl.innerHTML = `ЭТАП ${stage.id} — ${stage.nameRu.toUpperCase()}`;
  }
  
  // Обновляем содержимое панели
  const contentEl = document.getElementById('arStageDetailContent');
  if (contentEl) {
    contentEl.innerHTML = `
      <div style="margin-bottom:16px;">
        <div style="font-size:13px;line-height:1.5;opacity:0.9;margin-bottom:14px;">${eh(stage.description)}</div>
      </div>

      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#ef4444;letter-spacing:0.5px;margin-bottom:8px;">${ICONS.iconSword} ЧТО ДЕЛАЕТ АТАКУЮЩИЙ</div>
        <ul style="margin:0;padding-left:20px;font-size:11px;line-height:1.6;opacity:0.85;">
          ${stage.attacker.map(a => `<li style="margin-bottom:4px;">${eh(a)}</li>`).join('')}
        </ul>
      </div>

      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#10b981;letter-spacing:0.5px;margin-bottom:8px;">${ICONS.iconShield} КАК ЗАЩИТИТЬСЯ</div>
        <ul style="margin:0;padding-left:20px;font-size:11px;line-height:1.6;opacity:0.85;">
          ${stage.defender.map(d => `<li style="margin-bottom:4px;">${eh(d)}</li>`).join('')}
        </ul>
      </div>

      ${relatedBooks.length > 0 ? `
        <div style="margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:rgba(0,212,255,0.9);letter-spacing:0.5px;margin-bottom:8px;">${ICONS.iconBook} КНИГИ ПО ТЕМЕ</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${relatedBooks.slice(0, 3).map(b => `
              <button onclick="openBookFromAR(${b.id})" style="text-align:left;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:10px 12px;color:#fff;cursor:pointer;font-family:inherit;font-size:11px;transition:all 0.2s;">
                <div style="font-weight:600;margin-bottom:4px;">${eh(b.title)}</div>
                <div style="font-size:10px;opacity:0.6;">${eh(b.author)}</div>
              </button>
            `).join('')}
          </div>
        </div>
      ` : `
        <div style="font-size:11px;opacity:0.5;text-align:center;padding:12px;background:rgba(255,255,255,0.04);border-radius:10px;margin-bottom:16px;">
          Книг по теме «${eh(stage.relatedCategory)}» пока нет
        </div>
      `}

      <div style="display:flex;gap:10px;margin-top:8px;">
        <button onclick="prevKillChainStage()" ${stageId === 1 ? 'disabled' : ''} style="flex:1;padding:12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:10px;color:#fff;cursor:pointer;font-family:inherit;font-size:12px;font-weight:500;${stageId === 1 ? 'opacity:0.4;cursor:default;' : ''}">← Назад</button>
        <button onclick="${stageId === 7 ? 'closeAR()' : 'nextKillChainStage()'}" style="flex:1;padding:12px;background:var(--accent-gradient);border:none;border-radius:10px;color:#fff;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;box-shadow:0 2px 8px rgba(0,212,255,0.3);">${stageId === 7 ? 'Закрыть схему ✓' : 'Далее →'}</button>
      </div>
    `;
  }

  // Показываем панель с анимацией
  const panel = document.getElementById('arStageDetails');
  if (panel && panel.style.display !== 'block') {
    panel.style.display = 'block';
    setTimeout(() => {
      const panelHeight = panel.offsetHeight;
      panel.style.transform = `translateY(${panelHeight - 60}px)`;
      detailsPanelOpen = false;
    }, 10);
  }
}

function closeKillChainStage() {
  arSelectedStage = null;
  // Сбросить визуальное состояние нод
  AR_KILL_CHAIN.stages.forEach(s => {
    const node = document.getElementById('arNode' + s.id);
    if (!node) return;
    node.style.background = 'rgba(0,0,0,0.7)';
    node.style.borderColor = isKillChainStageStudied(s) ? '#10b981' : 'rgba(0,212,255,0.5)';
    node.style.transform = 'scale(1)';
    node.style.boxShadow = 'none';
  });
  document.getElementById('arStageDetails').style.display = 'none';
  document.getElementById('arStageHint').style.display = 'block';
}

function prevKillChainStage() {
  if (arSelectedStage && arSelectedStage > 1) {
    selectKillChainStage(arSelectedStage - 1);
  }
}

function nextKillChainStage() {
  if (arSelectedStage && arSelectedStage < 7) {
    selectKillChainStage(arSelectedStage + 1);
  }
}

function openBookFromAR(bookId) {
  // Закрываем AR-экран и переходим на детальную страницу книги
  closeAR();
  openBookDetail(bookId);
}



// ========== STATE ==========
const state = {
  currentUser: null, currentTab: 'login', currentScreen: 'auth', detailTab: 'info', aiOpen: false, catalogOpen: false,
  mylistTab: 'reading', mylistSort: 'date-desc', trainingTab: 'all',
  filters: { categories: [], sort: 'default', status: 'all' },
  books: [],
  readingProgress: {}, mylist: {}, reviews: {}, completedQuizzes: {},
  pendingAiAction: null,
  analyticsCache: null,
};
let pdfDoc = null, pdfCurrentPage = 1, pdfTotalPages = 0, currentBookId = null, lastSelection = null;
let epubCurrentPage = 1, epubTotalPages = 0;
let currentQuiz = { bookId: null, questions: [], currentIndex: 0, score: 0, answers: [] };
let pomodoroInterval = null, pomodoroSeconds = 25 * 60, pomodoroRunning = false, pomodoroMode = 'work';
let analyticsCharts = {};

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

function getXpForLevel(level) { return level * 100; }
function calculateLevel(totalXp) {
  let level = 1, remaining = totalXp;
  while (remaining >= getXpForLevel(level)) {
    remaining -= getXpForLevel(level);
    level++;
  }
  return { level, currentLevelXp: remaining, nextLevelXp: getXpForLevel(level) };
}

async function loadGamificationFromApi() {
  if (!state.currentUser) return false;
  try {
    const me = await api.me();
    state.gamification.xp = me.xp || 0;
    state.gamification.streakCount = me.streak_count || 0;
    const [owned, catalog] = await Promise.all([
      api.library.myAchievements(),
      api.library.allAchievements(),
    ]);
    state.gamification.achievementsOwned = owned;
    state.gamification.achievementsCatalog = catalog;
    return true;
  } catch (err) {
    console.error('Не удалось загрузить геймификацию:', err);
    return false;
  }
}

async function refreshGamificationFromApi() {
  const before = state.gamification.achievementsOwned.map(a => a.code);
  await loadGamificationFromApi();
  const after = state.gamification.achievementsOwned;
  after.forEach(a => {
    if (!before.includes(a.code)) {
      showToast(`Достижение получено: ${a.name}!`);
    }
  });
  if (state.currentScreen === 'profile') {
    updateProfileXpDisplay();
    renderAchievementsInProfile();
  }
}

function updateProfileXpDisplay() {
  if (!state.currentUser) return;
  const xp = state.gamification.xp;
  const { level, currentLevelXp, nextLevelXp } = calculateLevel(xp);
  const el = id => document.getElementById(id);
  if (el('profileLevel')) el('profileLevel').textContent = level;
  if (el('profileXp')) el('profileXp').textContent = currentLevelXp;
  if (el('profileXpNext')) el('profileXpNext').textContent = nextLevelXp;
  if (el('xpBarFill')) el('xpBarFill').style.width = (currentLevelXp / nextLevelXp * 100) + '%';
}

function getStreak() {
  return state.gamification.streakCount || 0;
}

// Маппинг кодов достижений в SVG-иконки
function getAchievementIcon(code) {
  const map = {
    'ach_reading_1': ICONS.achReading,
    'ach_quiz_1':    ICONS.achQuiz,
    'xp_1000':       ICONS.achXp,
    'review_1':      ICONS.achReview,
  };
  return map[code] || ICONS.target;  // fallback на мишень, если код не знаем
}

function renderAchievementsInProfile() {
  const l = document.getElementById('achievementsList');
  if (!l) return;
  const owned = state.gamification.achievementsOwned || [];
  if (!owned.length) {
    l.innerHTML = '<span style="font-size:10px;color:var(--text-muted);">Нет достижений</span>';
    return;
  }
  l.innerHTML = owned.map(a =>
    `<span class="achievement-badge ${a.tier}" title="${eh(a.description)}"><span style="display:inline-flex;vertical-align:middle;margin-right:4px;">${getAchievementIcon(a.code)}</span>${eh(a.name)}</span>`
  ).join('');
}

function getRecommendations(limit = 3) {
  if (!state.currentUser) return [];
  const ub = Object.entries(state.mylist || {}).filter(([, s]) => ['reading', 'completed', 'liked'].includes(s)).map(([id]) => parseInt(id));
  if (!ub.length) return [...state.books].sort((a, b) => b.popularity - a.popularity).slice(0, limit);
  const cats = new Set(), auths = new Set();
  ub.forEach(id => {
    const b = state.books.find(x => x.id === id);
    if (b) { (b.categories || []).forEach(c => cats.add(c)); auths.add(b.author); }
  });
  return state.books.filter(b => !ub.includes(b.id))
    .map(b => {
      const bookCats = b.categories || [];
      const hasMatchingCategory = bookCats.some(c => cats.has(c));
      return { b, score: (hasMatchingCategory ? 40 : 0) + (auths.has(b.author) ? 25 : 0) + b.popularity / 20 };
    })
    .sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.b);
}

// ========== DRAG AND DROP FOR MYLIST ==========
let draggedBookId = null;

function initDragAndDrop() {
  const grid = document.getElementById('mylistGrid');
  if (!grid) return;

  grid.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.book-card-compact');
    if (!card) return;
    draggedBookId = parseInt(card.dataset.bookId);
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedBookId);
  });

  grid.addEventListener('dragend', (e) => {
    const card = e.target.closest('.book-card-compact');
    if (card) card.classList.remove('dragging');
    draggedBookId = null;
    document.querySelectorAll('.mylist-tab').forEach(t => t.classList.remove('drag-over'));
  });

  document.querySelectorAll('.mylist-tab').forEach(tab => {
    tab.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      tab.classList.add('drag-over');
    });

    tab.addEventListener('dragleave', () => {
      tab.classList.remove('drag-over');
    });

    tab.addEventListener('drop', async (e) => {
      e.preventDefault();
      tab.classList.remove('drag-over');
      const bookId = parseInt(e.dataTransfer.getData('text/plain'));
      const newStatus = tab.dataset.mylist;
      if (bookId && newStatus) {
        await updateBookStatus(bookId, newStatus);
        renderMyList();
        showToast('Статус обновлён');
      }
    });
  });
}

// ========== REVIEWS CACHE ==========
const reviewsCache = {};

async function getReviews(bookId) {
  if (reviewsCache[bookId]) return reviewsCache[bookId];
  try {
    const list = await api.library.reviews(bookId);
    const adapted = list.map(r => ({
      id: r.id,
      user: r.user_username,
      avatar: (r.user_username || '?').charAt(0).toUpperCase(),
      rating: r.rating,
      text: r.text,
      date: r.created_at,
      _userId: r.user_id,
    }));
    reviewsCache[bookId] = adapted;
    return adapted;
  } catch (err) {
    console.error('Не удалось загрузить отзывы:', err);
    return [];
  }
}

async function addReview(bookId, rating, text) {
  if (!state.currentUser) return;
  try {
    await api.library.addReview(bookId, rating, text);
    delete reviewsCache[bookId];
    await refreshBookFromApi(bookId);
    showToast('Отзыв сохранён!');
    refreshGamificationFromApi();
    if (state.currentScreen === 'detail' && currentBookId === bookId) {
      renderReviews();
      renderBookInfo();
    }
  } catch (err) {
    if (err instanceof api.ApiError) {
      showToast('Ошибка: ' + (err.detail || err.status));
    } else {
      showToast('Сервер недоступен');
    }
  }
}

async function deleteReview(bookId, reviewId) {
  try {
    await api.library.deleteReview(reviewId);
    delete reviewsCache[bookId];
    await refreshBookFromApi(bookId);
    showToast('Отзыв удалён');
    if (state.currentScreen === 'detail' && currentBookId === bookId) {
      renderReviews();
      renderBookInfo();
    }
  } catch (err) {
    if (err instanceof api.ApiError) {
      if (err.status === 403) showToast('Нельзя удалить чужой отзыв');
      else showToast('Ошибка: ' + (err.detail || err.status));
    } else {
      showToast('Сервер недоступен');
    }
  }
}

async function refreshBookFromApi(bookId) {
  try {
    const fresh = await api.books.get(bookId);
    const adapted = adaptBookFromApi(fresh);
    const idx = state.books.findIndex(b => b.id === bookId);
    if (idx >= 0) state.books[idx] = adapted;
    if (state.currentBook && state.currentBook.id === bookId) state.currentBook = adapted;
  } catch (err) {
    console.error('Не удалось обновить книгу:', err);
  }
}

let reviewRating = 0;

function setReviewStar(n) {
  reviewRating = n;
  document.querySelectorAll('#reviewForm .star').forEach((el, i) => {
    el.classList.toggle('filled', i < n);
  });
}

function renderStarSVG(filled) {
  return filled ? ICONS.star : ICONS.starEmpty;
}

async function renderReviews() {
  const container = document.getElementById('detailTabReviews');
  if (!container || !currentBookId) return;

  showListSkeleton('detailTabReviews', 2);

  const reviews = await getReviews(currentBookId);
  const me = state.currentUser;
  const myReview = me ? reviews.find(r => r._userId === me.id) : null;

  const reviewsHtml = reviews.length === 0
    ? '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px;">Пока нет отзывов. Будьте первым!</div>'
    : reviews.map(r => {
        const canDelete = me && (r._userId === me.id || me.role === 'admin');
        const dateStr = new Date(r.date).toLocaleDateString('ru-RU');
        return `<div class="review-card">
          <div class="review-header">
            <div class="review-user">
              <div class="review-avatar"><img src="${api.users.avatarUrl(r._userId)}" alt="" onerror="this.outerHTML='${eh(r.avatar)}'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></div>
              <div>
                <div style="font-size:12px;font-weight:600;">${eh(r.user)}</div>
                <div class="review-date">${dateStr}</div>
              </div>
            </div>
            <div class="review-rating">
              ${[1,2,3,4,5].map(i => `<span class="star ${i <= r.rating ? 'filled' : ''}">${renderStarSVG(i <= r.rating)}</span>`).join('')}
            </div>
          </div>
          <div class="review-text">${eh(r.text || '')}</div>
          ${canDelete ? `<button class="btn-sm danger" style="margin-top:6px;" onclick="deleteReview(${currentBookId}, ${r.id})">${ICONS.trash} Удалить</button>` : ''}
        </div>`;
      }).join('');

  const formHtml = me ? `
    <div id="reviewForm" style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;margin-top:16px;">
      <h4 style="font-size:13px;margin-bottom:10px;color:var(--accent);">${myReview ? 'Обновить мой отзыв' : 'Оставить отзыв'}</h4>
      <div class="star-input">
        ${[1,2,3,4,5].map(i => `<span class="star ${i <= (myReview?.rating || 0) ? 'filled' : ''}" onclick="setReviewStar(${i})">${renderStarSVG(i <= (myReview?.rating || 0))}</span>`).join('')}
      </div>
      <textarea id="reviewTextInput" rows="3" placeholder="Поделитесь впечатлением..." style="width:100%;margin-bottom:8px;">${eh(myReview?.text || '')}</textarea>
      <button class="btn btn-primary" onclick="submitReview()" style="padding:10px;font-size:13px;">Отправить</button>
    </div>
  ` : '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px;">Войдите, чтобы оставить отзыв</div>';

  container.innerHTML = reviewsHtml + formHtml;

  if (myReview) reviewRating = myReview.rating;
  else reviewRating = 0;
}

function submitReview() {
  if (!state.currentUser) return showToast('Войдите, чтобы оставить отзыв');
  if (!currentBookId) return;
  if (reviewRating < 1 || reviewRating > 5) return showToast('Поставьте оценку от 1 до 5 звёзд');
  const text = document.getElementById('reviewTextInput').value.trim();
  addReview(currentBookId, reviewRating, text);
}

// ========== ANNOTATIONS ==========
const annotationsCache = {};

function adaptAnnotation(a) {
  return {
    id: a.id,
    type: a.type,
    text: a.selected_text,
    note: a.note_text || '',
    page: a.page,
    position: a.position || {},
    date: a.created_at,
  };
}

async function getAnnotations(bookId) {
  if (annotationsCache[bookId]) return annotationsCache[bookId];
  try {
    const list = await api.library.annotations(bookId);
    const adapted = list.map(adaptAnnotation);
    annotationsCache[bookId] = adapted;
    return adapted;
  } catch (err) {
    console.error('Не удалось загрузить аннотации:', err);
    return [];
  }
}

async function addHighlight(bookId, text, pageNum, pos) {
  if (!text || text.length > 10000) {
    showToast('Слишком длинный фрагмент (максимум 10000 символов)');
    return null;
  }
  try {
    const created = await api.library.addAnnotation(bookId, {
      type: 'highlight',
      page: pageNum,
      selected_text: text,
      position: pos || {},
    });
    delete annotationsCache[bookId];
    if (currentBookId === bookId) await renderAnnotations();
    refreshGamificationFromApi();
    return created;
  } catch (err) {
    if (err instanceof api.ApiError) showToast('Ошибка: ' + (err.detail || err.status));
    else showToast('Сервер недоступен');
    return null;
  }
}

async function addNote(bookId, text, note, pageNum, pos) {
  if (!text || text.length > 10000) {
    showToast('Слишком длинный фрагмент');
    return null;
  }
  if (note && note.length > 5000) {
    showToast('Заметка слишком длинная (максимум 5000 символов)');
    return null;
  }
  try {
    const created = await api.library.addAnnotation(bookId, {
      type: 'note',
      page: pageNum,
      selected_text: text,
      note_text: note || '',
      position: pos || {},
    });
    delete annotationsCache[bookId];
    if (currentBookId === bookId) await renderAnnotations();
    refreshGamificationFromApi();
    return created;
  } catch (err) {
    if (err instanceof api.ApiError) showToast('Ошибка: ' + (err.detail || err.status));
    else showToast('Сервер недоступен');
    return null;
  }
}

async function deleteAnnotation(bookId, annId) {
  try {
    await api.library.deleteAnnotation(annId);
    delete annotationsCache[bookId];
    if (currentBookId === bookId) await renderAnnotations();
    if (state.currentScreen === 'detail' && state.detailTab === 'notes') renderDetailNotes();
  } catch (err) {
    if (err instanceof api.ApiError) {
      if (err.status === 403) showToast('Нельзя удалить чужую аннотацию');
      else showToast('Ошибка: ' + (err.detail || err.status));
    } else {
      showToast('Сервер недоступен');
    }
  }
}

async function convertToNote(annId) {
  const list = await getAnnotations(currentBookId);
  const ann = list.find(a => a.id === annId);
  if (!ann) return;
  const noteText = prompt('Введите заметку:', '');
  if (!noteText || !noteText.trim()) return;

  try {
    await api.library.addAnnotation(currentBookId, {
      type: 'note',
      page: ann.page,
      selected_text: ann.text,
      note_text: noteText.trim(),
      position: ann.position || {},
    });
    await api.library.deleteAnnotation(annId);

    delete annotationsCache[currentBookId];
    document.querySelectorAll('.note-tooltip').forEach(e => e.remove());
    await renderAnnotations();
    showToast('Заметка сохранена!');
  } catch (err) {
    showToast('Не удалось преобразовать');
  }
}

async function renderAnnotations() {
  if (isEpubMode) return;
  const layer = document.getElementById('annotationLayer');
  if (!layer || !currentBookId) return;
  const list = await getAnnotations(currentBookId);
  const onPage = list.filter(a => a.page === pdfCurrentPage);
  layer.innerHTML = onPage.map(a => a.type === 'highlight'
    ? `<div class="highlight-mark" style="left:${a.position?.x || 10}%;top:${a.position?.y || 10}%;width:${a.position?.w || 30}%;height:${a.position?.h || 3}%;" title="${eh(a.text)}" onclick="showAnnotationDetail(${a.id})"></div>`
    : `<div class="note-indicator" style="left:${a.position?.x || 15}%;top:${a.position?.y || 15}%;" onclick="showNoteTooltip(${a.id})">${ICONS.bookmark}</div>`
  ).join('');
}

async function showAnnotationDetail(id) {
  const list = await getAnnotations(currentBookId);
  const ann = list.find(a => a.id === id);
  if (!ann) return;
  document.querySelectorAll('.note-tooltip').forEach(e => e.remove());
  const t = document.createElement('div');
  t.className = 'note-tooltip';
  t.innerHTML = `<div style="font-size:11px;margin-bottom:4px;">${eh(ann.text.substring(0, 100))}${ann.text.length > 100 ? '...' : ''}</div><div style="display:flex;gap:4px;"><button class="btn-sm" onclick="deleteAnnotation(${currentBookId},${id});this.parentElement.parentElement.remove();">${ICONS.trash} Удалить</button>${ann.type === 'highlight' ? `<button class="btn-sm" onclick="convertToNote(${id})">${ICONS.bookmark} Заметка</button>` : ''}</div>`;
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
  t.innerHTML = `<div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">${ICONS.bookmark} Заметка</div><div style="font-size:11px;margin-bottom:4px;">${eh(ann.note)}</div><button class="btn-sm" onclick="deleteAnnotation(${currentBookId},${id});this.parentElement.remove();">${ICONS.trash} Удалить</button>`;
  t.style.left = (ann.position?.x || 15) + '%';
  t.style.top = ((ann.position?.y || 15) + 3) + '%';
  document.getElementById('pdfViewport').appendChild(t);
}

async function exportNotes() {
  if (!currentBookId) { showToast('Откройте книгу для экспорта заметок'); return; }
  const ann = await getAnnotations(currentBookId);
  if (!ann.length) { showToast('Нет заметок для экспорта'); return; }
  const b = state.books.find(x => x.id === currentBookId);
  let md = `# Заметки: ${b ? b.title : 'Книга'}\n\n`;
  ann.sort((a, b) => a.page - b.page).forEach(a => {
    md += `## Стр. ${a.page}\n`;
    if (a.type === 'highlight') md += `> ${a.text}\n\n`;
    if (a.type === 'note') {
      md += `> ${a.text}\n\n`;
      md += `Заметка: ${a.note}\n\n`;
    }
    md += `---\n\n`;
  });
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `notes_${b?.title?.replace(/[^a-z0-9]/gi, '_') || 'book'}.md`;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('Заметки экспортированы!');
}

async function renderDetailNotes() {
  if (!currentBookId) return;
  const c = document.getElementById('detailTabNotes');
  showListSkeleton('detailTabNotes', 3);

  const ann = await getAnnotations(currentBookId);
  if (!ann.length) {
    c.innerHTML = `<div class="mylist-empty"><div class="icon" style="font-size:48px;">${ICONS.bookmark}</div><p>Нет заметок</p></div>`;
    return;
  }

  // Разделяем по типу для статистики
  const highlights = ann.filter(a => a.type === 'highlight');
  const notes = ann.filter(a => a.type === 'note');

  const statsHtml = `
    <div style="display:flex;gap:8px;margin-bottom:14px;font-size:11px;">
      <div style="flex:1;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:8px;padding:8px;text-align:center;">
        <div style="font-size:18px;font-weight:700;color:#fbbf24;">${highlights.length}</div>
        <div style="color:var(--text-muted);">Маркеров</div>
      </div>
      <div style="flex:1;background:rgba(0,212,255,0.08);border:1px solid rgba(0,212,255,0.3);border-radius:8px;padding:8px;text-align:center;">
        <div style="font-size:18px;font-weight:700;color:var(--accent);">${notes.length}</div>
        <div style="color:var(--text-muted);">Заметок</div>
      </div>
    </div>
  `;

  const itemsHtml = ann.sort((a, b) => new Date(b.date) - new Date(a.date)).map(a => {
    const isNote = a.type === 'note';
    const stripColor = isNote ? 'var(--accent)' : '#fbbf24';
    const bgTint = isNote ? 'rgba(0,212,255,0.04)' : 'rgba(251,191,36,0.04)';
    const cfi = a.position && a.position.cfi;
    // Если есть CFI и сейчас не открыта книга — можно прыгнуть
    const goAction = cfi
      ? `onclick="goToEpubAnnotation(${currentBookId}, '${(cfi || '').replace(/'/g, '&#39;')}')"`
      : '';
    const cursor = cfi ? 'cursor:pointer;' : '';

    return `
      <div style="background:${bgTint};border:1px solid var(--border);border-left:3px solid ${stripColor};border-radius:8px;padding:12px;margin-bottom:8px;${cursor}" ${goAction}>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">
          <div style="font-size:10px;color:${stripColor};font-weight:600;">
            ${isNote ? 'ЗАМЕТКА' : 'МАРКЕР'} · Стр.${a.page}
          </div>
          <button class="btn-sm danger" style="padding:2px 8px;font-size:10px;flex-shrink:0;" onclick="event.stopPropagation();deleteAnnotation(${currentBookId},${a.id})">${ICONS.trash}</button>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;font-style:italic;">«${eh(a.text.substring(0, 200))}${a.text.length > 200 ? '…' : ''}»</div>
        ${a.note ? `
          <div style="margin-top:8px;padding:8px;background:var(--bg-primary);border-radius:6px;font-size:12px;color:var(--text-primary);line-height:1.5;">
            ${eh(a.note)}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  c.innerHTML = statsHtml + itemsHtml;
    const tabEl = document.querySelector('.detail-tab[data-dtab="notes"]');
  if (tabEl) {
    tabEl.textContent = `Заметки${ann.length ? ` (${ann.length})` : ''}`;
  }
}

// ========== POMODORO TIMER ==========
function togglePomodoro() { document.getElementById('pomodoroContainer').classList.toggle('show'); }
function updatePomodoroDisplay() { const m = Math.floor(pomodoroSeconds / 60), s = pomodoroSeconds % 60; document.getElementById('pomodoroTimer').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }
function startPomodoro() {
  if (pomodoroRunning) return;
  pomodoroRunning = true;
  document.getElementById('pomodoroStart').style.display = 'none';
  document.getElementById('pomodoroPause').style.display = 'inline-block';
  document.getElementById('pomodoroStatus').textContent = pomodoroMode === 'work' ? 'Фокус' : 'Перерыв';
  pomodoroInterval = setInterval(() => {
    pomodoroSeconds--;
    updatePomodoroDisplay();
    if (pomodoroSeconds <= 0) {
      clearInterval(pomodoroInterval);
      pomodoroRunning = false;
      if (pomodoroMode === 'work') {
        pomodoroMode = 'break';
        pomodoroSeconds = 5 * 60;
        showToast('Перерыв!');
      } else {
        pomodoroMode = 'work';
        pomodoroSeconds = 25 * 60;
        showToast('Работаем!');
      }
      document.getElementById('pomodoroStart').style.display = 'inline-block';
      document.getElementById('pomodoroPause').style.display = 'none';
      updatePomodoroDisplay();
    }
  }, 1000);
}
function pausePomodoro() { clearInterval(pomodoroInterval); pomodoroRunning = false; document.getElementById('pomodoroStart').style.display = 'inline-block'; document.getElementById('pomodoroPause').style.display = 'none'; }
function resetPomodoro() { clearInterval(pomodoroInterval); pomodoroRunning = false; pomodoroMode = 'work'; pomodoroSeconds = 25 * 60; document.getElementById('pomodoroStart').style.display = 'inline-block'; document.getElementById('pomodoroPause').style.display = 'none'; updatePomodoroDisplay(); }

// ========== QUIZ ==========
function renderQuizQuestion() {
  const c = document.getElementById('detailTabTraining');
  if (!c) return;
  const q = currentQuiz.questions[currentQuiz.currentIndex];
  const userAnswer = currentQuiz.answers[currentQuiz.currentIndex];
  const isAnswered = userAnswer !== -1;

  c.innerHTML = `<div class="quiz-container">
    <div style="margin-bottom:16px;">
      <span style="font-size:11px;color:var(--text-muted);">Вопрос ${currentQuiz.currentIndex + 1} из ${currentQuiz.questions.length}</span>
    </div>
    <div class="quiz-question">${eh(q.q)}</div>
    <div class="quiz-options">
      ${q.options.map((o, i) => {
        const isSelected = isAnswered && userAnswer === i;
        const cls = 'quiz-option' + (isSelected ? ' selected' : '');
        return `<button class="${cls}" ${isAnswered ? 'disabled' : ''} onclick="answerQuiz(${i})">
          <span class="quiz-option-letter">${'ABCD'[i]}</span>${eh(o)}
        </button>`;
      }).join('')}
    </div>
    <div class="quiz-nav">
      <button class="btn-quiz" onclick="prevQuestion()" ${currentQuiz.currentIndex === 0 ? 'disabled' : ''}>${ICONS.chevronLeft} Назад</button>
      ${currentQuiz.currentIndex < currentQuiz.questions.length - 1
        ? `<button class="btn-quiz primary" onclick="nextQuestion()">Далее ${ICONS.chevronRight}</button>`
        : `<button class="btn-quiz primary" onclick="finishQuiz()">${ICONS.check} Завершить</button>`}
    </div>
  </div>`;
}
function nextQuestion() { if (currentQuiz.currentIndex < currentQuiz.questions.length - 1) { currentQuiz.currentIndex++; renderQuizQuestion(); } }
function prevQuestion() { if (currentQuiz.currentIndex > 0) { currentQuiz.currentIndex--; renderQuizQuestion(); } }

const quizCache = {};

async function loadCompletedQuizzesFromApi() {
  if (!state.currentUser) return false;
  try {
    const attempts = await api.library.myQuizAttempts();
    const passedBooks = new Set();
    attempts.forEach(a => {
      if (a.percentage >= 60) passedBooks.add(a.book_id);
    });
    state.completedQuizzes[state.currentUser.name] = Array.from(passedBooks);
    return true;
  } catch (err) {
    console.error('Не удалось загрузить попытки тестов:', err);
    return false;
  }
}

async function fetchQuizForBook(bookId) {
  if (quizCache[bookId]) return quizCache[bookId];
  try {
    const questions = await api.library.quiz(bookId);
    quizCache[bookId] = questions;
    return questions;
  } catch (err) {
    showToast('Не удалось загрузить тест');
    return [];
  }
}

async function startQuiz(bookId) {
  const questions = await fetchQuizForBook(bookId);
  if (!questions.length) return showToast('Нет вопросов теста');

  currentQuiz = {
    bookId,
    questions: questions.map(q => ({
      q: q.question,
      options: q.options,
      correct: -1,
      _id: q.id,
    })),
    currentIndex: 0,
    score: 0,
    answers: new Array(questions.length).fill(-1),
  };
  renderQuizQuestion();
}

function startCombinedQuiz(bookIds) {
  showToast('Комбо-тест будет доступен после миграции AI-чата (Этап 3)');
}

function answerQuiz(i) {
  if (currentQuiz.answers[currentQuiz.currentIndex] !== -1) return;
  currentQuiz.answers[currentQuiz.currentIndex] = i;
  renderQuizQuestion();
}

async function finishQuiz() {
  const answers = currentQuiz.answers.map(a => a === -1 ? -1 : a);
  const cleanAnswers = answers.map(a => a < 0 ? 0 : a);

  let result;
  try {
    result = await api.library.submitQuiz(currentQuiz.bookId, cleanAnswers);
  } catch (err) {
    if (err instanceof api.ApiError) showToast('Ошибка: ' + (err.detail || err.status));
    else showToast('Сервер недоступен');
    return;
  }

  result.correct_indices.forEach((ci, idx) => {
    if (currentQuiz.questions[idx]) currentQuiz.questions[idx].correct = ci;
  });
  currentQuiz.score = result.score;

  if (result.percentage >= 60 && state.currentUser) {
    if (!state.completedQuizzes[state.currentUser.name]) state.completedQuizzes[state.currentUser.name] = [];
    if (!state.completedQuizzes[state.currentUser.name].includes(currentQuiz.bookId)) {
      state.completedQuizzes[state.currentUser.name].push(currentQuiz.bookId);
    }
  }
  refreshGamificationFromApi();

  const c = document.getElementById('detailTabTraining');
  if (c) {
    const t = result.total, s = result.score, p = result.percentage;

    const breakdown = currentQuiz.questions.map((q, idx) => {
      const userIdx = currentQuiz.answers[idx];
      const correctIdx = q.correct;
      const userText = userIdx >= 0 ? q.options[userIdx] : '— нет ответа —';
      const correctText = q.options[correctIdx];
      const isCorrect = userIdx === correctIdx;
      return `<div style="background:var(--bg-card);border:1px solid var(--border);border-left:3px solid ${isCorrect ? '#22c55e' : '#ef4444'};border-radius:var(--radius);padding:12px;margin-bottom:8px;text-align:left;">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Вопрос ${idx + 1}</div>
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;">${eh(q.q)}</div>
        <div style="font-size:12px;margin-bottom:4px;">
          <span style="color:var(--text-muted);">Ваш ответ:</span>
          <span style="color:${isCorrect ? '#22c55e' : '#ef4444'};font-weight:500;">${eh(userText)} ${isCorrect ? ICONS.check : ICONS.x}</span>
        </div>
        ${!isCorrect ? `<div style="font-size:12px;">
          <span style="color:var(--text-muted);">Правильный:</span>
          <span style="color:#22c55e;font-weight:500;">${eh(correctText)}</span>
        </div>` : ''}
      </div>`;
    }).join('');

    c.innerHTML = `<div class="quiz-result ${p >= 60 ? 'success' : 'partial'}" style="margin-bottom:16px;">
      <div style="font-size:64px;margin-bottom:16px;">${p >= 80 ? ICONS.shield : ICONS.education}</div>
      <div style="font-size:28px;font-weight:700;">${p}%</div>
      <div style="font-size:14px;margin:8px 0;">${s}/${t}</div>
      <button class="btn-quiz primary" onclick="startQuiz(${currentQuiz.bookId})" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 20px;">
      <span style="display: inline-flex; align-items: center; line-height: 1;">${ICONS.refresh}</span>
      <span style="display: inline-block; line-height: 1;">Заново</span>
    </button>
      </div>
    <div style="margin-top:20px;">
      <h4 style="font-size:13px;margin-bottom:10px;color:var(--accent);">Разбор ответов</h4>
      ${breakdown}
    </div>`;
  }
}

// ========== AI ==========
function generateAIResponse(msg) {
  const m = msg.toLowerCase();

  if (/рекомендац|посоветуй|что почитать|похож/i.test(m)) {
    const r = getRecommendations(3);
    return r.length ? `Рекомендую:\n\n${r.map((b, i) => `${i + 1}. ${b.title} (${b.rating})`).join('\n')}` : 'Начните читать книги!';
  }

  if (/саммари|опиши|о чем/i.test(m)) {
    return state.currentBook ? `Книга: ${state.currentBook.title}\n\n${state.currentBook.desc}` : 'Откройте книгу';
  }

  if (/тест|вопрос|quiz/i.test(m)) {
    if (state.currentBook) {
      state.pendingAiAction = 'quiz_context';
      return `Хотите сгенерировать тест:\n\n1. По текущей книге "${state.currentBook.title}"\n2. По всем прочитанным книгам\n\nНапишите "1" или "2" для выбора.`;
    } else {
      const completedBooks = Object.entries(state.mylist || {}).filter(([, s]) => s === 'completed').map(([id]) => parseInt(id));
      if (completedBooks.length > 0) {
        state.pendingAiAction = 'quiz_all';
        return `У вас ${completedBooks.length} прочитанных книг. Сгенерировать комбинированный тест по всем? (напишите "да")`;
      }
      return 'Откройте книгу или прочитайте хотя бы одну для генерации теста.';
    }
  }

  if (state.pendingAiAction === 'quiz_context' && (m === '1' || m.includes('текущ') || m.includes('эта'))) {
    state.pendingAiAction = null;
    return `Тест по "${state.currentBook.title}" готов! Перейдите на вкладку "Обучение" для прохождения.`;
  }

  if (state.pendingAiAction === 'quiz_context' && (m === '2' || m.includes('все') || m.includes('прочитан'))) {
    state.pendingAiAction = null;
    const completedBooks = Object.entries(state.mylist || {}).filter(([, s]) => s === 'completed').map(([id]) => parseInt(id));
    if (completedBooks.length > 0) {
      startCombinedQuiz(completedBooks);
      return `Комбинированный тест по ${completedBooks.length} книгам готов! Перейдите на вкладку "Обучение".`;
    }
    return 'Нет прочитанных книг для комбинированного теста.';
  }

  if (state.pendingAiAction === 'quiz_all' && (m === 'да' || m === 'yes' || m === 'ок')) {
    state.pendingAiAction = null;
    const completedBooks = Object.entries(state.mylist || {}).filter(([, s]) => s === 'completed').map(([id]) => parseInt(id));
    if (completedBooks.length > 0) {
      startCombinedQuiz(completedBooks);
      return `Комбинированный тест готов! Перейдите на вкладку "Обучение".`;
    }
    return 'Нет прочитанных книг.';
  }

  if (/прогресс|статистик/i.test(m)) {
    const xp = state.gamification.xp;
    return `Уровень: ${calculateLevel(xp).level} | XP: ${xp} | Стрик: ${getStreak()}`;
  }

  return 'Я могу: Саммари | Тесты | Рекомендации | Прогресс';
}

// ========== NAVIGATION ==========
const screens = {
  auth: document.getElementById('authScreen'),
  home: document.getElementById('homeScreen'),
  detail: document.getElementById('detailScreen'),
  reader: document.getElementById('readerScreen'),
  mylist: document.getElementById('mylistScreen'),
  profile: document.getElementById('profileScreen'),
  admin: document.getElementById('adminScreen'),
  training: document.getElementById('trainingScreen'),
  onboarding: document.getElementById('onboardingScreen'),
};

function navigateTo(s) {
  Object.values(screens).forEach(x => x.classList.remove('active'));
  if (s === 'auth' || s === 'onboarding') {
    screens[s].classList.add('active');
    document.getElementById('bottomNav').classList.add('hidden');
  } else {
    screens[s].classList.add('active');
    document.getElementById('bottomNav').classList.remove('hidden');
  }
  state.currentScreen = s;
  document.body.classList.toggle('reader-active', s === 'reader');
  document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.screen === s));
  closeAIPanel();
  if (s === 'home') { renderHome(); renderRecommendations(); }
  if (s === 'mylist') { renderMyList(); initDragAndDrop(); }
  if (s === 'training') renderTrainingScreen();
  if (s === 'profile') { renderProfile(); updateProfileXpDisplay(); renderAchievementsInProfile(); renderHeatmap(); }
  if (s === 'admin') renderAdminPanel();
  updateFabVisibility();
}

function updateFabVisibility() {
  document.getElementById('fabSuperContainer')?.classList.toggle('visible', state.currentUser?.role === 'admin' && state.currentScreen === 'home');
}

// ========== AUTH ==========
document.querySelectorAll('.auth-tab').forEach(t => t.addEventListener('click', function () {
  document.querySelectorAll('.auth-tab').forEach(x => x.classList.remove('active'));
  this.classList.add('active');
  state.currentTab = this.dataset.tab;
  const isRegister = state.currentTab === 'register';
  document.getElementById('registerEmailField').classList.toggle('hidden', !isRegister);
  document.getElementById('registerFirstNameField').classList.toggle('hidden', !isRegister);
  document.getElementById('registerLastNameField').classList.toggle('hidden', !isRegister);
  document.getElementById('authPass').required = !isRegister;
  document.querySelector('#authForm .btn').textContent = isRegister ? 'Зарегистрироваться' : 'Войти';
}));

function socialAuth(provider) {
  if (provider === 'sberid') {
    showToast('Вход через Сбер ID скоро будет доступен');
  } else {
    showToast(`Вход через ${provider} ещё не реализован`);
  }
}

function adaptBookFromApi(b) {
  // Определяем наличие файла по всем возможным полям
  const hasPdf = b.has_pdf === true || b.has_pdf === 'true' || b.has_pdf === 1;
  const hasEpub = b.has_epub === true || b.has_epub === 'true' || b.has_epub === 1;
  const hasFile = b.has_file === true || b.has_file === 'true' || b.has_file === 1;
  const hasFormat = b.file_format === 'pdf' || b.file_format === 'epub';
  
  // Если API вернул has_file напрямую — верим ему. Иначе проверяем has_pdf/has_epub/file_format
  const has_file = hasFile || hasPdf || hasEpub || hasFormat;

  return {
    id: b.id,
    title: b.title,
    author: b.author,
    categories: b.categories || [],  // ← массив!
    rating: typeof b.rating === 'string' ? b.rating : Number(b.rating).toFixed(1),
    icon: b.icon || ICONS.bookCover,
    desc: b.description || '',
    has_file: !!(b.has_pdf || b.has_epub || b.has_file),
    has_cover: !!(b.has_cover || b.cover_url),
    file_format: b.file_format || 'pdf',
    total_pages: b.total_pages || 0,
    dateAdded: (b.created_at || '').split('T')[0],
    datePublished: b.date_published || null,
    popularity: b.popularity || 50,
    views: b.views || 0,
    downloads: b.downloads || 0,
  };
}

function ensureProgress(book) {
  if (!state.readingProgress[book.id]) {
    state.readingProgress[book.id] = {
      currentPage: 1,
      totalPages: book.total_pages > 0 ? book.total_pages : 20,
      started: false,
    };
  } else if (book.total_pages > 0 && state.readingProgress[book.id].totalPages !== book.total_pages) {
    state.readingProgress[book.id].totalPages = book.total_pages;
  }
}

async function loadBooksFromApi() {
  try {
    const data = await api.books.list({ per_page: 100 });
    state.books = data.items.map(adaptBookFromApi);
    state.books.forEach(b => {
      ensureProgress(b);
    });
    saveState();
    return true;
  } catch (err) {
    console.error('Не удалось загрузить книги с API:', err);
    showToast('Не удаётся загрузить книги с сервера');
    state.books = [];
    return false;
  }
}

function formatApiError(err) {
  if (!(err instanceof api.ApiError)) return 'Не удаётся связаться с сервером.';

  if (Array.isArray(err.detail) && err.detail.length > 0) {
    const first = err.detail[0];
    const field = first.loc?.[first.loc.length - 1] || 'поле';
    const fieldRu = { username: 'логин', password: 'пароль', email: 'email', full_name: 'имя' }[field] || field;
    return `${fieldRu}: ${first.msg}`;
  }

  if (typeof err.detail === 'string') return err.detail;

  return `Ошибка ${err.status}`;
}

document.getElementById('authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const n = document.getElementById('authName').value.trim();
  const p = document.getElementById('authPass').value.trim();
  const email = document.getElementById('authEmail')?.value?.trim() || '';
  if (!n) return showToast('Введите логин');
  if (!p) return showToast('Введите пароль');

  if (state.currentTab === 'register') {
    if (n.length < 3) return showToast('Логин: минимум 3 символа');
    if (n.length > 64) return showToast('Логин: максимум 64 символа');
    if (!/^[a-zA-Z0-9_]+$/.test(n)) return showToast('Логин: только латиница, цифры и _');
    if (p.length < 8) return showToast('Пароль: минимум 8 символов');
    if (email && !email.includes('@')) return showToast('Введите корректный email');
  }

  const submitBtn = document.getElementById('authSubmitBtn');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = '...';

  try {
    if (state.currentTab === 'register') {
      const firstName = document.getElementById('authFirstName').value.trim();
      const lastName = document.getElementById('authLastName').value.trim();
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;
      await api.register(n, p, email || null, fullName);
    } else {
      await api.login(n, p);
    }
    const user = await api.me();
    state.currentUser = {
        name: user.username,
        role: user.role,
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        has_avatar: user.has_avatar,
        cyber_level: user.cyber_level,
        topic_scores: user.topic_scores,
        level_assessed_at: user.level_assessed_at,
      };
      await loadBooksFromApi();
      await loadMyListFromApi();
      await loadProgressFromApi();
      await loadCompletedQuizzesFromApi();
      await loadGamificationFromApi();
      await loadOfflineBookIds();

      saveState();
      document.getElementById('authForm').reset();

      // Если регистрация и cyber_level ещё не определён — показываем онбординг
      if (state.currentTab === 'register' && !user.cyber_level) {
      renderLevelChoices();  // Сначала рендерим карточки
      navigateTo('onboarding');
    } else {
        navigateTo('home');
      }
  } catch (err) {
    showToast(formatApiError(err));
    if (!(err instanceof api.ApiError)) console.error(err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
});

function logout() {
  api.logout();
  state.currentUser = null;
  navigateTo('auth');
}

async function tryAutoLogin() {
  if (!api.isAuthenticated()) return false;
  try {
    const user = await api.me();
   state.currentUser = {
      name: user.username,
      role: user.role,
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      has_avatar: user.has_avatar,
      cyber_level: user.cyber_level,
      topic_scores: user.topic_scores,
      level_assessed_at: user.level_assessed_at,
    };

    await loadBooksFromApi();
    await loadMyListFromApi();
    await loadProgressFromApi();
    await loadCompletedQuizzesFromApi();
    await loadGamificationFromApi();
    await loadOfflineBookIds();

    saveState();
    return true;
  } catch (err) {
    api.logout();
    return false;
  }
}

// ========== CATALOG & FILTERS ==========
function toggleCatalogPanel() { state.catalogOpen = !state.catalogOpen; document.getElementById('catalogPanel').classList.toggle('show', state.catalogOpen); if (state.catalogOpen) populateCatalog(); }
function closeCatalogPanel() { state.catalogOpen = false; document.getElementById('catalogPanel').classList.remove('show'); }
function populateCatalog() {
  // Собираем все уникальные категории из всех книг
  const allCats = new Set();
  state.books.forEach(b => (b.categories || []).forEach(c => allCats.add(c)));
  const cats = [...allCats];
  document.getElementById('catalogChips').innerHTML = cats.map(c => `<span class="catalog-chip${state.filters.categories.includes(c) ? ' active' : ''}" onclick="toggleCategoryFilter('${c}')">${c}</span>`).join('');
  document.getElementById('filterSort').value = state.filters.sort;
  document.getElementById('filterStatus').value = state.filters.status;
}
function toggleCategoryFilter(c) { const idx = state.filters.categories.indexOf(c); if (idx === -1) state.filters.categories.push(c); else state.filters.categories.splice(idx, 1); populateCatalog(); applyFilters(); }
function applyFilters() { state.filters.sort = document.getElementById('filterSort').value; state.filters.status = document.getElementById('filterStatus').value; renderHome(); showToast('Применено'); }
function resetFilters() { state.filters = { categories: [], sort: 'default', status: 'all' }; populateCatalog(); renderHome(); showToast('Сброшено'); }
function getFilteredBooks() {
  let books = [...state.books]; const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  if (q) books = books.filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q));
  if (state.filters.categories.length > 0) {
    books = books.filter(b => {
      const bCats = b.categories || [];
      return state.filters.categories.some(filterCat => bCats.includes(filterCat));
    });
  }
  if (state.filters.status === 'reading') books = books.filter(b => state.mylist[b.id] === 'reading');
  if (state.filters.status === 'completed') books = books.filter(b => state.mylist[b.id] === 'completed');
  if (state.filters.status === 'dropped') books = books.filter(b => state.mylist[b.id] === 'dropped');
  switch (state.filters.sort) {
    case 'rating': books.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating)); break;
    case 'title': books.sort((a, b) => a.title.localeCompare(b.title)); break;
    case 'dateAdded': books.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded)); break;
    case 'datePublished': books.sort((a, b) => new Date(b.datePublished || '2020-01-01') - new Date(a.datePublished || '2020-01-01')); break;
    default: books.sort((a, b) => b.popularity - a.popularity);
  }
  return books;
}

// ========== HOME ==========
function renderRecommendations() {
  const container = document.getElementById('sectionRecommendations');
  const list = document.getElementById('recommendationsList');
  if (!container || !list) return;

  const recs = getRecommendations(3);
  if (recs.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  list.innerHTML = recs.map(b => `
    <div class="recommendation-card" onclick="openBookDetail(${b.id})">
      <div style="font-size:32px;width:48px;height:64px;display:flex;align-items:center;justify-content:center;background:linear-gradient(145deg, #1a2030, #1a1530);border-radius:8px;border:1px solid var(--border);flex-shrink:0;">
        ${b.has_cover ? `<img src="${api.books.coverUrl(b.id)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" onerror="this.outerHTML='${ICONS.bookCover.replace(/"/g, '&quot;')}'">` : ICONS.bookCover}
      </div>
      <div>
        <div style="font-size:13px;font-weight:600;">${eh(b.title)}</div>
        <div style="font-size:11px;color:var(--text-muted);">${eh(b.author)} • ${b.rating}</div>
      </div>
    </div>
  `).join('');
}

function renderHome() {
  if (!state.currentUser) return;
  updateAvatar('avatarHome');
  const isAdmin = state.currentUser.role === 'admin';
  document.getElementById('badgeHome').classList.toggle('hidden', !isAdmin);
  document.getElementById('btnAdminGo').classList.toggle('hidden', !isAdmin);
  updateFabVisibility();
  const sorted = getFilteredBooks(), q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  renderBookScroll('scrollContinue', sorted.filter(b => state.readingProgress[b.id]?.started), q);
  renderBookScroll('scrollPopular', [...sorted].sort((a, b) => b.popularity - a.popularity), q);
  renderBookScroll('scrollAll', sorted, q);
  renderRecommendations();
}

function highlightText(text, query) {
  if (!query) return eh(text);
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return eh(text).replace(regex, '<span class="search-highlight">$1</span>');
}

function renderBookScroll(id, books, query) {
  document.getElementById(id).innerHTML = books.map(b => cardHTML(b, query)).join('');
}

function cardHTML(b, query) {
  const p = state.readingProgress[b.id];
  const pct = p?.started ? Math.min(Math.round(p.currentPage / p.totalPages * 100), 100) : 0;

  const coverInner = b.has_cover
    ? `<img src="${api.books.coverUrl(b.id)}" alt="" loading="lazy"
            style="width:100%;height:100%;object-fit:cover;"
            onerror="this.outerHTML='<div class=&quot;cover-bg&quot;>${ICONS.bookCover.replace(/"/g, '&quot;')}</div>'">`
    : `<div class="cover-bg">${ICONS.bookCover}</div>`;

  return `<div class="book-card-compact" onclick="openBookDetail(${b.id})" data-book-id="${b.id}" draggable="true">
    <div class="cover-area">
      ${coverInner}
      <div class="rating-badge">${ICONS.star}${b.rating}</div>
      ${offlineBookIds.has(b.id) ? `<div class="offline-badge" title="Доступна оффлайн">${ICONS.cloudCheck}</div>` : ''}
      ${pct ? `<div class="progress-badge">${pct}%</div><div class="progress-indicator" style="width:${pct}%"></div>` : ''}
    </div>
  </div>`;
}

// ========== MYLIST ==========
document.getElementById('mylistTabs').addEventListener('click', e => {
  const t = e.target.closest('.mylist-tab');
  if (!t) return;
  state.mylistTab = t.dataset.mylist;
  renderMyList();
});

function renderMyList() {
  updateAvatar('avatarMylist');
  const g = { reading: [], planned: [], dropped: [], completed: [], liked: [] };
  state.books.forEach(b => {
    const s = state.mylist[b.id];
    if (s && g[s]) g[s].push(b);
  });
  document.querySelectorAll('.mylist-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.mylist === state.mylistTab);
    t.querySelector('.count').textContent = g[t.dataset.mylist]?.length || 0;
  });
  document.getElementById('mylistGrid').innerHTML = g[state.mylistTab]?.length
    ? g[state.mylistTab].map(b => cardHTML(b)).join('')
    : `<div class="mylist-empty"><div class="icon" style="font-size:48px;">${ICONS.bookmark}</div><p>Пусто</p></div>`;

  initDragAndDrop();
}

// ========== TRAINING ==========
document.getElementById('trainingTabs').addEventListener('click', e => {
  const t = e.target.closest('.training-tab');
  if (!t) return;
  state.trainingTab = t.dataset.ttab;
  renderTrainingScreen();
});

function renderTrainingScreen() {
  updateAvatar('avatarTraining');
  document.querySelectorAll('.training-tab').forEach(t => t.classList.toggle('active', t.dataset.ttab === state.trainingTab));

  const completed = state.currentUser ? (state.completedQuizzes[state.currentUser.name] || []) : [];
  let all = state.books.map(b => ({
    bookId: b.id,
    book: b,
    completed: completed.includes(b.id),
  }));

  let f = all;
  if (state.trainingTab === 'completed') f = all.filter(t => t.completed);
  if (state.trainingTab === 'pending') f = all.filter(t => !t.completed);

  // Блок «Тест уровня кибербезопасности» — только на вкладке «Пройдено»
  let cyberLevelBlock = '';
  if (state.trainingTab === 'completed' && state.currentUser) {
    const lvl = state.currentUser.cyber_level;
    if (lvl) {
      const info = getCyberLevelInfo(lvl);
      cyberLevelBlock = `
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-xl);padding:16px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
            <div style="display:flex;width:48px;height:48px;align-items:center;justify-content:center;background:var(--accent-gradient);border-radius:12px;color:#fff;flex-shrink:0;">${info.icon.replace('width="20"','width="28"').replace('height="20"','height="28"')}</div>
            <div style="flex:1;">
              <div style="font-size:11px;color:var(--text-muted);">Твой уровень кибербезопасности</div>
              <div style="font-size:16px;font-weight:700;color:var(--accent);">${eh(info.name)}</div>
            </div>
          </div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;line-height:1.5;">
            Результат не устраивает? Можно пересдать — текущий заменится новым.
          </div>
          <div style="display:flex;gap:8px;">
            <button onclick="openCyberLevelModal()" style="flex:1;padding:10px;background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;color:var(--text-secondary);font-family:inherit;font-size:12px;cursor:pointer;">Подробнее</button>
            <button onclick="restartOnboardingFromTraining()" style="flex:1;padding:10px;background:var(--accent-gradient);border:none;border-radius:10px;color:#fff;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;">Пройти заново</button>
          </div>
        </div>
      `;
    } else {
      // Юзер не проходил тест — предлагаем пройти
      cyberLevelBlock = `
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-xl);padding:16px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
            <div style="display:flex;width:48px;height:48px;align-items:center;justify-content:center;background:var(--accent-gradient);border-radius:12px;color:#fff;flex-shrink:0;">${ICONS.target.replace('width="22"','width="28"').replace('height="22"','height="28"')}</div>
            <div style="flex:1;">
              <div style="font-size:11px;color:var(--text-muted);">Тест уровня</div>
              <div style="font-size:16px;font-weight:700;">Определи свой уровень</div>
            </div>
          </div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;line-height:1.5;">
            20 вопросов из 5 тем кибербезопасности. Узнай, где у тебя пробелы и что подтянуть.
          </div>
          <button onclick="restartOnboardingFromTraining()" style="width:100%;padding:12px;background:var(--accent-gradient);border:none;border-radius:10px;color:#fff;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 15px rgba(0,212,255,0.3);">Пройти тест уровня</button>
        </div>
      `;
    }
  }

  const listHtml = f.length
    ? f.map(t => `<div class="training-card" onclick="startQuizFromTraining(${t.bookId})">
        <h4>${eh(t.book.title)}</h4>
        <div class="meta">${eh(bookCategoriesText(t.book))}</div>
        <span class="status ${t.completed ? 'status-completed' : 'status-pending'}">${t.completed ? ICONS.check + ' Пройдено' : ICONS.clock + ' Не пройдено'}</span>
      </div>`).join('')
    : `<div class="mylist-empty"><div class="icon" style="font-size:48px;">${ICONS.education}</div><p>Нет тестов</p></div>`;

  document.getElementById('trainingList').innerHTML = cyberLevelBlock + listHtml;
}

function restartOnboardingFromTraining() {
  // Если юзер уже проходил — спрашиваем подтверждение
  if (state.currentUser && state.currentUser.cyber_level) {
    if (!confirm('Пройти тест заново? Текущий результат будет заменён новым.')) return;
  }
  renderLevelChoices();
  navigateTo('onboarding');
  document.getElementById('onboardingResult').classList.add('hidden');
  document.getElementById('onboardingQuiz').classList.add('hidden');
  document.getElementById('onboardingWelcome').classList.remove('hidden');
}

function startQuizFromTraining(bid) {
  openBookDetail(bid);
  setTimeout(() => document.querySelector('.detail-tab[data-dtab="training"]')?.click(), 100);
}

// ========== PROFILE ==========
function renderProfile() {
  if (!state.currentUser) return;
  const u = state.currentUser;
  const displayName = u.full_name || u.name;

  // Заголовок: имя + кнопка-карандаш
  const header = document.getElementById('profileDisplayName');
  header.innerHTML = `${eh(displayName)} <button onclick="openEditProfileModal()" title="Редактировать имя" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:4px;margin-left:6px;vertical-align:middle;">${ICONS.settings}</button>`;

  // Под заголовком — username (он не меняется)
  let usernameLine = document.getElementById('profileUsernameLine');
  if (!usernameLine) {
    usernameLine = document.createElement('div');
    usernameLine.id = 'profileUsernameLine';
    usernameLine.style.cssText = 'font-size:11px;color:var(--text-muted);margin-bottom:4px;';
    header.parentNode.insertBefore(usernameLine, header.nextSibling);
  }
  usernameLine.textContent = '@' + u.name;

  // Тег роли + бейдж уровня кибербезопасности (если пройден тест)
  const roleTag = document.getElementById('profileRoleTag');
  roleTag.textContent = u.role === 'admin' ? 'Администратор' : 'Читатель';

  // Бейдж кибер-уровня — справа от роли
  let levelBadge = document.getElementById('cyberLevelBadge');
  if (u.cyber_level) {
    const levelInfo = getCyberLevelInfo(u.cyber_level);
    if (!levelBadge) {
      levelBadge = document.createElement('span');
      levelBadge.id = 'cyberLevelBadge';
      levelBadge.className = 'cyber-level-badge ' + u.cyber_level;
      roleTag.parentNode.insertBefore(levelBadge, roleTag.nextSibling);
    }
    levelBadge.className = 'cyber-level-badge ' + u.cyber_level;
    levelBadge.innerHTML = `<span style="display:inline-flex;vertical-align:middle;margin-right:4px;">${levelInfo.icon}</span>${eh(levelInfo.name)}`;
    levelBadge.style.cursor = 'pointer';
    levelBadge.title = 'Нажми для просмотра подробных результатов';
    levelBadge.onclick = openCyberLevelModal;
  } else if (levelBadge) {
    // Был бейдж, но юзер вдруг сбросил уровень — убираем
    levelBadge.remove();
  }

  // Кнопка «Пройти тест уровня» — показываем, если юзер пропустил онбординг
  let takeQuizBtn = document.getElementById('profileTakeQuizBtn');
  if (!u.cyber_level) {
    if (!takeQuizBtn) {
      takeQuizBtn = document.createElement('button');
      takeQuizBtn.id = 'profileTakeQuizBtn';
      takeQuizBtn.style.cssText = 'margin-top:14px;width:100%;padding:14px;background:var(--accent-gradient);border:none;border-radius:12px;color:#fff;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 15px rgba(0,212,255,0.3);';
      takeQuizBtn.onclick = () => {
        navigateTo('onboarding');
        document.getElementById('onboardingResult').classList.add('hidden');
        document.getElementById('onboardingQuiz').classList.add('hidden');
        document.getElementById('onboardingWelcome').classList.remove('hidden');
      };
      // Вставляем кнопку в карточку профиля сразу после username
      const insertAfter = usernameLine.parentNode;
      insertAfter.insertBefore(takeQuizBtn, usernameLine.nextSibling);
    }
    takeQuizBtn.innerHTML = `<span style="display:inline-flex;vertical-align:middle;margin-right:10px;">${ICONS.target}</span>Пройти тест уровня кибербезопасности`;
    takeQuizBtn.style.display = 'block';
  } else if (takeQuizBtn) {
    // Юзер уже прошёл — кнопка не нужна
    takeQuizBtn.style.display = 'none';
  }

  document.getElementById('statBooks').textContent = state.books.length;
  document.getElementById('statBookmarks').textContent = Object.keys(state.mylist).length;
  document.getElementById('statAchievements').textContent = (state.gamification.achievementsOwned || []).length;
  document.getElementById('statStreak').innerHTML = getStreak() + '<span style="display:inline-flex;vertical-align:middle;margin-left:2px;color:#f97316;">' + ICONS.fire + '</span>';

  // Аватар: с сервера, если has_avatar; иначе буква
  const at = document.getElementById('profileAvatarText');
  const ai = document.getElementById('profileAvatarImg');
  if (u.has_avatar) {
    at.style.display = 'none';
    ai.style.display = 'block';
    // ?t=Date.now() чтобы пробить кэш после смены аватара
    ai.src = api.users.avatarUrl(u.id) + '?t=' + Date.now();
    ai.onerror = () => {
      // Fallback — если файл по какой-то причине пропал
      at.style.display = 'block';
      ai.style.display = 'none';
      at.textContent = displayName.charAt(0).toUpperCase();
    };
  } else {
    at.style.display = 'block';
    ai.style.display = 'none';
    at.textContent = displayName.charAt(0).toUpperCase();
  }
  updateProfileXpDisplay();
  renderAchievementsInProfile();
  renderHeatmap();
  renderOfflineBooks();
}
// ========== OFFLINE BOOKS SECTION (PROFILE) ==========
function formatBytes(bytes) {
  if (!bytes) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return value.toFixed(value < 10 ? 1 : 0) + ' ' + units[i];
}

async function renderOfflineBooks() {
  const container = document.getElementById('offlineBooksSection');
  if (!container) return;
  if (!state.currentUser) { container.innerHTML = ''; return; }

  let books = [];
  try {
    books = await offlineStorage.listAll();
  } catch (e) {
    console.error('Ошибка чтения IndexedDB:', e);
    container.innerHTML = '<div style="padding:16px;color:#ef4444;font-size:12px;">Не удалось прочитать оффлайн-хранилище</div>';
    return;
  }

  // Информация о квоте
  const quota = await offlineStorage.getQuotaEstimate();
  let quotaHtml = '';
  if (quota) {
    const usagePct = quota.quota > 0 ? (quota.usage / quota.quota * 100) : 0;
    const isWarning = usagePct > 80;
    quotaHtml = `
      <div style="padding:12px 16px;background:var(--bg-primary);border-bottom:1px solid var(--border);font-size:11px;color:var(--text-muted);">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span>Использовано: ${formatBytes(quota.usage)}</span>
          <span>Доступно: ${formatBytes(quota.quota)}</span>
        </div>
        <div style="width:100%;height:4px;background:var(--bg-card);border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:${Math.min(usagePct, 100)}%;background:${isWarning ? '#f59e0b' : 'var(--accent-gradient)'};transition:width 0.5s;"></div>
        </div>
        ${isWarning ? '<div style="color:#f59e0b;margin-top:6px;">Хранилище почти заполнено</div>' : ''}
      </div>
    `;
  }

  if (books.length === 0) {
    container.innerHTML = `
      ${quotaHtml}
      <div style="padding:24px;text-align:center;color:var(--text-muted);font-size:12px;">
        <div style="font-size:32px;margin-bottom:8px;opacity:0.4;">${ICONS.cloudDownload}</div>
        <p>Нет скачанных книг</p>
        <p style="font-size:10px;margin-top:6px;">Откройте книгу и нажмите «Сохранить оффлайн», чтобы читать без интернета</p>
      </div>
    `;
    return;
  }

  // Список сохранённых книг
  const rowsHtml = books.map(b => {
    const dateSaved = new Date(b.savedAt).toLocaleDateString('ru-RU');
    return `
      <div class="settings-row" style="cursor:default;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${eh(b.title)}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">
            ${eh(b.author)} • ${(b.file_format || 'pdf').toUpperCase()} • Сохранено ${dateSaved}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="btn-sm" onclick="openBookDetail(${b.id})" title="Открыть">${ICONS.eye}</button>
          <button class="btn-sm danger" onclick="removeBookOffline(${b.id})" title="Удалить">${ICONS.trash}</button>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = quotaHtml + rowsHtml;
}
// ========== EDIT PROFILE MODAL ==========
function openEditProfileModal() {
  if (!state.currentUser) return;
  const currentName = state.currentUser.full_name || '';
  document.getElementById('editFullName').value = currentName;
  // Кнопка «Удалить аватар» только если он есть
  const avatarSection = document.getElementById('editAvatarSection');
  if (avatarSection) {
    avatarSection.style.display = state.currentUser.has_avatar ? 'block' : 'none';
  }
  document.getElementById('editProfileModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('editFullName').focus(), 100);
}

function closeEditProfileModal() {
  document.getElementById('editProfileModal').classList.add('hidden');
}

async function saveProfileEdits() {
  const fullName = document.getElementById('editFullName').value.trim();
  const btn = document.getElementById('saveProfileBtn');
  btn.disabled = true;
  btn.textContent = 'Сохранение...';
  try {
    const updated = await api.updateMe({ full_name: fullName || null });
    // Обновляем state.currentUser
    state.currentUser.full_name = updated.full_name;
    state.currentUser.has_avatar = updated.has_avatar;
    closeEditProfileModal();
    renderProfile();
    updateAvatar('avatarHome');
    updateAvatar('avatarMylist');
    updateAvatar('avatarTraining');
    showToast('Имя обновлено');
  } catch (err) {
    if (err instanceof api.ApiError) {
      showToast('Ошибка: ' + (err.detail || err.status));
    } else {
      showToast('Сервер недоступен');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Сохранить';
  }
}
async function deleteCurrentAvatar() {
  if (!confirm('Удалить аватар? Будет показываться буква.')) return;
  const btn = document.getElementById('deleteAvatarBtn');
  btn.disabled = true;
  btn.textContent = 'Удаление...';
  try {
    const updated = await api.deleteAvatar();
    state.currentUser.has_avatar = updated.has_avatar;
    closeEditProfileModal();
    renderProfile();
    updateAvatar('avatarHome');
    updateAvatar('avatarMylist');
    updateAvatar('avatarTraining');
    showToast('Аватар удалён');
  } catch (err) {
    if (err instanceof api.ApiError) {
      showToast('Ошибка: ' + (err.detail || err.status));
    } else {
      showToast('Сервер недоступен');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Удалить аватар';
  }
}
async function uploadAvatar(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 2 * 1024 * 1024) {
    showToast('Файл слишком большой (макс 2 МБ)');
    e.target.value = '';
    return;
  }
  showToast('Загружаем аватар...');
  try {
    const updated = await api.uploadAvatar(f);
    state.currentUser.has_avatar = updated.has_avatar;
    renderProfile();
    updateAvatar('avatarHome');
    updateAvatar('avatarMylist');
    updateAvatar('avatarTraining');
    showToast('Аватар обновлён');
  } catch (err) {
    if (err instanceof api.ApiError) {
      showToast('Ошибка: ' + (err.detail || err.status));
    } else {
      showToast('Сервер недоступен');
    }
  } finally {
    e.target.value = '';
  }
}

function updateAvatar(id) {
  const el = document.getElementById(id);
  if (!el || !state.currentUser) return;
  const u = state.currentUser;
  const displayName = u.full_name || u.name;
  if (u.has_avatar) {
    const img = document.createElement('img');
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    img.src = api.users.avatarUrl(u.id) + '?t=' + Date.now();
    img.onerror = () => { el.textContent = displayName.charAt(0).toUpperCase(); };
    el.innerHTML = '';
    el.appendChild(img);
  } else {
    el.innerHTML = displayName.charAt(0).toUpperCase();
  }
}

// ========== LEADERBOARD ==========
async function loadAndRenderLeaderboard() {
  const container = document.getElementById('adLeaderboard');
  if (!container) return;
  container.innerHTML = '<div style="padding:20px;color:var(--text-muted);font-size:12px;">Загрузка...</div>';
  try {
    const lb = await api.library.leaderboard(50);
    container.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Пользователь</th><th>XP</th><th>Стрик</th></tr></thead>
      <tbody>
        ${lb.map((u, i) => `<tr>
          <td>${i + 1}</td>
          <td>${eh(u.full_name || u.username)}</td>
          <td>${u.xp}</td>
          <td>${u.streak_count}<span style="display:inline-flex;vertical-align:middle;margin-left:2px;color:#f97316;">${ICONS.fire}</span></td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  } catch (err) {
    container.innerHTML = '<div style="padding:20px;color:#ef4444;">Не удалось загрузить лидерборд</div>';
  }
}

// ========== HEATMAP ==========
state.heatmapData = null;

async function loadHeatmapFromApi() {
  try {
    const data = await api.library.heatmap(90);
    state.heatmapData = data.days || [];
    return true;
  } catch (err) {
    console.error('Не удалось загрузить тепловую карту:', err);
    state.heatmapData = [];
    return false;
  }
}

async function renderHeatmap() {
  const c = document.getElementById('heatmapContainer');
  if (!c) return;
  if (!state.currentUser) { c.innerHTML = ''; return; }

  await loadHeatmapFromApi();
  const days = state.heatmapData || [];

  c.innerHTML = days.map(d => {
    const p = d.pages || 0;
    let level = 0;
    if (p > 0) level = 1;
    if (p >= 10) level = 2;
    if (p >= 30) level = 3;
    if (p >= 50) level = 4;
    return `<div class="heatmap-cell level-${level}" title="${d.date}: ${p} стр."></div>`;
  }).join('');
}

// ========== DETAIL ==========
document.getElementById('detailTabs')?.addEventListener('click', e => {
  const t = e.target.closest('.detail-tab');
  if (!t) return;
  state.detailTab = t.dataset.dtab;
  document.querySelectorAll('.detail-tab').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  document.querySelectorAll('.detail-tab-content').forEach(x => x.classList.add('hidden'));
  const tabId = 'detailTab' + t.dataset.dtab.charAt(0).toUpperCase() + t.dataset.dtab.slice(1);
  const el = document.getElementById(tabId);
  if (el) el.classList.remove('hidden');
  if (state.detailTab === 'reviews') { reviewRating = 0; renderReviews(); }
  if (state.detailTab === 'training') renderDetailTraining();
  if (state.detailTab === 'notes') renderDetailNotes();
});

function openBookDetail(bookId) {
  const b = state.books.find(x => x.id === bookId);
  if (!b) return;
  state.currentBook = b;
  currentBookId = bookId;
  state.detailTab = 'info';
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.toggle('active', t.dataset.dtab === 'info'));
  document.querySelectorAll('.detail-tab-content').forEach(x => x.classList.add('hidden'));
  document.getElementById('detailTabInfo').classList.remove('hidden');
  navigateTo('detail');
  renderBookInfo();
  refreshBookFromApi(bookId).then(() => {
    if (state.currentScreen === 'detail' && currentBookId === bookId) renderBookInfo();
  });
}

function renderBookInfo() {
  const b = state.books.find(x => x.id === currentBookId);
  if (!b) return;
  const isAdmin = state.currentUser?.role === 'admin';
  const views = b.views || 0;
  const downloads = b.downloads || 0;
  const formatLabel = (b.file_format || 'pdf').toUpperCase();
  let adminStats = '';
  if (isAdmin) {
    adminStats = `<div class="admin-book-stats"><span>${ICONS.eye} ${views} просмотров</span><span>${ICONS.download} ${downloads} скачиваний</span><span>${ICONS.fileText} ${formatLabel}</span></div>`;
  }
  document.getElementById('detailTabInfo').innerHTML = `
    <div class="detail-content">
      <div class="detail-cover">${b.has_cover ? `<img src="${api.books.coverUrl(b.id)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-lg);" onerror="this.outerHTML='${ICONS.bookCover.replace(/"/g, '&quot;')}'">` : ICONS.bookCover}</div>
      <div class="detail-info">
        <div class="detail-title">${eh(b.title)}</div>
        <div class="detail-author">${eh(b.author)}</div>
        <div class="detail-rating">${ICONS.star} ${b.rating}</div>
        <div class="detail-category">${bookCategoriesText(b)} • ${formatLabel}</div>
        <div class="detail-desc">${eh(b.desc)}</div>
        ${adminStats}
        <select class="mylist-status-select" onchange="updateBookStatus(${b.id},this.value)">
          <option value="">Не в списке</option>
          <option value="reading" ${state.mylist[currentBookId] === 'reading' ? 'selected' : ''}>Читаю</option>
          <option value="planned" ${state.mylist[currentBookId] === 'planned' ? 'selected' : ''}>В планах</option>
          <option value="dropped" ${state.mylist[currentBookId] === 'dropped' ? 'selected' : ''}>Брошено</option>
          <option value="completed" ${state.mylist[currentBookId] === 'completed' ? 'selected' : ''}>Прочитано</option>
          <option value="liked" ${state.mylist[currentBookId] === 'liked' ? 'selected' : ''}>Избранное</option>
        </select>
        <div class="detail-actions">
          <button class="btn-detail" onclick="openReader(${b.id})">${ICONS.book} Читать</button>
          ${b.has_file ? (offlineBookIds.has(b.id)
            ? `<button class="btn-detail offline-btn-saved" onclick="removeBookOffline(${b.id})">${ICONS.cloudCheck} Удалить из оффлайн</button>`
            : `<button class="btn-detail offline-btn-save" onclick="saveBookOffline(${b.id})">${ICONS.cloudDownload} Сохранить оффлайн</button>`) : ''}
          ${(() => {
            const stage = findKillChainStageForBook(b);
            if (!stage) return '';
            return `<button class="btn-detail" style="background:rgba(0,212,255,0.1);border:1px solid var(--accent);color:var(--accent);" onclick="openARWithScheme('killchain', ${stage.id})" title="Открыть схему Cyber Kill Chain на этапе «${eh(stage.nameRu)}»">${ICONS.target} Смотреть схему атаки</button>`;
          })()}
          ${isAdmin ? `<button class="btn-detail" style="background:linear-gradient(135deg,#00d4ff,#7c3aed);color:#fff;border:none;" onclick="openAdminBookModal(${b.id})">${ICONS.settings} Управление</button>` : ''}
        </div>
      </div>
    </div>`;
}

function renderDetailTraining() {
  if (!currentBookId) return;
  const c = state.completedQuizzes[state.currentUser?.name] || [];
  if (c.includes(currentBookId)) {
    document.getElementById('detailTabTraining').innerHTML = `
      <div style="text-align:center;padding:20px;">
        <div style="font-size:48px;">${ICONS.check}</div>
        <p>Пройдено!</p>
        <button class="btn-quiz primary" onclick="startQuiz(${currentBookId})" style="display:inline-flex;align-items:center;justify-content:center;gap:6px;">${ICONS.refresh}<span>Заново</span></button>
        </div>`;
  } else {
    startQuiz(currentBookId);
  }
}

// ========== MYLIST API ==========
async function loadMyListFromApi() {
  try {
    const entries = await api.library.mylist();
    state.mylist = {};
    entries.forEach(e => { state.mylist[e.book_id] = e.status; });
    return true;
  } catch (err) {
    console.error('Не удалось загрузить MyList с API:', err);
    showToast('Не удалось загрузить ваши закладки');
    return false;
  }
}

async function loadProgressFromApi() {
  try {
    const entries = await api.library.progress();
    state.readingProgress = {};
    entries.forEach(p => {
      state.readingProgress[p.book_id] = {
        currentPage: p.current_page,
        totalPages: p.total_pages,
        started: p.started,
      };
    });
    return true;
  } catch (err) {
    console.error('Не удалось загрузить прогресс с API:', err);
    showToast('Не удалось загрузить прогресс чтения');
    return false;
  }
}

// ========== PROGRESS DEBOUNCE ==========
const PROGRESS_DEBOUNCE_MS = 2000;
let progressDebounceTimer = null;
let progressPendingBookId = null;

function scheduleProgressSave(bookId) {
  progressPendingBookId = bookId;
  if (progressDebounceTimer) clearTimeout(progressDebounceTimer);
  progressDebounceTimer = setTimeout(() => {
    flushPendingProgress();
  }, PROGRESS_DEBOUNCE_MS);
}

async function flushPendingProgress() {
  if (progressDebounceTimer) {
    clearTimeout(progressDebounceTimer);
    progressDebounceTimer = null;
  }
  const bookId = progressPendingBookId;
  progressPendingBookId = null;
  if (!bookId) return;

  const p = state.readingProgress[bookId];
  if (!p) return;

  try {
    await api.library.updateProgress(bookId, p.currentPage, p.totalPages);
  } catch (err) {
    console.error('Не удалось сохранить прогресс:', err);
  }
}

window.addEventListener('beforeunload', () => {
  if (!progressPendingBookId) return;
  const bookId = progressPendingBookId;
  const p = state.readingProgress[bookId];
  if (!p) return;
  try {
    fetch('http://localhost:8000/api/books/' + bookId + '/progress', {
      method: 'PUT',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (localStorage.getItem('neon_access_token') || ''),
      },
      body: JSON.stringify({ current_page: p.currentPage, total_pages: p.totalPages }),
    });
  } catch (e) { /* ignored */ }
});

// Set с ID сохранённых оффлайн книг — обновляется при логине и при сохранении/удалении.
// Используется для быстрого рендеринга индикатора на карточке.
const offlineBookIds = new Set();

// При логине проверяем, какие книги уже в IndexedDB
async function loadOfflineBookIds() {
  try {
    const ids = await offlineStorage.listIds();
    offlineBookIds.clear();
    ids.forEach(id => offlineBookIds.add(id));
  } catch (e) {
    console.error('Не удалось получить список оффлайн-книг:', e);
  }
}

// Скачать книгу с бэка и сохранить в IndexedDB (файл + обложку + метаданные)
async function saveBookOffline(bookId) {
  const book = state.books.find(b => b.id === bookId);
  if (!book) return showToast('Книга не найдена');
  if (!book.has_file) return showToast('У книги нет файла для скачивания');

  showToast('Скачиваем книгу...');

  try {
    // 1. Скачиваем сам файл (PDF или EPUB) как Blob
    // Используем raw-fetch с Authorization, потому что нам нужен именно Blob, не ArrayBuffer
    const fileResp = await api.request('/books/' + bookId + '/pdf', { raw: true });
    const fileBlob = await fileResp.blob();

    const fileType = book.file_format === 'epub' ? 'epub' : 'pdf';

    // 2. Скачиваем обложку, если есть. При ошибке — пропускаем (книгу всё равно сохраняем)
    let coverBlob = null;
    if (book.has_cover) {
      try {
        const coverResp = await api.request('/books/' + bookId + '/cover', { raw: true });
        coverBlob = await coverResp.blob();
      } catch (e) {
        console.warn('Не удалось скачать обложку:', e);
      }
    }

    // 3. Сохраняем в IndexedDB
    await offlineStorage.save(book, fileBlob, fileType, coverBlob);
    offlineBookIds.add(bookId);

    // 4. Сообщаем юзеру и перерисовываем
    const sizeMB = (fileBlob.size / 1024 / 1024).toFixed(1);
    showToast(`Сохранено оффлайн (${sizeMB} МБ)`);

    if (state.currentScreen === 'detail' && currentBookId === bookId) renderBookInfo();
    if (state.currentScreen === 'home') renderHome();
  } catch (err) {
    console.error('Ошибка сохранения оффлайн:', err);
    if (err instanceof api.ApiError) {
      showToast('Ошибка скачивания: ' + (err.detail || err.status));
    } else if (err.name === 'QuotaExceededError') {
      showToast('Не хватает места на устройстве');
    } else {
      showToast('Сервер недоступен');
    }
  }
}

// Удалить книгу из оффлайн-хранилища
async function removeBookOffline(bookId) {
  if (!confirm('Удалить книгу из оффлайн-хранилища? Файл будет удалён с устройства.')) return;
  try {
    await offlineStorage.remove(bookId);
    offlineBookIds.delete(bookId);
    showToast('Удалено из оффлайн');
    if (state.currentScreen === 'detail' && currentBookId === bookId) renderBookInfo();
    if (state.currentScreen === 'home') renderHome();
    if (state.currentScreen === 'profile') renderProfile();
  } catch (err) {
    console.error('Ошибка удаления оффлайн:', err);
    showToast('Не удалось удалить');
  }
}

async function updateBookStatus(id, newStatus) {
  const previousStatus = state.mylist[id];

  if (newStatus) state.mylist[id] = newStatus;
  else delete state.mylist[id];

  if (state.currentScreen === 'mylist') renderMyList();

  try {
    if (newStatus) {
      await api.library.setMylistStatus(id, newStatus);
    } else {
      await api.library.removeFromMylist(id);
    }
    showToast('Статус обновлён');
  } catch (err) {
    if (previousStatus) state.mylist[id] = previousStatus;
    else delete state.mylist[id];
    if (state.currentScreen === 'mylist') renderMyList();
    if (state.currentScreen === 'detail') renderBookInfo();

    if (err instanceof api.ApiError) {
      showToast('Ошибка: ' + (err.detail || err.status));
    } else {
      showToast('Сервер недоступен');
    }
  }
}

// ========== READER (ЖЕСТЫ И СВАЙПЫ) ==========
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
const SWIPE_THRESHOLD = 50;
const SWIPE_RESTRAINT = 100;

function openReader(id) {
  const b = state.books.find(x => x.id === id);
  if (!b) return;
  currentBookId = id;
  state.currentBook = b;
  if (!state.readingProgress[id]) state.readingProgress[id] = { currentPage: 1, totalPages: 10, started: false };
  state.readingProgress[id].started = true;
  if (!state.mylist[id]) state.mylist[id] = 'reading';

  saveState();
  api.library.updateProgress(id, state.readingProgress[id].currentPage, state.readingProgress[id].totalPages).catch(e => console.error('progress on open failed:', e));
  setTimeout(() => { if (navigator.onLine) refreshGamificationFromApi(); }, 500);
  navigateTo('reader');
  document.getElementById('readerBookName').textContent = b.title;

  const format = b.file_format || 'pdf';
  document.getElementById('readerFormatBadge').textContent = format.toUpperCase();

  initReaderGestures();

  if (format === 'epub') {
    loadEpub(b);
  } else {
    loadPdf(b);
  }
}

// ========== ВЫДЕЛЕНИЕ ТЕКСТА В EPUB ==========

let epubSelectionPopup = null;

function handleEpubSelection(cfiRange, contents) {
  const sel = contents.window.getSelection();
  const text = (sel && sel.toString()) || '';
  if (!text || !text.trim()) return;

  // Координаты выделения относительно окна iframe
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // Координаты iframe в основном окне
  const iframe = contents.document.defaultView.frameElement;
  if (!iframe) return;
  const iframeRect = iframe.getBoundingClientRect();

  // Финальные координаты pop-up в основной странице
  const x = iframeRect.left + rect.left + rect.width / 2;
  const y = iframeRect.top + rect.top - 10;

  showEpubSelectionPopup(text.trim(), cfiRange, x, y, contents);
}

function showEpubSelectionPopup(selectedText, cfiRange, x, y, contents) {
  // Удаляем старый pop-up
  hideEpubSelectionPopup();

  const popup = document.createElement('div');
  popup.id = 'epubSelectionPopup';
  popup.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    transform: translate(-50%, -100%);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 6px;
    display: flex;
    gap: 4px;
    z-index: 9999;
    box-shadow: 0 6px 20px rgba(0,0,0,0.4);
  `;

  popup.innerHTML = `
    <button id="epubBtnHighlight" style="background:transparent;border:none;color:#fbbf24;font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;padding:6px 10px;border-radius:6px;display:flex;align-items:center;gap:4px;">
      🖍️ Маркер
    </button>
    <button id="epubBtnNote" style="background:transparent;border:none;color:var(--accent);font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;padding:6px 10px;border-radius:6px;display:flex;align-items:center;gap:4px;">
      📝 Заметка
    </button>
  `;

  document.body.appendChild(popup);
  epubSelectionPopup = popup;

  document.getElementById('epubBtnHighlight').onclick = async () => {
    hideEpubSelectionPopup();
    await saveEpubAnnotation('highlight', selectedText, cfiRange);
    if (contents && contents.window) contents.window.getSelection().removeAllRanges();
  };

  document.getElementById('epubBtnNote').onclick = async () => {
    hideEpubSelectionPopup();
    const noteText = prompt('Заметка к выделению:', '');
    if (noteText === null) return;  // отмена
    await saveEpubAnnotation('note', selectedText, cfiRange, noteText.trim());
    if (contents && contents.window) contents.window.getSelection().removeAllRanges();
  };

  // Авто-скрытие через 8 секунд
  setTimeout(hideEpubSelectionPopup, 8000);
}

function hideEpubSelectionPopup() {
  if (epubSelectionPopup) {
    epubSelectionPopup.remove();
    epubSelectionPopup = null;
  }
}

async function saveEpubAnnotation(type, text, cfiRange, noteText = '') {
  if (!state.currentBook) return;
  const bookId = state.currentBook.id;
  // position храним cfi — потом по нему восстановим выделение
  const pos = { cfi: cfiRange };
  const pageNum = epubCurrentPage || 1;

  if (type === 'highlight') {
    const created = await addHighlight(bookId, text, pageNum, pos);
    if (created) {
      applyEpubHighlight(cfiRange);
      showToast('Маркер сохранён');
    }
  } else if (type === 'note') {
    const created = await addNote(bookId, text, noteText, pageNum, pos);
    if (created) {
      applyEpubHighlight(cfiRange, true);
      showToast('Заметка сохранена');
    }
  }
}

function applyEpubHighlight(cfiRange, isNote = false) {
  // Используем встроенный механизм аннотаций epubjs
  if (!epubRendition) return;
  try {
    const color = isNote ? 'rgba(0, 212, 255, 0.35)' : 'rgba(251, 191, 36, 0.35)';
    epubRendition.annotations.highlight(
      cfiRange,
      {},
      () => {},  // onclick — пока ничего
      'epub-saved-highlight',
      { fill: color, 'fill-opacity': 1.0, 'mix-blend-mode': 'multiply' }
    );
  } catch (e) {
    console.warn('Не удалось применить highlight:', e);
  }
}

async function loadAndApplyEpubHighlights() {
  if (!state.currentBook || !epubRendition) return;
  try {
    const list = await getAnnotations(state.currentBook.id);
    list.forEach(a => {
      const cfi = a.position && a.position.cfi;
      if (cfi) applyEpubHighlight(cfi, a.type === 'note');
    });
  } catch (e) {
    console.warn('Не удалось загрузить highlights:', e);
  }
}

async function goToEpubAnnotation(bookId, cfi) {
  if (!cfi) return;
  // Открываем книгу. После того как читалка инициализируется, прыгаем к CFI.
  openReader(bookId);
  // Ждём готовности rendition и переходим к месту
  const tryGoto = () => {
    if (epubRendition) {
      try {
        epubRendition.display(cfi);
      } catch (e) {
        console.warn('Не удалось перейти к CFI:', e);
      }
    } else {
      setTimeout(tryGoto, 200);
    }
  };
  setTimeout(tryGoto, 800);  // даём время на загрузку EPUB
}

function initReaderGestures() {
  const zone = document.getElementById('readerGestureZone');
  if (!zone) return;

  zone.removeEventListener('touchstart', handleTouchStart);
  zone.removeEventListener('touchend', handleTouchEnd);
  zone.removeEventListener('touchmove', handleTouchMove);

  zone.addEventListener('touchstart', handleTouchStart, { passive: true });
  zone.addEventListener('touchend', handleTouchEnd, { passive: true });
  zone.addEventListener('touchmove', handleTouchMove, { passive: true });

  const tapLeft = document.getElementById('tapZoneLeft');
  const tapRight = document.getElementById('tapZoneRight');
  if (tapLeft) tapLeft.onclick = () => goToPrevPage();
  if (tapRight) tapRight.onclick = () => goToNextPage();

  const arrowLeft = document.getElementById('readerArrowLeft');
  const arrowRight = document.getElementById('readerArrowRight');
  if (arrowLeft) arrowLeft.onclick = () => goToPrevPage();
  if (arrowRight) arrowRight.onclick = () => goToNextPage();
}

function handleTouchStart(e) {
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
}

function handleTouchMove(e) {
  touchEndX = e.changedTouches[0].screenX;
  touchEndY = e.changedTouches[0].screenY;
}

function handleTouchEnd() {
  const diffX = touchStartX - touchEndX;
  const diffY = Math.abs(touchStartY - touchEndY);

  if (Math.abs(diffX) > SWIPE_THRESHOLD && diffY < SWIPE_RESTRAINT) {
    if (diffX > 0) {
      goToNextPage();
    } else {
      goToPrevPage();
    }
  }
}

function goToNextPage() {
  const current = isEpubMode ? epubCurrentPage : pdfCurrentPage;
  const total = isEpubMode ? epubTotalPages : pdfTotalPages;
  if (current < total) {
    goToPage(current + 1);
  }
}

function goToPrevPage() {
  const current = isEpubMode ? epubCurrentPage : pdfCurrentPage;
  if (current > 1) {
    goToPage(current - 1);
  }
}

let pageIndicatorTimeout = null;
function flashPageIndicator() {
  const indicator = document.getElementById('pageIndicatorOverlay');
  if (!indicator) return;
  indicator.classList.remove('hidden-indicator');
  if (pageIndicatorTimeout) clearTimeout(pageIndicatorTimeout);
  pageIndicatorTimeout = setTimeout(() => {
    indicator.classList.add('hidden-indicator');
  }, 2000);
}

function updatePageIndicator() {
  const total = isEpubMode ? (epubTotalPages || 1) : pdfTotalPages;
  const current = isEpubMode ? (epubCurrentPage || 1) : pdfCurrentPage;

  const topIndicator = document.getElementById('pageIndicatorTop');
  if (topIndicator) topIndicator.textContent = `${current} / ${total}`;

  const overlayCurrent = document.getElementById('pageCurrent');
  const overlayTotal = document.getElementById('pageTotal');
  if (overlayCurrent) overlayCurrent.textContent = current;
  if (overlayTotal) overlayTotal.textContent = total;

  flashPageIndicator();
}

function goToPage(pn) {
  const total = isEpubMode ? (epubTotalPages || 1) : pdfTotalPages;
  const target = Math.max(1, Math.min(pn, total));

  if (isEpubMode) {
    epubCurrentPage = target;
    if (epubRendition) epubRendition.display(target - 1);
  } else {
    pdfCurrentPage = target;
  }

  if (state.currentBook) {
    state.readingProgress[state.currentBook.id].currentPage = target;
    scheduleProgressSave(state.currentBook.id);
  }
  updatePageIndicator();
  renderAnnotations();
  if (!isEpubMode && pdfDoc) renderPdfPage(target);
  else if (!isEpubMode) generateDemoPdf(state.currentBook);
}

function updateSlider() {
  updatePageIndicator();
}

// ========== EPUB READER ==========
async function loadEpub(b) {
  isEpubMode = true;
  document.getElementById('pdfViewport').classList.add('hidden');
  document.getElementById('epubViewport').classList.remove('hidden');
  document.getElementById('annotationLayer').innerHTML = '';

  const container = document.getElementById('epubContainer');
  container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">Загрузка EPUB...</div>';

  try {
    let epubData = null;
    let fromOffline = false;

    // 1. Сначала пробуем IndexedDB
    if (offlineBookIds.has(b.id)) {
      try {
        const blob = await offlineStorage.getFile(b.id, 'epub');
        if (blob) {
          epubData = await blob.arrayBuffer();
          fromOffline = true;
        }
      } catch (e) {
        console.warn('Не удалось прочитать EPUB из IndexedDB:', e);
      }
    }

    // 2. Если в IndexedDB нет — пробуем API
    if (!epubData) {
      if (!b.has_file) {
        showToast('EPUB-файл не найден');
        closeReader();
        return;
      }
      try {
        const resp = await api.request('/books/' + b.id + '/pdf', { raw: true });
        epubData = await resp.arrayBuffer();
      } catch (err) {
        showToast('Нет связи. Сохраните книгу оффлайн заранее.');
        closeReader();
        return;
      }
    }

    // 3. Рендерим EPUB
    epubBook = ePub(epubData);
    epubRendition = epubBook.renderTo(container, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
    });

    const location = await epubBook.locations.generate(1000);
    epubRendition.display();

    epubTotalPages = location.total || 1;
    epubCurrentPage = Math.min(state.readingProgress[b.id]?.currentPage || 1, epubTotalPages);

    if (!state.readingProgress[b.id]) {
      state.readingProgress[b.id] = { currentPage: 1, totalPages: epubTotalPages, started: false };
    } else {
      state.readingProgress[b.id].totalPages = epubTotalPages;
    }

    updatePageIndicator();
    container.innerHTML = '';
    epubRendition.display(epubCurrentPage - 1);

    epubRendition.on('relocated', (loc) => {
      const current = epubBook.locations.locationFromCfi(loc.start);
      if (current !== null && current !== undefined) {
        epubCurrentPage = current + 1;
        if (state.currentBook) {
          state.readingProgress[state.currentBook.id].currentPage = epubCurrentPage;
          scheduleProgressSave(state.currentBook.id);
        }
        updatePageIndicator();
      }
    });
// === Выделение текста в EPUB ===
    epubRendition.on('selected', (cfiRange, contents) => {
      handleEpubSelection(cfiRange, contents);
    });

    // Подгружаем уже сохранённые highlights и рендерим их поверх текста
    await loadAndApplyEpubHighlights();

    saveState();
    if (fromOffline) showToast('Читаем из оффлайн-хранилища');
  } catch (err) {
    console.error('Ошибка загрузки EPUB:', err);
    showToast('Не удалось загрузить EPUB');
    closeReader();
  }
}

// ========== PDF READER ==========
async function loadPdf(b) {
  isEpubMode = false;
  document.getElementById('epubViewport').classList.add('hidden');
  document.getElementById('pdfViewport').classList.remove('hidden');

  const c = document.getElementById('pdfCanvas');
  const pl = document.getElementById('pdfPlaceholder');

  pl.classList.remove('hidden');
  pl.innerHTML = 'Загрузка PDF...';
  c.classList.add('hidden');

  // Сначала пробуем IndexedDB
  let bytes = null;
  let fromOffline = false;
  if (offlineBookIds.has(b.id)) {
    try {
      const blob = await offlineStorage.getFile(b.id, 'pdf');
      if (blob) {
        bytes = await blob.arrayBuffer();
        fromOffline = true;
      }
    } catch (e) {
      console.warn('Не удалось прочитать PDF из IndexedDB:', e);
    }
  }

  // Если в IndexedDB нет — тянем с API
  if (!bytes) {
    if (!b.has_file) {
      pl.classList.remove('hidden');
      c.classList.add('hidden');
      generateDemoPdf(b);
      return;
    }
    try {
      bytes = await api.books.fetchPdfBytes(b.id);
    } catch (err) {
      console.error('Ошибка загрузки PDF с API:', err);
      showToast('Не удалось загрузить PDF файл');
      generateDemoPdf(b);
      return;
    }
  }

  // Рендерим PDF
  try {
    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    pdfDoc = await loadingTask.promise;

    pdfTotalPages = pdfDoc.numPages;
    if (!state.readingProgress[b.id]) {
      state.readingProgress[b.id] = { currentPage: 1, totalPages: pdfTotalPages, started: false };
    } else {
      state.readingProgress[b.id].totalPages = pdfTotalPages;
    }
    pdfCurrentPage = Math.min(state.readingProgress[b.id].currentPage || 1, pdfTotalPages);

    pl.classList.add('hidden');
    c.classList.remove('hidden');
    updatePageIndicator();
    
    // Ждём, пока canvas станет видимым
    setTimeout(async () => {
      await renderPdfPage(pdfCurrentPage);
    }, 100);
    
    if (fromOffline) showToast('Читаем из оффлайн-хранилища');
  } catch (err) {
    console.error('Ошибка рендеринга PDF:', err);
    showToast('Ошибка: ' + err.message);
    generateDemoPdf(b);
  }
}

function generateDemoPdf(b) {
  pdfTotalPages = state.readingProgress[b.id]?.totalPages || 10;
  pdfCurrentPage = Math.min(state.readingProgress[b.id]?.currentPage || 1, pdfTotalPages);
  updatePageIndicator();
  document.getElementById('pdfPlaceholder').innerHTML = `<div style="font-size:48px;">${ICONS.bookCover}</div><p>${eh(b.title)}</p><p>Стр.${pdfCurrentPage}/${pdfTotalPages}</p>`;
  renderAnnotations();
}

async function renderPdfPage(pn) {
  if (!pdfDoc) return;

  const page = await pdfDoc.getPage(pn);
  const viewport1 = page.getViewport({ scale: 1 });

  const container = document.getElementById('pdfViewport');
  if (!container) return;

  const containerWidth = container.clientWidth;
  const isMobile = window.innerWidth < 700;
  const targetWidth = isMobile ? containerWidth : Math.min(containerWidth, 900);

  const dpr = window.devicePixelRatio || 1;
  const scale = targetWidth / viewport1.width;
  const viewport = page.getViewport({ scale });

  // Рендерим canvas
  const canvas = document.getElementById('pdfCanvas');
  canvas.width = viewport.width * dpr;
  canvas.height = viewport.height * dpr;
  canvas.style.width = targetWidth + 'px';
  canvas.style.height = 'auto';
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  await page.render({
    canvasContext: ctx,
    viewport: viewport,
  }).promise;

  // Text layer для выделения (правильный API для PDF.js 3.x)
  const textLayerDiv = document.getElementById('pdfTextLayer');
  if (textLayerDiv) {
    textLayerDiv.innerHTML = '';
    textLayerDiv.style.position = 'absolute';
    textLayerDiv.style.top = canvas.offsetTop + 'px';
    textLayerDiv.style.left = canvas.offsetLeft + 'px';
    textLayerDiv.style.width = targetWidth + 'px';
    textLayerDiv.style.height = viewport.height + 'px';
    textLayerDiv.style.pointerEvents = 'auto';
    
    try {
      const textContent = await page.getTextContent();
      // Используем правильный API
      pdfjsLib.renderTextLayer({
        textContent: textContent,
        container: textLayerDiv,
        viewport: viewport,
        textDivs: [],
      });
    } catch (e) {
      console.warn('Text layer error:', e);
      // Не показываем ошибку пользователю - PDF всё равно работает
    }
  }

  // Восстанавливаем аннотации
  if (typeof renderAnnotations === 'function') {
    await renderAnnotations();
  }
}

function closeReader() {
  hideEpubSelectionPopup();
  document.querySelectorAll('.note-tooltip').forEach(e => e.remove());
  document.getElementById('selectionToolbar').style.display = 'none';
  if (state.currentBook) state.readingProgress[currentBookId].currentPage = isEpubMode ? epubCurrentPage : pdfCurrentPage;
  flushPendingProgress();
  isEpubMode = false;
  epubRendition = null;
  epubBook = null;

  const zone = document.getElementById('readerGestureZone');
  if (zone) {
    zone.removeEventListener('touchstart', handleTouchStart);
    zone.removeEventListener('touchend', handleTouchEnd);
    zone.removeEventListener('touchmove', handleTouchMove);
  }

  navigateTo('home');
}

// ========== TEXT SELECTION ==========
document.addEventListener('mouseup', function (e) {
  if (state.currentScreen !== 'reader' || isEpubMode) return;
  
  // Игнорируем клики по кнопкам тулбара
  if (e.target.closest('.selection-toolbar')) return;
  
  const s = window.getSelection();
  const selectedText = s.toString().trim();
  
  if (selectedText && selectedText.length > 0) {
    lastSelection = { text: selectedText, range: s.getRangeAt(0) };
    
    const toolbar = document.getElementById('selectionToolbar');
    const r = s.getRangeAt(0).getBoundingClientRect();
    const v = document.getElementById('pdfViewport').getBoundingClientRect();
    
    toolbar.style.display = 'flex';
    toolbar.style.left = Math.min(Math.max(r.left - v.left + r.width / 2 - 70, 10), v.width - 150) + 'px';
    toolbar.style.top = Math.max(r.top - v.top - 45, 5) + 'px';
  } else {
    // Скрываем тулбар через небольшую задержку
    setTimeout(() => {
      if (!document.querySelector('.note-tooltip:hover') && 
          !document.querySelector('.selection-toolbar:hover')) {
        document.getElementById('selectionToolbar').style.display = 'none';
        lastSelection = null;
      }
    }, 200);
  }
});

function highlightSelection() {
  if (!lastSelection || !currentBookId || isEpubMode) return;
  const v = document.getElementById('pdfViewport');
  const vr = v.getBoundingClientRect();
  const r = lastSelection.range.getBoundingClientRect();
  addHighlight(currentBookId, lastSelection.text, pdfCurrentPage, {
    x: (r.left - vr.left) / v.scrollWidth * 100,
    y: (r.top - vr.top) / v.scrollHeight * 100,
    w: r.width / v.scrollWidth * 100,
    h: r.height / v.scrollHeight * 100,
  });
  document.getElementById('selectionToolbar').style.display = 'none';
  window.getSelection().removeAllRanges();
  showToast('Выделено!');
}

function addNoteToSelection() {
  if (!lastSelection || !currentBookId || isEpubMode) return;
  const n = prompt('Заметка:', '');
  if (!n?.trim()) return;
  const v = document.getElementById('pdfViewport');
  const vr = v.getBoundingClientRect();
  const r = lastSelection.range.getBoundingClientRect();
  addNote(currentBookId, lastSelection.text, n.trim(), pdfCurrentPage, {
    x: (r.left - vr.left) / v.scrollWidth * 100,
    y: (r.top - vr.top) / v.scrollHeight * 100,
    w: r.width / v.scrollWidth * 100,
    h: r.height / v.scrollHeight * 100,
  });
  document.getElementById('selectionToolbar').style.display = 'none';
  window.getSelection().removeAllRanges();
  showToast('Заметка!');
}

// ========== ADD BOOK MODAL ==========
async function openAddModal() {
  document.getElementById('newTitle').value = '';
  document.getElementById('newAuthor').value = '';
  document.getElementById('newCover').value = '';
  document.getElementById('newBookFile').value = '';
  const descEl = document.getElementById('newDescription');
  if (descEl) descEl.value = '';

  initCategoryTags('newCategoriesContainer', []);
  document.getElementById('addModal').classList.remove('hidden');
}

function detectFileFormat(file) {
  if (!file) return 'pdf';
  const name = file.name.toLowerCase();
  if (name.endsWith('.epub')) return 'epub';
  return 'pdf';
}

async function populateNewCategoriesSelect() {
  const sel = document.getElementById('newCategorySelect');
  let categories = [];
  try {
    categories = await api.books.categories();
  } catch (e) {
    categories = [];
  }
  sel.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');
  sel.value = []; // снимаем все выделения
}

// Функция для добавления новой категории в модалке добавления книги
function addNewCategoryToAddModal() {
  const input = document.getElementById('newCategoryNew');
  const newCat = input.value.trim();
  
  if (!newCat) {
    showToast('Введите название категории');
    return;
  }
  
  if (newCat.length > 64) {
    showToast('Категория: максимум 64 символа');
    return;
  }
  
  const select = document.getElementById('newCategorySelect');
  
  // Проверяем, нет ли уже такой категории
  const exists = Array.from(select.options).some(opt => opt.value.toLowerCase() === newCat.toLowerCase());
  if (exists) {
    showToast('Такая категория уже существует');
    input.value = '';
    return;
  }
  
  // Добавляем новую опцию
  const option = document.createElement('option');
  option.value = newCat;
  option.textContent = newCat;
  select.appendChild(option);
  
  // Выделяем новую категорию
  option.selected = true;
  
  // Очищаем поле
  input.value = '';
  
  showToast(`Категория "${newCat}" добавлена`);
}

function onNewCategoryChange(value) {
  const newInput = document.getElementById('newCategoryNew');
  newInput.style.display = value === '__new__' ? 'block' : 'none';
  if (value === '__new__') newInput.focus();
}

function closeAddModal() {
  document.getElementById('addModal').classList.add('hidden');
}

// ========== ADMIN BOOK MODAL ==========
let adminBookModalCurrentId = null;

async function openAdminBookModal(bookId) {
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    return showToast('Нужны права администратора');
  }
  adminBookModalCurrentId = bookId;

  let book;
  try {
    book = await api.books.get(bookId);
  } catch (err) {
    return showToast('Не удалось загрузить книгу');
  }

  document.getElementById('adminEditTitle').value = book.title || '';
  document.getElementById('adminEditAuthor').value = book.author || '';
  document.getElementById('adminEditDescription').value = book.description || '';
  document.getElementById('adminEditIcon').value = book.icon || ICONS.bookCover;

initCategoryTags('adminCategoriesContainer', book.categories || []);

  const format = book.file_format || (book.has_epub ? 'epub' : 'pdf');
  document.getElementById('adminFileStatus').textContent = (book.has_pdf || book.has_epub)
    ? `Файл загружен (${format.toUpperCase()})`
    : '— Файл ещё не загружен';
  document.getElementById('adminCoverStatus').textContent = book.has_cover
    ? 'Обложка загружена'
    : '— Обложка ещё не загружена';

  document.getElementById('adminBookFileInput').value = '';
  document.getElementById('adminCoverFile').value = '';

  document.getElementById('adminBookModal').classList.remove('hidden');
}

function closeAdminBookModal() {
  document.getElementById('adminBookModal').classList.add('hidden');
  adminBookModalCurrentId = null;
}
// ========== КОМПОНЕНТ ТЭГОВ КАТЕГОРИЙ ==========

const categoryTagsInstances = {};

function initCategoryTags(containerId, initialTags = []) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <input type="text" class="cat-tag-input" placeholder="Введи категорию и нажми Enter…" autocomplete="off">
    <div class="cat-tag-suggestions"></div>
  `;

  const input = container.querySelector('.cat-tag-input');
  const suggestionsBox = container.querySelector('.cat-tag-suggestions');

  categoryTagsInstances[containerId] = {
    tags: [...initialTags],
    container,
    input,
    suggestionsBox,
    highlightedIndex: -1,
  };

  renderCategoryChips(containerId);

  input.addEventListener('input', () => {
    const value = input.value.trim();
    if (value.length === 0) {
      hideCategorySuggestions(containerId);
      return;
    }
    showCategorySuggestions(containerId, value);
  });

  input.addEventListener('keydown', (e) => {
    const inst = categoryTagsInstances[containerId];
    const items = suggestionsBox.querySelectorAll('.cat-tag-suggestion-item');

    if (e.key === 'Enter') {
      e.preventDefault();
      if (inst.highlightedIndex >= 0 && items[inst.highlightedIndex]) {
        addCategoryTag(containerId, items[inst.highlightedIndex].dataset.name);
      } else {
        const val = input.value.trim();
        if (val) addCategoryTag(containerId, val);
      }
      input.value = '';
      hideCategorySuggestions(containerId);
    } else if (e.key === 'Backspace' && input.value === '' && inst.tags.length > 0) {
      removeCategoryTag(containerId, inst.tags[inst.tags.length - 1]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length > 0) {
        inst.highlightedIndex = (inst.highlightedIndex + 1) % items.length;
        updateSuggestionHighlight(containerId);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length > 0) {
        inst.highlightedIndex = inst.highlightedIndex <= 0 ? items.length - 1 : inst.highlightedIndex - 1;
        updateSuggestionHighlight(containerId);
      }
    } else if (e.key === 'Escape') {
      hideCategorySuggestions(containerId);
    } else if (e.key === ',') {
      e.preventDefault();
      const val = input.value.trim();
      if (val) addCategoryTag(containerId, val);
      input.value = '';
      hideCategorySuggestions(containerId);
    }
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) hideCategorySuggestions(containerId);
  });

  container.addEventListener('click', (e) => {
    if (e.target === container) input.focus();
  });
}

function renderCategoryChips(containerId) {
  const inst = categoryTagsInstances[containerId];
  if (!inst) return;
  inst.container.querySelectorAll('.cat-tag-chip').forEach(c => c.remove());
  inst.tags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'cat-tag-chip';
    const safeTag = String(tag).replace(/"/g, '&quot;');
    chip.innerHTML = `${eh(tag)}<button type="button" class="cat-tag-chip-x" data-tag="${safeTag}">×</button>`;
    chip.querySelector('.cat-tag-chip-x').addEventListener('click', (e) => {
      e.stopPropagation();
      removeCategoryTag(containerId, tag);
    });
    inst.container.insertBefore(chip, inst.input);
  });
}

function addCategoryTag(containerId, name) {
  const inst = categoryTagsInstances[containerId];
  if (!inst) return;
  const clean = String(name).trim();
  if (!clean || clean.length > 64) {
    if (clean.length > 64) showToast('Категория: максимум 64 символа');
    return;
  }
  const lowerExisting = inst.tags.map(t => t.toLowerCase());
  if (lowerExisting.includes(clean.toLowerCase())) return;
  inst.tags.push(clean);
  renderCategoryChips(containerId);
}

function removeCategoryTag(containerId, name) {
  const inst = categoryTagsInstances[containerId];
  if (!inst) return;
  inst.tags = inst.tags.filter(t => t !== name);
  renderCategoryChips(containerId);
}

async function showCategorySuggestions(containerId, query) {
  const inst = categoryTagsInstances[containerId];
  if (!inst) return;
  let allCats;
  try { allCats = await api.books.categories(); }
  catch (e) { allCats = []; }
  const q = query.toLowerCase();
  const selected = new Set(inst.tags.map(t => t.toLowerCase()));
  const matching = allCats.filter(c => c.toLowerCase().includes(q) && !selected.has(c.toLowerCase()));

  let html = '';
  if (matching.length > 0) {
    html = matching.map(c =>
      `<div class="cat-tag-suggestion-item" data-name="${eh(c)}">${eh(c)}</div>`
    ).join('');
  }
  const exactMatch = allCats.some(c => c.toLowerCase() === q);
  if (!exactMatch && query.length > 0) {
    html += `<div class="cat-tag-suggestion-item" data-name="${eh(query)}" style="border-top:1px solid var(--border);font-style:italic;">+ Создать: «${eh(query)}»</div>`;
  }
  if (html === '') html = '<div class="cat-tag-suggestion-empty">Нет подходящих категорий</div>';

  inst.suggestionsBox.innerHTML = html;
  inst.suggestionsBox.classList.add('active');
  inst.highlightedIndex = -1;

  // Обработчики клика на пункты подсказок (через делегирование)
  inst.suggestionsBox.querySelectorAll('.cat-tag-suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      addCategoryTag(containerId, item.dataset.name);
      inst.input.value = '';
      inst.input.focus();
      hideCategorySuggestions(containerId);
    });
  });
}

function hideCategorySuggestions(containerId) {
  const inst = categoryTagsInstances[containerId];
  if (!inst) return;
  inst.suggestionsBox.classList.remove('active');
  inst.highlightedIndex = -1;
}

function updateSuggestionHighlight(containerId) {
  const inst = categoryTagsInstances[containerId];
  if (!inst) return;
  const items = inst.suggestionsBox.querySelectorAll('.cat-tag-suggestion-item');
  items.forEach((item, idx) => {
    item.classList.toggle('highlighted', idx === inst.highlightedIndex);
  });
}

function getCategoryTags(containerId) {
  const inst = categoryTagsInstances[containerId];
  return inst ? [...inst.tags] : [];
}
async function populateAdminCategoriesSelect(currentCategories) {
  const sel = document.getElementById('adminEditCategorySelect');
  let categories = [];
  try {
    categories = await api.books.categories();
  } catch (e) {
    categories = currentCategories || [];
  }
  
  sel.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');
  
  // Выделяем текущие категории книги
  if (currentCategories && Array.isArray(currentCategories)) {
    Array.from(sel.options).forEach(opt => {
      if (currentCategories.includes(opt.value)) {
        opt.selected = true;
      }
    });
  }
}

// Функция для добавления новой категории в админ-модалке
function addNewCategoryToAdminModal() {
  const input = document.getElementById('adminEditCategoryNew');
  const newCat = input.value.trim();
  
  if (!newCat) {
    showToast('Введите название категории');
    return;
  }
  
  if (newCat.length > 64) {
    showToast('Категория: максимум 64 символа');
    return;
  }
  
  const select = document.getElementById('adminEditCategorySelect');
  
  // Проверяем, нет ли уже такой категории
  const exists = Array.from(select.options).some(opt => opt.value.toLowerCase() === newCat.toLowerCase());
  if (exists) {
    showToast('Такая категория уже существует');
    input.value = '';
    return;
  }
  
  // Добавляем новую опцию
  const option = document.createElement('option');
  option.value = newCat;
  option.textContent = newCat;
  select.appendChild(option);
  
  // Выделяем новую категорию
  option.selected = true;
  
  // Очищаем поле
  input.value = '';
  
  showToast(`Категория "${newCat}" добавлена`);
}

function onAdminCategoryChange(value) {
  const newInput = document.getElementById('adminEditCategoryNew');
  newInput.style.display = value === '__new__' ? 'block' : 'none';
  if (value === '__new__') newInput.focus();
}

function getAdminSelectedCategories() {
  const select = document.getElementById('adminEditCategorySelect');
  const cats = getCategoryTags('newCategoriesContainer');
  
  const newCatInput = document.getElementById('adminEditCategoryNew');
  const newCat = newCatInput.value.trim();
  if (newCat) {
    const exists = Array.from(select.options).some(opt => opt.value.toLowerCase() === newCat.toLowerCase());
    if (!exists) {
      selected.push(newCat);
    }
  }
  
  if (selected.length === 0) {
    throw new Error('Выберите или введите хотя бы одну категорию');
  }
  
  return selected;
}
// ========== ADMIN MODAL HANDLERS ==========
document.getElementById('adminSaveFieldsBtn').addEventListener('click', async () => {
  if (!adminBookModalCurrentId) return;

  const title = document.getElementById('adminEditTitle').value.trim();
  const author = document.getElementById('adminEditAuthor').value.trim();
  const description = document.getElementById('adminEditDescription').value.trim();
  const icon = document.getElementById('adminEditIcon').value.trim();

  // Категории из компонента тэгов
  const cats = getCategoryTags('adminCategoriesContainer');

  if (!title || !author) return showToast('Заполните название и автора');
  if (cats.length === 0) return showToast('Добавь хотя бы одну категорию');

  for (const cat of cats) {
    if (cat.length > 64) return showToast(`Категория "${cat}": максимум 64 символа`);
  }

  const btn = document.getElementById('adminSaveFieldsBtn');
  btn.disabled = true;
  btn.textContent = 'Сохранение...';

  try {
    await api.books.update(adminBookModalCurrentId, {
      title,
      author,
      categories: cats,
      description,
      icon: icon || undefined,
    });
    await loadBooksFromApi();
    showToast('Изменения сохранены');
    if (state.currentTab === 'admin') renderAdminScreen();
  } catch (e) {
    console.error(e);
    showToast('Ошибка: ' + (e.detail || e.message));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Сохранить поля';
  }
});

document.getElementById('adminUploadFileBtn').addEventListener('click', async () => {
  if (!adminBookModalCurrentId) return;
  const file = document.getElementById('adminBookFileInput').files[0];
  if (!file) return showToast('Выберите файл книги');
  const MAX_SIZE = 150 * 1024 * 1024;
  if (file.size > MAX_SIZE) return showToast('Файл больше 150 МБ');

  const btn = document.getElementById('adminUploadFileBtn');
  btn.disabled = true;
  btn.textContent = '...';

  try {
    const format = detectFileFormat(file);
    if (format === 'epub') {
      if (typeof api.books.uploadEpub === 'function') {
        await api.books.uploadEpub(adminBookModalCurrentId, file);
      } else {
        await api.books.uploadPdf(adminBookModalCurrentId, file);
      }
    } else {
      await api.books.uploadPdf(adminBookModalCurrentId, file);
    }
    document.getElementById('adminFileStatus').textContent = `Файл загружен (${format.toUpperCase()})`;
    document.getElementById('adminBookFileInput').value = '';
    showToast('Файл загружен');
    await loadBooksFromApi();
    if (state.currentScreen === 'detail' && currentBookId === adminBookModalCurrentId) {
      state.currentBook = state.books.find(b => b.id === adminBookModalCurrentId) || state.currentBook;
      renderBookInfo();
    }
  } catch (err) {
    showToast('Ошибка загрузки: ' + (err.detail || err.message));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Загрузить';
  }
});

document.getElementById('adminDeleteFileBtn').addEventListener('click', async () => {
  if (!adminBookModalCurrentId) return;
  if (!confirm('Удалить файл книги? Файл будет удалён с сервера.')) return;
  try {
    await api.books.deletePdf(adminBookModalCurrentId);
    document.getElementById('adminFileStatus').textContent = '— Файл ещё не загружен';
    showToast('Файл удалён');
    await loadBooksFromApi();
    if (state.currentScreen === 'detail' && currentBookId === adminBookModalCurrentId) {
      state.currentBook = state.books.find(b => b.id === adminBookModalCurrentId) || state.currentBook;
      renderBookInfo();
    }
  } catch (err) {
    showToast('Ошибка: ' + (err.detail || err.message));
  }
});

document.getElementById('adminUploadCoverBtn').addEventListener('click', async () => {
  if (!adminBookModalCurrentId) return;
  const file = document.getElementById('adminCoverFile').files[0];
  if (!file) return showToast('Выберите файл обложки');
  if (file.size > 5 * 1024 * 1024) return showToast('Обложка больше 5 МБ');

  const btn = document.getElementById('adminUploadCoverBtn');
  btn.disabled = true;
  btn.textContent = '...';
  try {
    const result = await api.books.uploadCover(adminBookModalCurrentId, file);
    document.getElementById('adminCoverStatus').textContent = 'Обложка загружена';
    document.getElementById('adminCoverFile').value = '';
    showToast(result.replaced ? 'Обложка заменена' : 'Обложка загружена');
    await loadBooksFromApi();
    if (state.currentScreen === 'detail' && currentBookId === adminBookModalCurrentId) {
      state.currentBook = state.books.find(b => b.id === adminBookModalCurrentId) || state.currentBook;
      renderBookInfo();
    }
  } catch (err) {
    showToast('Ошибка загрузки: ' + (err.detail || err.message));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Загрузить';
  }
});

document.getElementById('adminDeleteCoverBtn').addEventListener('click', async () => {
  if (!adminBookModalCurrentId) return;
  if (!confirm('Удалить обложку у этой книги?')) return;
  try {
    await api.books.deleteCover(adminBookModalCurrentId);
    document.getElementById('adminCoverStatus').textContent = '— Обложка ещё не загружена';
    showToast('Обложка удалена');
    await loadBooksFromApi();
    if (state.currentScreen === 'detail' && currentBookId === adminBookModalCurrentId) {
      state.currentBook = state.books.find(b => b.id === adminBookModalCurrentId) || state.currentBook;
      renderBookInfo();
    }
  } catch (err) {
    showToast('Ошибка: ' + (err.detail || err.message));
  }
});

document.getElementById('adminDeleteBookBtn').addEventListener('click', async () => {
  if (!adminBookModalCurrentId) return;
  const book = state.books.find(b => b.id === adminBookModalCurrentId);
  const title = book ? book.title : `книгу #${adminBookModalCurrentId}`;
  if (!confirm(`Удалить «${title}» полностью? Это действие необратимо.`)) return;

  try {
    await api.books.delete(adminBookModalCurrentId);
    showToast('Книга удалена');
    closeAdminBookModal();
    await loadBooksFromApi();
    if (state.currentScreen === 'detail' && currentBookId === adminBookModalCurrentId) {
      currentBookId = null;
      state.currentBook = null;
      navigateTo('home');
    } else {
      renderHome();
    }
  } catch (err) {
    showToast('Ошибка: ' + (err.detail || err.message));
  }
});

// ========== SAVE BOOK ==========
document.getElementById('saveBookBtn').addEventListener('click', async () => {
  const t = document.getElementById('newTitle').value.trim();
  const a = document.getElementById('newAuthor').value.trim();
  const desc = document.getElementById('newDescription').value.trim();

  // Категории из нового компонента тэгов
  const cats = getCategoryTags('newCategoriesContainer');

  if (!t || !a) return showToast('Заполните название и автора');
  if (cats.length === 0) return showToast('Добавь хотя бы одну категорию');

  for (const cat of cats) {
    if (cat.length > 64) return showToast(`Категория "${cat}": максимум 64 символа`);
  }

  const coverFile = document.getElementById('newCover').files[0];
  const bookFile = document.getElementById('newBookFile').files[0];

  const MAX_FILE_MB = 150, MAX_COVER_MB = 5;
  if (bookFile && bookFile.size > MAX_FILE_MB * 1024 * 1024) return showToast(`Файл книги больше ${MAX_FILE_MB} МБ`);
  if (coverFile && coverFile.size > MAX_COVER_MB * 1024 * 1024) return showToast(`Обложка больше ${MAX_COVER_MB} МБ`);

  const btn = document.getElementById('saveBookBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Создание...';

  try {
    const format = detectFileFormat(bookFile);
    const created = await api.books.create({
      title: t,
      author: a,
      categories: cats,
      description: desc,
      icon: ICONS.bookCover,
      file_format: format,
    });
    const newId = created.id;

    if (bookFile) {
      btn.textContent = 'Загрузка файла...';
      try {
        if (format === 'epub' && typeof api.books.uploadEpub === 'function') {
          await api.books.uploadEpub(newId, bookFile);
        } else {
          await api.books.uploadPdf(newId, bookFile);
        }
      } catch (err) {
        showToast('Не удалось загрузить файл: ' + (err.detail || err.message));
      }
    }

    if (coverFile) {
      btn.textContent = 'Загрузка обложки...';
      try {
        await api.books.uploadCover(newId, coverFile);
      } catch (err) {
        showToast('Не удалось загрузить обложку: ' + (err.detail || err.message));
      }
    }

    await loadBooksFromApi();
    closeAddModal();

    // Очищаем поля формы
    document.getElementById('newTitle').value = '';
    document.getElementById('newAuthor').value = '';
    document.getElementById('newDescription').value = '';
    document.getElementById('newCover').value = '';
    document.getElementById('newBookFile').value = '';

    // Сбрасываем тэги
    if (categoryTagsInstances['newCategoriesContainer']) {
      categoryTagsInstances['newCategoriesContainer'].tags = [];
      renderCategoryChips('newCategoriesContainer');
    }

    showToast('Книга добавлена');
    if (state.currentTab === 'admin') renderAdminScreen();
  } catch (e) {
    console.error(e);
    showToast('Ошибка создания: ' + (e.detail || e.message));
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});
// ========== ONLINE/OFFLINE BANNER ==========
function ensureOfflineBanner() {
  let banner = document.getElementById('offlineBanner');
  if (banner) return banner;
  banner = document.createElement('div');
  banner.id = 'offlineBanner';
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0;
    background: linear-gradient(135deg, #f59e0b, #ec4899);
    color: #fff; text-align: center; padding: 8px 16px;
    font-size: 12px; font-weight: 600; z-index: 9999;
    box-shadow: 0 2px 12px rgba(0,0,0,0.3); display: none;
    transition: transform 0.3s; transform: translateY(-100%);
  `;
  banner.textContent = 'Нет интернета — работаете в офлайн-режиме';
  document.body.appendChild(banner);
  return banner;
}

function updateOnlineStatus() {
  const banner = ensureOfflineBanner();
  if (navigator.onLine) {
    banner.style.transform = 'translateY(-100%)';
    setTimeout(() => { banner.style.display = 'none'; }, 300);
  } else {
    banner.style.display = 'block';
    requestAnimationFrame(() => { banner.style.transform = 'translateY(0)'; });
  }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
// Проверим сразу при загрузке (на случай если стартовали без сети)
updateOnlineStatus();

// ========== TOAST ==========
function showToast(m) {
  const ex = document.querySelector('.toast');
  if (ex) ex.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = m;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.3s';
    setTimeout(() => t.remove(), 300);
  }, 2500);
}

// ========== AI PANEL ==========
function toggleAIPanel() {
  state.aiOpen = !state.aiOpen;
  document.getElementById('aiPanel').classList.toggle('show', state.aiOpen);
  document.getElementById('aiOverlay').classList.toggle('show', state.aiOpen);
}

function closeAIPanel() {
  state.aiOpen = false;
  document.getElementById('aiPanel').classList.remove('show');
  document.getElementById('aiOverlay').classList.remove('show');
  state.pendingAiAction = null;
}

function sendAIMessage() {
  const i = document.getElementById('aiInput'), t = i.value.trim();
  if (!t) return;
  addAIMsg(t, 'user');
  i.value = '';
  setTimeout(() => addAIMsg(generateAIResponse(t), 'bot'), 600);
}

function addAIMsg(t, c) {
  const ch = document.getElementById('aiChat'),
        m = document.createElement('div');
  m.className = 'ai-msg ' + c;
  m.textContent = t;
  ch.appendChild(m);
  ch.scrollTop = ch.scrollHeight;
}

function aiQuick(a) {
  document.getElementById('aiInput').value = {
    summarize: 'Опиши книгу',
    quiz: 'Тест',
    recommend: 'Что почитать?',
    progress: 'Прогресс'
  }[a] || a;
  sendAIMessage();
}

// ========== SHORTCUTS MODAL ==========
function openShortcutsModal() {
  document.getElementById('shortcutsModal').classList.add('show');
  document.getElementById('shortcutsOverlay').classList.add('show');
}

function closeShortcutsModal() {
  document.getElementById('shortcutsModal').classList.remove('show');
  document.getElementById('shortcutsOverlay').classList.remove('show');
}

// ========== COMMAND PALETTE ==========
function openCommandPalette() {
  const input = document.getElementById('searchInput');
  if (input) {
    input.focus();
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ========== ADMIN PANEL ==========
document.querySelectorAll('.admin-tab-btn').forEach(t => t.addEventListener('click', function () {
  document.querySelectorAll('.admin-tab-btn').forEach(x => x.classList.remove('active'));
  this.classList.add('active');
  document.querySelectorAll('.admin-panel-section').forEach(s => s.classList.remove('show'));
  document.getElementById('ad' + this.dataset.atab.charAt(0).toUpperCase() + this.dataset.atab.slice(1)).classList.add('show');
  renderAdminPanel();
}));

function renderAdminPanel() {
  const at = document.querySelector('.admin-tab-btn.active')?.dataset?.atab || 'dashboard';
  if (at === 'dashboard') renderDashboard();
  if (at === 'books') renderAdminBooks();
  if (at === 'users') loadAndRenderAdminUsers();
  if (at === 'reviews') loadAndRenderAdminReviews();
  if (at === 'analytics') renderAnalytics();
  if (at === 'leaderboard') loadAndRenderLeaderboard();
}

async function renderDashboard() {
  const container = document.getElementById('adDashboard');
  container.innerHTML = '<div style="padding:20px;color:var(--text-muted);font-size:12px;">Загрузка...</div>';

  try {
    const stats = await api.library.adminDashboard();
    container.innerHTML = `
      <div class="stat-cards">
        <div class="stat-card">
          <div class="stat-value">${stats.total_books}</div>
          <div class="stat-label">Книг в каталоге</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.total_users}</div>
          <div class="stat-label">Пользователей</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.total_views}</div>
          <div class="stat-label">Просмотров</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.total_downloads}</div>
          <div class="stat-label">Скачиваний</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.total_reviews}</div>
          <div class="stat-label">Отзывов</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.total_quiz_attempts}</div>
          <div class="stat-label">Попыток тестов</div>
        </div>
      </div>`;
  } catch (err) {
    console.error('Ошибка загрузки дашборда:', err);
    container.innerHTML = '<div style="padding:20px;color:#ef4444;">Не удалось загрузить статистику</div>';
  }
}

function renderAdminBooks() {
  document.getElementById('adBooks').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding:12px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;">
      <div style="font-size:12px;color:var(--text-secondary);">Всего книг:</div>
      <div style="font-size:20px;font-weight:700;color:var(--accent);font-family:'JetBrains Mono',monospace;">${state.books.length}</div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Книга</th>
            <th>Автор</th>
            <th>Категория</th>
            <th>Формат</th>
            <th>Рейтинг</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          ${state.books.map(b => `
            <tr>
              <td>${eh(b.title)}</td>
              <td>${eh(b.author)}</td>
              <td>${bookCategoriesText(b)}</td>
              <td>${(b.file_format || 'pdf').toUpperCase()}</td>
              <td>${ICONS.star}${b.rating}</td>
              <td>
                <button class="btn-sm" onclick="openBookAnalyticsModal(${b.id})" title="Аналитика">📊</button>
                <button class="btn-sm" onclick="openAdminBookModal(${b.id})">${ICONS.settings}</button>
                <button class="btn-sm danger" onclick="deleteBook(${b.id})">${ICONS.trash}</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

async function loadAndRenderAdminReviews() {
  const container = document.getElementById('adReviews');
  if (!container) return;
  container.innerHTML = '<div style="padding:20px;color:var(--text-muted);font-size:12px;">Загрузка отзывов...</div>';

  try {
    const books = state.books;
    let allReviews = [];

    for (const book of books) {
      const reviews = await getReviews(book.id);
      reviews.forEach(r => {
        allReviews.push({
          ...r,
          bookId: book.id,
          bookTitle: book.title
        });
      });
    }

    allReviews.sort((a, b) => new Date(b.date) - new Date(a.date));

    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Книга</th>
              <th>Пользователь</th>
              <th>Оценка</th>
              <th>Текст</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            ${allReviews.map(r => `
              <tr>
                <td>${eh(r.bookTitle)}</td>
                <td>${eh(r.user)}</td>
                <td>${Array(r.rating).fill(ICONS.star).join('')}</td>
                <td>${eh((r.text || '').substring(0, 50))}${r.text && r.text.length > 50 ? '...' : ''}</td>
                <td>
                  <button class="btn-sm danger" onclick="deleteReview(${r.bookId}, ${r.id}); loadAndRenderAdminReviews();">${ICONS.trash}</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    container.innerHTML = '<div style="padding:20px;color:#ef4444;">Не удалось загрузить отзывы</div>';
  }
}

async function deleteBook(id) {
  const book = state.books.find(b => b.id === id);
  const title = book ? book.title : `книгу #${id}`;
  if (!confirm(`Удалить «${title}»? Это действие необратимо.`)) return;

  try {
    await api.books.delete(id);
    await loadBooksFromApi();
    renderAdminPanel();
    renderHome();
    showToast('Книга удалена');
  } catch (err) {
    showToast('Ошибка при удалении книги');
    console.error(err);
  }
}

async function loadAndRenderAdminUsers() {
  const container = document.getElementById('adUsers');
  if (!container) return;
  container.innerHTML = '<div style="padding:20px;color:var(--text-muted);font-size:12px;">Загрузка...</div>';
  try {
    const users = await api.library.adminUsers();
    container.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding:12px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;">
      <div style="font-size:12px;color:var(--text-secondary);">Всего пользователей:</div>
      <div style="font-size:20px;font-weight:700;color:var(--accent);font-family:'JetBrains Mono',monospace;">${users.length}</div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>ID</th><th>Логин</th><th>Email</th><th>Роль</th><th>XP</th><th>Активен</th><th>Действия</th></tr></thead>
      <tbody>
        ${users.map(u => `<tr>
          <td>${u.id}</td>
          <td>${eh(u.username)}</td>
          <td>${eh(u.email || '—')}</td>
          <td>${u.role}</td>
          <td>${u.xp}</td>
          <td>${u.is_active ? ICONS.check : ICONS.x}</td>
          <td>${u.role !== 'admin'
            ? `<button class="btn-sm danger" onclick="deleteAdminUser(${u.id}, '${eh(u.username)}')">${ICONS.trash} Удалить</button>`
            : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  } catch (err) {
    container.innerHTML = '<div style="padding:20px;color:#ef4444;">Не удалось загрузить пользователей</div>';
  }
}

async function deleteAdminUser(userId, username) {
  if (!confirm(`Удалить пользователя «${username}»? Это действие необратимо.`)) return;
  try {
    await api.library.adminDeleteUser(userId);
    showToast('Пользователь удалён');
    loadAndRenderAdminUsers();
  } catch (err) {
    if (err instanceof api.ApiError) showToast('Ошибка: ' + (err.detail || err.status));
    else showToast('Сервер недоступен');
  }
}

// ========== ANALYTICS ==========
function destroyAnalyticsCharts() {
  Object.values(analyticsCharts).forEach(chart => {
    try { chart.destroy(); } catch (e) {}
  });
  analyticsCharts = {};
}

function renderAnalytics() {
  destroyAnalyticsCharts();
  populateAnalyticsBookSelector();

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push(d.toISOString().split('T')[0]);
  }
  const activityData = days.map(day => {
    return state.heatmapData?.find(d => d.date === day)?.pages || 0;
  });

  const ctx1 = document.getElementById('chartReadingActivity')?.getContext('2d');
  if (ctx1) {
    analyticsCharts.activity = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: days.map(d => new Date(d).toLocaleDateString('ru', { weekday: 'short' })),
        datasets: [{
          label: 'Страниц прочитано',
          data: activityData,
          borderColor: '#00d4ff',
          backgroundColor: 'rgba(0,212,255,0.1)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#00d4ff',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } },
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } }
        }
      }
    });
  }

  const topBooks = [...state.books].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
  const ctx2 = document.getElementById('chartTopBooks')?.getContext('2d');
  if (ctx2) {
    analyticsCharts.topBooks = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: topBooks.map(b => b.title.substring(0, 20)),
        datasets: [{
          label: 'Просмотры',
          data: topBooks.map(b => b.views || 0),
          backgroundColor: topBooks.map((_, i) => {
            const alphas = [0.8, 0.65, 0.5, 0.35, 0.2];
            return `rgba(0,212,255,${alphas[i] || 0.15})`;
          }),
          borderColor: '#00d4ff',
          borderWidth: 1,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } },
          y: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } } }
        }
      }
    });
  }

  const totalViews = state.books.reduce((s, b) => s + (b.views || 0), 0);
  const totalOpens = Object.values(state.readingProgress).filter(p => p.started).length;
  const totalReadings = Object.values(state.readingProgress).filter(p => p.started && p.currentPage > 5).length;
  const totalCompletions = Object.values(state.mylist).filter(s => s === 'completed').length;

  const ctx3 = document.getElementById('chartFunnel')?.getContext('2d');
  if (ctx3) {
    analyticsCharts.funnel = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: ['Просмотры', 'Открытия', 'Читают', 'Завершили'],
        datasets: [{
          data: [totalViews, totalOpens, totalReadings, totalCompletions],
          backgroundColor: [
            'rgba(0,212,255,0.8)',
            'rgba(0,212,255,0.6)',
            'rgba(0,212,255,0.4)',
            'rgba(34,197,94,0.6)',
          ],
          borderColor: ['#00d4ff', '#00d4ff', '#00d4ff', '#22c55e'],
          borderWidth: 1,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } },
          x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } } }
        }
      }
    });
  }

  const ctx4 = document.getElementById('chartRetention')?.getContext('2d');
  if (ctx4) {
    analyticsCharts.retention = new Chart(ctx4, {
      type: 'line',
      data: {
        labels: ['День 1', 'День 7', 'День 14', 'День 30', 'День 60', 'День 90'],
        datasets: [{
          label: 'Активные пользователи',
          data: [100, 65, 48, 35, 28, 22],
          borderColor: '#7c3aed',
          backgroundColor: 'rgba(124,58,237,0.1)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#7c3aed',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', callback: v => v + '%' } },
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } }
        }
      }
    });
  }
}

// ========== KEYBOARD SHORTCUTS ==========
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    if (state.currentScreen === 'reader') {
      closeReader();
    }
    navigateTo('home');
    setTimeout(() => openCommandPalette(), 100);
    return;
  }

  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    switch (e.key.toLowerCase()) {
      case 'h': e.preventDefault(); navigateTo('home'); return;
      case 'm': e.preventDefault(); navigateTo('mylist'); return;
      case 't': e.preventDefault(); navigateTo('training'); return;
      case 'p': e.preventDefault(); navigateTo('profile'); return;
      case 'a': e.preventDefault(); toggleAIPanel(); return;
    }
  }

  if (state.currentScreen === 'reader') {
    if (e.key === 'ArrowLeft') { e.preventDefault(); goToPrevPage(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); goToNextPage(); return; }
    if (e.key === ' ' && !e.shiftKey && document.activeElement === document.body) { e.preventDefault(); goToNextPage(); return; }
    if (e.key === ' ' && e.shiftKey) { e.preventDefault(); goToPrevPage(); return; }
    if (e.key === 'p' && !e.ctrlKey) { e.preventDefault(); togglePomodoro(); return; }
    if (e.ctrlKey && e.key === 'e') { e.preventDefault(); exportNotes(); return; }
  }
  if (e.key === 'Escape') {
    closeAIPanel();
    closeCatalogPanel();
    closeShortcutsModal();
    if (arActive) closeAR();
    document.getElementById('selectionToolbar').style.display = 'none';
    document.querySelectorAll('.note-tooltip').forEach(el => el.remove());
  }
  if (e.key === '?' && !e.ctrlKey && !e.metaKey && document.activeElement === document.body) {
    e.preventDefault();
    if (document.getElementById('shortcutsModal').classList.contains('show')) {
      closeShortcutsModal();
    } else {
      openShortcutsModal();
    }
  }
});

// ========== RESIZE HANDLER ==========
let resizeTimer = null;
window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.currentScreen === 'reader' && !isEpubMode && pdfDoc) {
      renderPdfPage(pdfCurrentPage);
    }
  }, 300);
});
loadOfflineBookIds();

// ========== ОНБОРДИНГ-ТЕСТ ==========
let onboardingState = {
  questions: [],
  topicNames: {},
  answers: {},        // {qid: index}
  currentIndex: 0,
};

// ========== ВЫБОР УРОВНЯ (новый стартовый экран онбординга) ==========

const LEVEL_CHOICES = [
  {
    code: 'gate_guardian',
    name: 'Gate Guardian',
    description: 'Я знаю, где вход, и буду стоять насмерть. Но если атака сложнее фишинга — зову старших.',
  },
  {
    code: 'scout',
    name: 'Scout',
    description: 'Я вижу дыры, которые другие не замечают. Иногда случайно ломаю свои же сервисы, но это часть обучения.',
  },
  {
    code: 'stronghold',
    name: 'Stronghold',
    description: 'Меня не возьмёшь лобовой атакой. Придётся искать уязвимость нулевого дня — а я её уже закрыл на прошлой неделе.',
  },
  {
    code: 'shadow_architect',
    name: 'Shadow Architect',
    description: 'Я не реагирую на угрозы — я проектирую среду, где атака обречена с самого начала. Хакеры даже не узнают, что их уже обманули.',
  },
  {
    code: 'abyss_warden',
    name: 'Abyss Warden',
    description: 'Я не просто защищаю — я определяю, что такое безопасность. Если я чего-то не знаю, этого ещё не существует.',
  },
];

function renderLevelChoices() {
  const container = document.getElementById('levelChoiceList');
  if (!container) return;

  const cards = LEVEL_CHOICES.map((lvl, idx) => {
    const info = getCyberLevelInfo(lvl.code);
    return `
      <button onclick="selectLevelSelf('${lvl.code}')" class="level-choice-card" style="text-align:left;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;cursor:pointer;font-family:inherit;display:flex;gap:12px;align-items:flex-start;transition:all 0.2s;">
        <div style="flex-shrink:0;width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:var(--accent);">${info.icon}</div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">${idx + 1}. ${eh(lvl.name)}</div>
          <div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">${eh(lvl.description)}</div>
        </div>
      </button>
    `;
  }).join('');

  const testCard = `
    <button onclick="startOnboardingQuiz()" class="level-choice-card level-choice-test" style="text-align:left;background:var(--accent-gradient);border:none;border-radius:12px;padding:14px;cursor:pointer;font-family:inherit;display:flex;gap:12px;align-items:flex-start;color:#fff;margin-top:6px;">
      <div style="flex-shrink:0;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">${ICONS.target}</div>
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:700;margin-bottom:4px;">6. Хочу узнать (тест)</div>
        <div style="font-size:11px;opacity:0.9;line-height:1.5;">20 вопросов по 5 темам кибербезопасности. ~7 минут.</div>
      </div>
    </button>
  `;

  container.innerHTML = cards + testCard;
}

async function selectLevelSelf(levelCode) {
  try {
    await api.onboarding.selfAssess(levelCode);
    // Обновляем currentUser
    if (state.currentUser) state.currentUser.cyber_level = levelCode;
    showToast('Уровень установлен. Можешь начинать читать!');
    closeOnboarding();
  } catch (e) {
    console.error(e);
    showToast('Не удалось сохранить уровень: ' + (e.detail || e.message));
  }
}

function startOnboardingQuiz() {
  // Скрыть welcome, показать quiz
  document.getElementById('onboardingWelcome').classList.add('hidden');
  document.getElementById('onboardingQuiz').classList.remove('hidden');
  // Сбросить состояние теста и стартовать
  startOnboarding();
}

function closeOnboarding() {
  navigateTo('home');
  // Дополнительные действия при закрытии (если нужно)
}

async function maybeShowOnboarding() {
 // Рендерим карточки выбора уровня
  renderLevelChoices();
  // Показывать только если cyber_level не определён (т.е. тест ещё не прошли)
  if (!state.currentUser) return false;
  if (state.currentUser.cyber_level) return false;
  navigateTo('onboarding');
  renderLevelChoices();
  return true;
}

function skipOnboarding() {
  // Просто переходим на главную, ничего не сохраняем
  navigateTo('home');
}

async function startOnboarding() {
  try {
    const data = await api.onboarding.getQuiz();
    onboardingState.questions = data.questions;
    onboardingState.topicNames = data.topic_names;
    onboardingState.answers = {};
    onboardingState.currentIndex = 0;
    document.getElementById('onboardingWelcome').classList.add('hidden');
    document.getElementById('onboardingQuiz').classList.remove('hidden');
    document.getElementById('onboardingTotal').textContent = data.questions.length;
    renderOnboardingQuestion();
  } catch (err) {
    console.error('Не удалось загрузить тест:', err);
    showToast('Не удалось загрузить тест');
  }
}

function renderOnboardingQuestion() {
  const q = onboardingState.questions[onboardingState.currentIndex];
  if (!q) return;
  const total = onboardingState.questions.length;
  const idx = onboardingState.currentIndex;

  document.getElementById('onboardingCurrent').textContent = idx + 1;
  document.getElementById('onboardingProgressFill').style.width = ((idx + 1) / total * 100) + '%';
  document.getElementById('onboardingTopicBadge').textContent = onboardingState.topicNames[q.topic] || q.topic;
  document.getElementById('onboardingQuestion').textContent = q.question;

  const selected = onboardingState.answers[q.id];
  document.getElementById('onboardingOptions').innerHTML = q.options.map((opt, i) => {
    const isSelected = selected === i;
    return `<button class="onboarding-option${isSelected ? ' selected' : ''}" onclick="selectOnboardingAnswer(${i})">
      <span class="onboarding-option-letter">${'ABCD'[i]}</span>
      <span>${eh(opt)}</span>
    </button>`;
  }).join('');

  // Управление кнопками
  document.getElementById('btnOnboardingPrev').disabled = (idx === 0);
  const isLast = idx === total - 1;
  const nextBtn = document.getElementById('btnOnboardingNext');
  const finishBtn = document.getElementById('btnOnboardingFinish');
  if (isLast) {
    nextBtn.classList.add('hidden');
    finishBtn.classList.remove('hidden');
  } else {
    nextBtn.classList.remove('hidden');
    finishBtn.classList.add('hidden');
  }
  // Кнопки далее/завершить активны только если есть ответ
  const hasAnswer = selected !== undefined;
  nextBtn.disabled = !hasAnswer;
  finishBtn.disabled = !hasAnswer;
}

function selectOnboardingAnswer(idx) {
  const q = onboardingState.questions[onboardingState.currentIndex];
  onboardingState.answers[q.id] = idx;
  renderOnboardingQuestion();
}

function nextOnboardingQuestion() {
  if (onboardingState.currentIndex < onboardingState.questions.length - 1) {
    onboardingState.currentIndex++;
    renderOnboardingQuestion();
  }
}

function prevOnboardingQuestion() {
  if (onboardingState.currentIndex > 0) {
    onboardingState.currentIndex--;
    renderOnboardingQuestion();
  }
}

async function finishOnboarding() {
  // Проверяем что на все вопросы есть ответы
  const total = onboardingState.questions.length;
  const answered = Object.keys(onboardingState.answers).length;
  if (answered < total) {
    showToast(`Ответьте на все вопросы (${answered}/${total})`);
    return;
  }

  const finishBtn = document.getElementById('btnOnboardingFinish');
  finishBtn.disabled = true;
  finishBtn.textContent = 'Отправка...';

  try {
    const result = await api.onboarding.submit(onboardingState.answers);
    // Обновляем currentUser
    state.currentUser.cyber_level = result.cyber_level;
    state.currentUser.topic_scores = {};
    result.topic_scores.forEach(t => { state.currentUser.topic_scores[t.topic] = t.percentage; });
    state.currentUser.level_assessed_at = result.assessed_at;

    // Показываем результат
    document.getElementById('onboardingQuiz').classList.add('hidden');
    document.getElementById('onboardingResult').classList.remove('hidden');
    renderOnboardingResult(result);
  } catch (err) {
    console.error('Ошибка отправки теста:', err);
    showToast('Не удалось отправить ответы');
    finishBtn.disabled = false;
    finishBtn.textContent = 'Завершить';
  }
}

function renderOnboardingResult(result) {
  const c = document.getElementById('onboardingResultContent');
  const info = getCyberLevelInfo(result.cyber_level);

  // Темы с цветами по силе
  const topicsHtml = result.topic_scores.map(t => {
    let cls = 'weak';
    if (t.percentage >= 70) cls = 'strong';
    else if (t.percentage >= 50) cls = 'medium';
    return `<div class="onboarding-topic-row">
      <div class="onboarding-topic-name">${eh(t.topic_name)}</div>
      <div class="onboarding-topic-bar">
        <div class="onboarding-topic-fill ${cls}" style="width:${t.percentage}%;"></div>
      </div>
      <div class="onboarding-topic-pct">${t.percentage}%</div>
    </div>`;
  }).join('');

  // Слабые темы
  const weakHtml = result.weak_topics.length > 0 ? `
    <div class="onboarding-weak-list">
      <h4 style="display:flex;align-items:center;gap:6px;">${ICONS.warningTriangle} Стоит подтянуть</h4>
      <p>${result.weak_topics.map(t => eh(result.topic_scores.find(s => s.topic === t)?.topic_name || t)).join(', ')}</p>
    </div>
  ` : '';

  c.innerHTML = `
    <div style="display:inline-flex;width:72px;height:72px;align-items:center;justify-content:center;background:var(--accent-gradient);border-radius:20px;color:#fff;margin-bottom:12px;box-shadow:var(--shadow-glow-strong);">${info.icon.replace('width="22"','width="40"').replace('height="22"','height="40"').replace('width="20"','width="40"').replace('height="20"','height="40"')}</div>
    <div class="onboarding-result-level gradient-text">${eh(result.level_name)}</div>
    <div class="onboarding-result-percentage">${result.overall_percentage}% правильных</div>
    <div class="onboarding-result-description">${eh(result.level_description)}</div>
    <div class="onboarding-topics">
      <h3>По темам</h3>
      ${topicsHtml}
    </div>
    ${weakHtml}
    <button class="btn-onboarding-finish-result" onclick="navigateTo('home')">Начать обучение</button>
  `;
}
// ========== ИНФА ОБ УРОВНЕ + МОДАЛКА «МОЙ УРОВЕНЬ» ==========
function getCyberLevelInfo(code) {
  const map = {
    gate_guardian: {
      icon: ICONS.levelGateGuardian,
      name: 'Gate Guardian',
      description: 'Я знаю, где вход, и буду стоять насмерть. Но если атака сложнее фишинга — зову старших.',
    },
    scout: {
      icon: ICONS.levelScout,
      name: 'Scout',
      description: 'Я вижу дыры, которые другие не замечают. Иногда случайно ломаю свои же сервисы, но это часть обучения.',
    },
    stronghold: {
      icon: ICONS.levelStronghold,
      name: 'Stronghold',
      description: 'Меня не возьмёшь лобовой атакой. Придётся искать уязвимость нулевого дня — а я её уже закрыл на прошлой неделе.',
    },
    shadow_architect: {
      icon: ICONS.levelShadowArchitect,
      name: 'Shadow Architect',
      description: 'Я не реагирую на угрозы — я проектирую среду, где атака обречена с самого начала. Хакеры даже не узнают, что их уже обманули.',
    },
    abyss_warden: {
      icon: ICONS.levelAbyssWarden,
      name: 'Abyss Warden',
      description: 'Я не просто защищаю — я определяю, что такое безопасность. Если я чего-то не знаю, этого ещё не существует.',
    },
  };
  return map[code] || { icon: ICONS.target, name: code, description: '' };
}

async function openCyberLevelModal() {
  // Тянем актуальный результат с бэка (на случай если данные несвежие)
  let result;
  try {
    result = await api.onboarding.getResult();
  } catch (err) {
    showToast('Не удалось загрузить результаты');
    return;
  }
  if (!result) {
    showToast('Сначала пройди тест уровня');
    return;
  }

  // Используем тот же экран результата онбординга
  navigateTo('onboarding');
  document.getElementById('onboardingWelcome').classList.add('hidden');
  document.getElementById('onboardingQuiz').classList.add('hidden');
  document.getElementById('onboardingResult').classList.remove('hidden');

  // Особенность: тут хотим кнопку «Назад в профиль» вместо «Начать обучение»,
  // и опционально — «Пройти тест заново»
  renderCyberLevelDetail(result);
}

function renderCyberLevelDetail(result) {
  const c = document.getElementById('onboardingResultContent');
  const info = getCyberLevelInfo(result.cyber_level);

  const topicsHtml = result.topic_scores.map(t => {
    let cls = 'weak';
    if (t.percentage >= 70) cls = 'strong';
    else if (t.percentage >= 50) cls = 'medium';
    return `<div class="onboarding-topic-row">
      <div class="onboarding-topic-name">${eh(t.topic_name)}</div>
      <div class="onboarding-topic-bar">
        <div class="onboarding-topic-fill ${cls}" style="width:${t.percentage}%;"></div>
      </div>
      <div class="onboarding-topic-pct">${t.percentage}%</div>
    </div>`;
  }).join('');

  const weakHtml = result.weak_topics.length > 0 ? `
    <div class="onboarding-weak-list">
      <h4 style="display:flex;align-items:center;gap:6px;">${ICONS.warningTriangle} Стоит подтянуть</h4>
      <p>${result.weak_topics.map(t => eh(result.topic_scores.find(s => s.topic === t)?.topic_name || t)).join(', ')}</p>
    </div>
  ` : '';

  const dateStr = result.assessed_at ? new Date(result.assessed_at).toLocaleDateString('ru-RU') : '';

  c.innerHTML = `
    <div style="display:inline-flex;width:72px;height:72px;align-items:center;justify-content:center;background:var(--accent-gradient);border-radius:20px;color:#fff;margin-bottom:12px;box-shadow:var(--shadow-glow-strong);">${info.icon.replace('width="22"','width="40"').replace('height="22"','height="40"').replace('width="20"','width="40"').replace('height="20"','height="40"')}</div>
    <div class="onboarding-result-level gradient-text">${eh(info.name)}</div>
    <div class="onboarding-result-percentage">${result.overall_percentage}% правильных</div>
    <div class="onboarding-result-description">${eh(info.description)}</div>
    ${dateStr ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:20px;">Тест пройден: ${dateStr}</div>` : ''}
    <div class="onboarding-topics">
      <h3>По темам</h3>
      ${topicsHtml}
    </div>
    ${weakHtml}
    <div style="display:flex;gap:10px;">
      <button class="btn-onboarding-skip" onclick="navigateTo('profile')" style="flex:1;">Назад в профиль</button>
      <button class="btn-onboarding-start" onclick="restartOnboarding()" style="flex:1;">Пройти заново</button>
    </div>
  `;
}

function restartOnboarding() {
  if (!confirm('Пройти тест заново? Текущий результат будет заменён новым после прохождения.')) return;
  // Сбрасываем UI и стартуем тест заново
  document.getElementById('onboardingResult').classList.add('hidden');
  document.getElementById('onboardingWelcome').classList.add('hidden');
  document.getElementById('onboardingQuiz').classList.remove('hidden');
  startOnboarding();
}
// ========== АДМИН: ДЕТАЛЬНАЯ АНАЛИТИКА КНИГИ ==========
async function openBookAnalyticsModal(bookId) {
  const modal = document.getElementById('bookAnalyticsModal');
  const content = document.getElementById('bookAnalyticsContent');
  content.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">Загрузка...</div>';
  modal.classList.remove('hidden');
  try {
    const data = await api.library.adminBookAnalytics(bookId);
    renderBookAnalytics(data);
  } catch (err) {
    console.error(err);
    content.innerHTML = '<div style="color:#ef4444;padding:20px;">Не удалось загрузить аналитику</div>';
  }
}

function closeBookAnalyticsModal() {
  document.getElementById('bookAnalyticsModal').classList.add('hidden');
}

function renderBookAnalytics(d) {
  const c = document.getElementById('bookAnalyticsContent');
  const basicHtml = `
    <div style="margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--border);">
      <div style="font-size:15px;font-weight:700;margin-bottom:4px;">${eh(d.title)}</div>
      <div style="font-size:11px;color:var(--text-muted);">${eh(d.author)} · ${eh((d.categories || []).join(', '))}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:18px;">
      ${statBox('Просмотры', d.views)}
      ${statBox('Скачивания', d.downloads)}
      ${statBox('Рейтинг', d.rating ? d.rating.toFixed(1) : '—')}
      ${statBox('Отзывов', d.reviews_count)}
    </div>
  `;
  const mylistHtml = `
    <div style="margin-bottom:18px;">
      <h4 style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:10px;">В списках пользователей (${d.mylist.total})</h4>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;">
        ${miniStat('Читают', d.mylist.reading, '#10b981')}
        ${miniStat('В планах', d.mylist.planned, '#3b82f6')}
        ${miniStat('Завершено', d.mylist.completed, '#a78bfa')}
        ${miniStat('Брошено', d.mylist.dropped, '#ef4444')}
        ${miniStat('Любимое', d.mylist.liked, '#f59e0b')}
      </div>
    </div>
  `;
  const progressSummaryHtml = `
    <div style="margin-bottom:14px;">
      <h4 style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:10px;">Прогресс читателей</h4>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
        ${statBox('Начали', d.readers_started)}
        ${statBox('Завершили', d.readers_completed)}
        ${statBox('Средний %', d.avg_progress_pct + '%')}
      </div>
    </div>
  `;
  let readersHtml = '';
  if (d.readers && d.readers.length > 0) {
    const top = d.readers.slice(0, 10);
    const rows = top.map(r => `
      <tr>
        <td style="padding:6px 8px;font-size:11px;">@${eh(r.username)}</td>
        <td style="padding:6px 8px;font-size:11px;text-align:center;font-family:'JetBrains Mono',monospace;">${r.current_page} / ${r.total_pages}</td>
        <td style="padding:6px 8px;font-size:11px;text-align:right;">
          <div style="display:inline-block;width:60px;height:6px;background:var(--bg-primary);border-radius:3px;overflow:hidden;vertical-align:middle;margin-right:6px;">
            <div style="height:100%;width:${r.progress_pct}%;background:var(--accent-gradient);"></div>
          </div>
          <span style="font-family:'JetBrains Mono',monospace;">${r.progress_pct}%</span>
        </td>
      </tr>
    `).join('');
    readersHtml = `
      <div style="margin-bottom:18px;">
        <h4 style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:10px;">Кто читает (${d.readers.length}${d.readers.length > 10 ? ', показаны топ-10' : ''})</h4>
        <table style="width:100%;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;overflow:hidden;">
          <thead><tr style="background:var(--bg-primary);">
            <th style="padding:6px 8px;font-size:10px;font-weight:600;text-align:left;color:var(--text-muted);">Юзер</th>
            <th style="padding:6px 8px;font-size:10px;font-weight:600;text-align:center;color:var(--text-muted);">Страница</th>
            <th style="padding:6px 8px;font-size:10px;font-weight:600;text-align:right;color:var(--text-muted);">Прогресс</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } else {
    readersHtml = `
      <div style="margin-bottom:18px;text-align:center;padding:14px;background:var(--bg-primary);border-radius:8px;color:var(--text-muted);font-size:11px;">
        Никто пока не открыл эту книгу
      </div>
    `;
  }
  const quizHtml = d.quiz_attempts > 0 ? `
    <div style="margin-bottom:18px;">
      <h4 style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:10px;">Активность по тестам</h4>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
        ${statBox('Попыток', d.quiz_attempts)}
        ${statBox('Прошли (≥60%)', d.quiz_passed)}
        ${statBox('Средний балл', d.quiz_avg_percentage + '%')}
      </div>
    </div>
  ` : `
    <div style="margin-bottom:18px;text-align:center;padding:14px;background:var(--bg-primary);border-radius:8px;color:var(--text-muted);font-size:11px;">
      Никто пока не проходил тест по этой книге
    </div>
  `;
  c.innerHTML = basicHtml + mylistHtml + progressSummaryHtml + readersHtml + quizHtml;
}

function statBox(label, value) {
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center;">
    <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px;">${eh(label)}</div>
    <div style="font-size:18px;font-weight:700;color:var(--accent);font-family:'JetBrains Mono',monospace;">${eh(String(value))}</div>
  </div>`;
}

function miniStat(label, value, color) {
  return `<div style="text-align:center;padding:8px 4px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;">
    <div style="font-size:14px;font-weight:700;color:${color};font-family:'JetBrains Mono',monospace;">${value}</div>
    <div style="font-size:9px;color:var(--text-muted);margin-top:2px;">${eh(label)}</div>
  </div>`;
}

// Заполнение селектора книг в админ-вкладке «Аналитика»
function populateAnalyticsBookSelector() {
  const sel = document.getElementById('analyticsBookSelector');
  if (!sel) return;
  sel.innerHTML = '<option value="">— выбрать книгу —</option>' +
    state.books.map(b => `<option value="${b.id}">${eh(b.title)}</option>`).join('');
}

function onAnalyticsBookSelected() {
  const sel = document.getElementById('analyticsBookSelector');
  const bookId = sel.value;
  if (!bookId) return;
  openBookAnalyticsModal(parseInt(bookId));
  sel.value = '';  // сброс, чтобы можно было открыть ту же книгу повторно
}
// ========== INIT ==========
// Заполнение SVG-иконок в HTML-шаблонах
(function fillStaticIcons() {
  const onbList = document.getElementById('onbIconList');
  const onbClock = document.getElementById('onbIconClock');
  const onbTarget = document.getElementById('onbIconTarget');
  if (onbList) onbList.innerHTML = ICONS.list;
  if (onbClock) onbClock.innerHTML = ICONS.clock;
  if (onbTarget) onbTarget.innerHTML = ICONS.target;
})();
tryAutoLogin().then(ok => {
  navigateTo(ok ? 'home' : 'auth');
});


let orientationChangeTimer = null;

window.addEventListener('resize', () => {
  if (orientationChangeTimer) clearTimeout(orientationChangeTimer);
  orientationChangeTimer = setTimeout(() => {
    // Если AR активен и показана схема Kill Chain
    if (arActive && arCurrentScheme === 'killchain') {
      const container = document.getElementById('arSchemeContainer');
      if (container && container.innerHTML) {
        // Перерендериваем схему с новой ориентацией
        const wasStageOpen = arSelectedStage !== null;
        const currentStageId = arSelectedStage;
        
        renderKillChainScheme();
        
        // Если был открыт этап, восстанавливаем его
        if (wasStageOpen && currentStageId) {
          setTimeout(() => selectKillChainStage(currentStageId), 100);
        }
      }
    }
  }, 300);
});

// Инициализация обработчиков для кнопок добавления категорий
function initCategoryButtons() {
  const addCategoryBtn = document.getElementById('addNewCategoryBtn');
  if (addCategoryBtn) {
    addCategoryBtn.onclick = function() {
      const input = document.getElementById('newCategoryNew');
      const newCat = input.value.trim();
      if (!newCat) {
        showToast('Введите название категории');
        return;
      }
      if (newCat.length > 64) {
        showToast('Категория: максимум 64 символа');
        return;
      }
      
      const select = document.getElementById('newCategorySelect');
      const exists = Array.from(select.options).some(opt => opt.value.toLowerCase() === newCat.toLowerCase());
      if (exists) {
        showToast('Такая категория уже существует');
        input.value = '';
        return;
      }
      
      const option = document.createElement('option');
      option.value = newCat;
      option.textContent = newCat;
      select.appendChild(option);
      option.selected = true;
      input.value = '';
      showToast('Категория добавлена');
    };
  }
  
  const addAdminCategoryBtn = document.getElementById('addAdminCategoryBtn');
  if (addAdminCategoryBtn) {
    addAdminCategoryBtn.onclick = function() {
      const input = document.getElementById('adminEditCategoryNew');
      const newCat = input.value.trim();
      if (!newCat) {
        showToast('Введите название категории');
        return;
      }
      if (newCat.length > 64) {
        showToast('Категория: максимум 64 символа');
        return;
      }
      
      const select = document.getElementById('adminEditCategorySelect');
      const exists = Array.from(select.options).some(opt => opt.value.toLowerCase() === newCat.toLowerCase());
      if (exists) {
        showToast('Такая категория уже существует');
        input.value = '';
        return;
      }
      
      const option = document.createElement('option');
      option.value = newCat;
      option.textContent = newCat;
      select.appendChild(option);
      option.selected = true;
      input.value = '';
      showToast('Категория добавлена');
    };
  }
}

// Вызвать после загрузки
setTimeout(initCategoryButtons, 500);

window.LEVEL_CHOICES = LEVEL_CHOICES;
window.openARSchemeMenu = openARSchemeMenu;
window.closeARSchemeMenu = closeARSchemeMenu;
window.openARWithScheme = openARWithScheme;
window.closeAR = closeAR;
window.switchARCamera = switchARCamera;
window.selectKillChainStage = selectKillChainStage;
window.closeKillChainStage = closeKillChainStage;
window.prevKillChainStage = prevKillChainStage;
window.nextKillChainStage = nextKillChainStage;
window.openBookFromAR = openBookFromAR;