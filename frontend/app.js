// ========== НАСТРОЙКА PDF.JS ==========
// Защита: если CDN с pdf.js не загрузился (ERR_TIMED_OUT/блокировка),
// не роняем весь app.js — приложение работает, недоступна только PDF-читалка.
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
} else {
  console.warn('[Aegis] pdf.js не загрузился (CDN недоступен). PDF-читалка будет недоступна, остальное приложение работает.');
}

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
  theme: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  marker: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>',
  note: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  timer: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 2h6"/><path d="M12 2v3"/></svg>',
  export: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  iconBook: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  chevronUp: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',
  chevronDown: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  closeX: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  themeSun: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  themeMoon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  settingsGear: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
  iconStar: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  iconFlame: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  iconUser: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  iconLock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  iconEye: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  iconDatabase: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
  iconPalette: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
  iconSave: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
  iconLogout: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  sparkles: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.287 1.288L3 12l5.8 1.9a2 2 0 0 1 1.288 1.287L12 21l1.9-5.8a2 2 0 0 1 1.287-1.288L21 12l-5.8-1.9a2 2 0 0 1-1.288-1.287Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
  sendArrow: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>',
  sun: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  moon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
};

// ========== ТЕМА ВСЕГО ПРИЛОЖЕНИЯ ==========
const APP_THEME_KEY = 'aegis_app_theme';

const GRID_SIZE_KEY = 'aegis_grid_size';

function getGridSize() {
  const v = parseInt(localStorage.getItem(GRID_SIZE_KEY), 10);
  return [2, 3, 4].includes(v) ? v : 2;
}

function applyGridSize(size) {
  if (![2, 3, 4].includes(size)) size = 2;
  document.documentElement.style.setProperty('--books-grid-columns', String(size));
  localStorage.setItem(GRID_SIZE_KEY, String(size));
}

// ========== ДАННЫЕ И ПАМЯТЬ ==========
const WIFI_ONLY_KEY = 'aegis_wifi_only';

function isWifiOnlyEnabled() {
  return localStorage.getItem(WIFI_ONLY_KEY) === '1';
}
function setWifiOnly(enabled) {
  localStorage.setItem(WIFI_ONLY_KEY, enabled ? '1' : '0');
}
function isOnWifi() {
  // Поддерживается не везде. Если API нет — считаем что мы на Wi-Fi (не блокируем).
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn || !conn.type) return true;
  return conn.type === 'wifi' || conn.type === 'ethernet';
}

// ===== D: Автопредзагрузка книг офлайн по Wi-Fi =====
const AUTO_PRELOAD_KEY = 'aegis_auto_preload';
function isAutoPreloadEnabled() { return localStorage.getItem(AUTO_PRELOAD_KEY) === '1'; }
function setAutoPreload(enabled) {
  localStorage.setItem(AUTO_PRELOAD_KEY, enabled ? '1' : '0');
  if (enabled) maybeAutoPreload();
}
async function maybeAutoPreload() {
  if (!isAutoPreloadEnabled()) return;
  if (!isOnWifi()) return;
  // Берём начатые книги, которых ещё нет офлайн (макс 3 за раз, чтобы не грузить много)
  const candidates = (state.books || [])
    .filter(b => b.has_file && state.readingProgress[b.id]?.started && !offlineBookIds.has(b.id))
    .slice(0, 3);
  for (const b of candidates) {
    try {
      await saveBookOffline(b.id, true);  // тихий режим
    } catch (_) {}
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

async function getStorageStats() {
  let used = 0, quota = 0;
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      used = est.usage || 0;
      quota = est.quota || 0;
    } catch (_) {}
  }

  // Размер кэша книг (Cache Storage)
  let cacheSize = 0;
  let cacheCount = 0;
  if ('caches' in window) {
    try {
      const names = await caches.keys();
      for (const name of names) {
        const cache = await caches.open(name);
        const reqs = await cache.keys();
        cacheCount += reqs.length;
        for (const req of reqs) {
          const resp = await cache.match(req);
          if (resp) {
            const blob = await resp.clone().blob();
            cacheSize += blob.size;
          }
        }
      }
    } catch (_) {}
  }

  return { used, quota, cacheSize, cacheCount };
}

async function clearAllAppCache() {
  if (!('caches' in window)) return;
  const names = await caches.keys();
  for (const name of names) {
    await caches.delete(name);
  }
}

// Применяем сетку сразу при загрузке
applyGridSize(getGridSize());

function getAppTheme() {
  return localStorage.getItem(APP_THEME_KEY) || 'dark';
}

function applyAppTheme(theme) {
  if (theme !== 'light') theme = 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(APP_THEME_KEY, theme);

  // Обновляем кнопки переключателя если они есть на странице
  const btnDark = document.getElementById('appThemeBtnDark');
  const btnLight = document.getElementById('appThemeBtnLight');
  if (btnDark && btnLight) {
    if (theme === 'dark') {
      btnDark.classList.add('active');
      btnLight.classList.remove('active');
    } else {
      btnLight.classList.add('active');
      btnDark.classList.remove('active');
    }
  }
}

function setAppTheme(theme) {
  applyAppTheme(theme);
  showToast(theme === 'light' ? 'Светлая тема' : 'Тёмная тема');
}

// Применяем тему сразу при загрузке скрипта (до рендера)
applyAppTheme(getAppTheme());

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
  return book.categories.map(c => eh(c)).join(', ');
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
  arActiveSchemeCode = AR_SCHEMES[schemeCode] ? schemeCode : 'killchain';

  const titles = {
    killchain: 'Cyber Kill Chain',
    owasp: 'OWASP Top 10',
    osi: 'Модель OSI',
    mitre: 'MITRE ATT&CK',
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
  const toggle = document.getElementById('arViewModeToggle');
  if (toggle) toggle.style.display = 'none';
  
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
      metaphor: 'Глаз / бинокль, сканирующий цифровые тени цели',
      defenseMethod: { code: 'Detect', nameRu: 'Обнаружение', color: '#3b82f6' },
      defenseTools: ['Анализ логов веб-сервера', 'WHOIS-маскировка', 'Threat Intelligence фиды', 'Обучение OPSEC'],
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
      metaphor: 'Рука, прикрепляющая взрыватель к боеголовке',
      defenseMethod: { code: 'Deny', nameRu: 'Уничтожение', color: '#8b5cf6' },
      defenseTools: ['Прямая защита невозможна — этап на стороне атакующего', 'Threat Intelligence о свежих инструментах'],
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
      metaphor: 'Летящее копьё / фишинговая стрела',
      defenseMethod: { code: 'Disrupt', nameRu: 'Блокировка', color: '#ef4444' },
      defenseTools: ['Прокси-серверы', 'Спам-фильтры', 'Песочницы для вложений', 'Запрет USB-носителей'],
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
      metaphor: 'Трескающаяся броня / проникновение вируса в код',
      defenseMethod: { code: 'Degrade', nameRu: 'Предотвращение', color: '#f59e0b' },
      defenseTools: ['Патч-менеджмент', 'Антивирус / HIPS', 'EMET', 'ASLR, DEP, whitelisting'],
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
      metaphor: 'Червь / имплант, пускающий корни в системе',
      defenseMethod: { code: 'Deceive', nameRu: 'Изоляция', color: '#06b6d4' },
      defenseTools: ['Минимальные привилегии', 'Контроль UAC', 'Проверка целостности файлов', 'Honeypot-ловушки'],
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
      metaphor: 'Кукловод с нитями / антенна, шлющая маячки наружу',
      defenseMethod: { code: 'Disrupt', nameRu: 'Обрыв связи', color: '#ef4444' },
      defenseTools: ['Блокировка IP/DNS на фаерволах', 'Deep Packet Inspection', 'NDR-анализ трафика', 'Threat hunting'],
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
      metaphor: 'Раскрытый сейф / перетекающие данные / красная кнопка тревоги',
      defenseMethod: { code: 'Contain', nameRu: 'Сдерживание', color: '#dc2626' },
      defenseTools: ['DLP-системы', 'Сегментация сети', 'Мониторинг аномалий трафика', 'Резервные копии + PAM'],
    },
  ],
};

// ===================== ДОПОЛНИТЕЛЬНЫЕ AR-СХЕМЫ =====================
// Структура этапа идентична AR_KILL_CHAIN.stages, поэтому общий рендер
// работает для всех схем без изменений.

const AR_OWASP = {
  title: 'OWASP Top 10',
  subtitle: 'Топ-10 рисков веб-приложений (2021)',
  stages: [
    { id: 1, code: 'a01', name: 'Broken Access Control', nameRu: 'Контроль доступа',
      description: 'Нарушение разграничения доступа: пользователь получает права или данные, которые ему не положены (IDOR, обход проверок, повышение привилегий).',
      attacker: ['Подмена идентификаторов (IDOR)', 'Обход проверок на клиенте', 'Force browsing к скрытым URL', 'Повышение привилегий через параметры'],
      defender: ['Запрет по умолчанию (deny by default)', 'Проверки доступа на сервере', 'RBAC/ABAC', 'Логирование отказов доступа'],
      metaphor: 'Дверь без замка: любой толкнул — и вошёл в чужую комнату',
      defenseMethod: { code: 'Deny', nameRu: 'Запрет по умолчанию', color: '#ef4444' },
      defenseTools: ['RBAC/ABAC', 'Серверные проверки', 'OWASP ASVS', 'Аудит доступа'],
      relatedCategory: 'Веб-безопасность' },
    { id: 2, code: 'a02', name: 'Cryptographic Failures', nameRu: 'Сбои криптографии',
      description: 'Слабая или отсутствующая криптография: данные передаются/хранятся открыто, используются устаревшие алгоритмы или хардкод-ключи.',
      attacker: ['Перехват трафика без TLS', 'Брутфорс слабых хешей', 'Кража ключей из кода', 'Downgrade-атаки на TLS'],
      defender: ['TLS 1.2+ везде', 'Сильные алгоритмы (AES-GCM, Argon2)', 'Хранение секретов в KMS/Vault', 'Шифрование данных «на покое»'],
      metaphor: 'Сейф с прозрачными стенками — содержимое видно всем',
      defenseMethod: { code: 'Encrypt', nameRu: 'Шифрование', color: '#3b82f6' },
      defenseTools: ['TLS/HSTS', 'Argon2/bcrypt', 'KMS/Vault', 'mozilla-observatory'],
      relatedCategory: 'Криптография' },
    { id: 3, code: 'a03', name: 'Injection', nameRu: 'Инъекции',
      description: 'Недоверенные данные попадают в интерпретатор как часть команды: SQL, NoSQL, OS-command, LDAP. Включает XSS.',
      attacker: ['SQL/NoSQL-инъекции', 'OS command injection', 'XSS через незаэкранированный вывод', 'LDAP/XPath-инъекции'],
      defender: ['Параметризованные запросы', 'Экранирование вывода', 'Валидация по белому списку', 'ORM и подготовленные выражения'],
      metaphor: 'Записка с приказом, подсунутая в стопку доверенных команд',
      defenseMethod: { code: 'Validate', nameRu: 'Валидация ввода', color: '#10b981' },
      defenseTools: ['Prepared statements', 'CSP', 'WAF', 'Линтеры безопасности'],
      relatedCategory: 'Веб-безопасность' },
    { id: 4, code: 'a04', name: 'Insecure Design', nameRu: 'Небезопасный дизайн',
      description: 'Изъяны заложены в архитектуре: отсутствие моделирования угроз, небезопасные паттерны, нет лимитов и контролей бизнес-логики.',
      attacker: ['Эксплуатация логики бизнес-процессов', 'Обход недостающих лимитов', 'Злоупотребление сценариями восстановления'],
      defender: ['Threat modeling на этапе дизайна', 'Secure design patterns', 'Лимиты и rate-limit', 'Разбор злоупотреблений (abuse cases)'],
      metaphor: 'Кривой фундамент: стены ровные, но дом всё равно падает',
      defenseMethod: { code: 'Design', nameRu: 'Безопасный дизайн', color: '#a855f7' },
      defenseTools: ['STRIDE', 'OWASP ASVS', 'Abuse cases', 'Security requirements'],
      relatedCategory: 'Разработка безопасного ПО (AppSec)' },
    { id: 5, code: 'a05', name: 'Security Misconfiguration', nameRu: 'Ошибки конфигурации',
      description: 'Дефолтные настройки, лишние сервисы, подробные ошибки, открытые облачные хранилища, отсутствие заголовков безопасности.',
      attacker: ['Дефолтные учётки', 'Открытые S3-бакеты', 'Подробные стек-трейсы', 'Лишние включённые сервисы'],
      defender: ['Hardening и baseline', 'Минимизация поверхности', 'Заголовки безопасности', 'Автопроверка конфигураций'],
      metaphor: 'Новоселье с дверью на дефолтном пароле «admin/admin»',
      defenseMethod: { code: 'Harden', nameRu: 'Усиление', color: '#f59e0b' },
      defenseTools: ['CIS Benchmarks', 'IaC-сканеры', 'Security headers', 'Config management'],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)' },
    { id: 6, code: 'a06', name: 'Vulnerable Components', nameRu: 'Уязвимые компоненты',
      description: 'Использование библиотек/фреймворков с известными уязвимостями, без отслеживания версий и патчей.',
      attacker: ['Эксплойты известных CVE', 'Атаки на цепочку поставок', 'Устаревшие зависимости'],
      defender: ['SCA/SBOM', 'Регулярные обновления', 'Мониторинг CVE', 'Минимизация зависимостей'],
      metaphor: 'Цепь из ржавых звеньев — рвётся на самом слабом',
      defenseMethod: { code: 'Patch', nameRu: 'Обновления', color: '#3b82f6' },
      defenseTools: ['Dependabot', 'OWASP Dependency-Check', 'SBOM', 'Snyk'],
      relatedCategory: 'Разработка безопасного ПО (AppSec)' },
    { id: 7, code: 'a07', name: 'Identification & Auth Failures', nameRu: 'Сбои аутентификации',
      description: 'Слабая аутентификация: предсказуемые сессии, отсутствие MFA, перебор паролей, небезопасное восстановление доступа.',
      attacker: ['Credential stuffing', 'Брутфорс паролей', 'Перехват/фиксация сессии', 'Обход восстановления пароля'],
      defender: ['MFA', 'Защита от перебора', 'Безопасные сессии', 'Политики паролей и блокировок'],
      metaphor: 'Охранник, верящий любому, кто назвал чужое имя',
      defenseMethod: { code: 'Authn', nameRu: 'Аутентификация', color: '#10b981' },
      defenseTools: ['MFA/FIDO2', 'Rate limiting', 'Secure cookies', 'Password managers'],
      relatedCategory: 'Криптография' },
    { id: 8, code: 'a08', name: 'Software & Data Integrity', nameRu: 'Целостность данных',
      description: 'Доверие коду/данным без проверки целостности: небезопасные обновления, десериализация, скомпрометированный CI/CD.',
      attacker: ['Подмена обновлений', 'Insecure deserialization', 'Атака на CI/CD-пайплайн'],
      defender: ['Цифровые подписи артефактов', 'Проверка целостности', 'Защита пайплайна', 'Безопасная десериализация'],
      metaphor: 'Посылка без пломбы: неизвестно, кто её вскрывал',
      defenseMethod: { code: 'Verify', nameRu: 'Проверка целостности', color: '#a855f7' },
      defenseTools: ['Sigstore/подписи', 'SLSA', 'Subresource Integrity', 'Защита CI/CD'],
      relatedCategory: 'Разработка безопасного ПО (AppSec)' },
    { id: 9, code: 'a09', name: 'Logging & Monitoring Failures', nameRu: 'Сбои логирования',
      description: 'Недостаточное логирование и мониторинг: атаки остаются незамеченными, нет алертов и реагирования.',
      attacker: ['Действия без следов в логах', 'Удаление/подмена логов', 'Медленные атаки под радаром'],
      defender: ['Централизованные логи (SIEM)', 'Алерты на аномалии', 'Защита целостности логов', 'План реагирования'],
      metaphor: 'Камеры есть, но никто не смотрит на мониторы',
      defenseMethod: { code: 'Detect', nameRu: 'Обнаружение', color: '#3b82f6' },
      defenseTools: ['SIEM', 'Аудит-логи', 'Алертинг', 'IR-плейбуки'],
      relatedCategory: 'Цифровая криминалистика и реагирование на инциденты (DFIR)' },
    { id: 10, code: 'a10', name: 'SSRF', nameRu: 'SSRF',
      description: 'Server-Side Request Forgery: сервер по запросу злоумышленника обращается к внутренним ресурсам или облачным метаданным.',
      attacker: ['Доступ к internal-сервисам', 'Чтение облачных метаданных (169.254.169.254)', 'Сканирование внутренней сети'],
      defender: ['Белый список адресов', 'Запрет приватных диапазонов', 'Сегментация', 'Защита метаданных (IMDSv2)'],
      metaphor: 'Курьер, которого обманом отправили во внутренний сейф компании',
      defenseMethod: { code: 'Isolate', nameRu: 'Изоляция', color: '#f59e0b' },
      defenseTools: ['Allowlist URL', 'Egress firewall', 'IMDSv2', 'Сегментация сети'],
      relatedCategory: 'Веб-безопасность' },
  ],
};

const AR_OSI = {
  title: 'Модель OSI',
  subtitle: '7 уровней сетевого взаимодействия',
  stages: [
    { id: 1, code: 'l1', name: 'Physical', nameRu: 'Физический',
      description: 'Передача битов по физической среде: кабели, радио, оптика, разъёмы, напряжения.',
      attacker: ['Прослушка кабеля (tapping)', 'Глушение радиосигнала', 'Физический доступ к портам'],
      defender: ['Контроль доступа в помещения', 'Экранирование и опломбирование', 'Отключение неиспользуемых портов'],
      metaphor: 'Дорога и провода, по которым едут сигналы',
      defenseMethod: { code: 'Phys', nameRu: 'Физическая защита', color: '#64748b' },
      defenseTools: ['Port security', 'СКУД', 'Опломбирование', 'TEMPEST-экранирование'],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)' },
    { id: 2, code: 'l2', name: 'Data Link', nameRu: 'Канальный',
      description: 'Кадры между узлами в пределах сегмента: MAC-адреса, коммутация, обнаружение ошибок.',
      attacker: ['ARP-spoofing', 'MAC-flooding', 'VLAN hopping'],
      defender: ['Dynamic ARP Inspection', 'Port security', 'Разделение VLAN', '802.1X'],
      metaphor: 'Почтальон, разносящий письма соседям по дому',
      defenseMethod: { code: 'L2', nameRu: 'Защита канала', color: '#3b82f6' },
      defenseTools: ['DAI', '802.1X', 'Port security', 'BPDU Guard'],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)' },
    { id: 3, code: 'l3', name: 'Network', nameRu: 'Сетевой',
      description: 'Маршрутизация пакетов между сетями: IP-адресация, выбор пути.',
      attacker: ['IP-spoofing', 'Атаки на маршрутизацию', 'ICMP-туннели'],
      defender: ['Фильтрация (ACL)', 'Anti-spoofing (uRPF)', 'Сегментация подсетей'],
      metaphor: 'Навигатор, прокладывающий маршрут между городами',
      defenseMethod: { code: 'L3', nameRu: 'Маршрутизация', color: '#10b981' },
      defenseTools: ['Firewall/ACL', 'uRPF', 'IPsec', 'Сегментация'],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)' },
    { id: 4, code: 'l4', name: 'Transport', nameRu: 'Транспортный',
      description: 'Надёжная доставка между процессами: TCP/UDP, порты, контроль потока.',
      attacker: ['SYN-flood', 'Сканирование портов', 'Перехват сессии (TCP hijacking)'],
      defender: ['SYN cookies', 'Rate limiting', 'TLS поверх TCP', 'Мониторинг соединений'],
      metaphor: 'Служба доставки с трек-номером и подтверждением получения',
      defenseMethod: { code: 'L4', nameRu: 'Транспорт', color: '#a855f7' },
      defenseTools: ['SYN cookies', 'Anti-DDoS', 'TLS', 'Stateful firewall'],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)' },
    { id: 5, code: 'l5', name: 'Session', nameRu: 'Сеансовый',
      description: 'Установка, поддержание и завершение сеансов между приложениями.',
      attacker: ['Session hijacking', 'Session fixation', 'Replay-атаки'],
      defender: ['Безопасные токены сессии', 'Тайм-ауты', 'Привязка к контексту', 'Anti-replay'],
      metaphor: 'Телефонный разговор: дозвон, беседа, корректное завершение',
      defenseMethod: { code: 'L5', nameRu: 'Сеансы', color: '#3b82f6' },
      defenseTools: ['Secure cookies', 'Session timeout', 'Nonce/anti-replay'],
      relatedCategory: 'Веб-безопасность' },
    { id: 6, code: 'l6', name: 'Presentation', nameRu: 'Представления',
      description: 'Кодирование, сжатие и шифрование данных: форматы, сериализация, TLS.',
      attacker: ['Атаки на TLS (downgrade)', 'Небезопасная десериализация', 'Подмена кодировок'],
      defender: ['Современные TLS-наборы', 'Безопасные форматы', 'Валидация сериализации'],
      metaphor: 'Переводчик, приводящий речь к понятному обеим сторонам виду',
      defenseMethod: { code: 'L6', nameRu: 'Представление', color: '#10b981' },
      defenseTools: ['TLS 1.3', 'Безопасная сериализация', 'Canonicalization'],
      relatedCategory: 'Криптография' },
    { id: 7, code: 'l7', name: 'Application', nameRu: 'Прикладной',
      description: 'Взаимодействие с приложением: HTTP, DNS, SMTP. Самый частый уровень атак.',
      attacker: ['Веб-атаки (OWASP Top 10)', 'DNS-спуфинг', 'Атаки на API'],
      defender: ['WAF', 'Валидация ввода', 'Аутентификация и авторизация', 'API-gateway'],
      metaphor: 'Витрина магазина, с которой общается покупатель',
      defenseMethod: { code: 'L7', nameRu: 'Приложение', color: '#f59e0b' },
      defenseTools: ['WAF', 'API Gateway', 'CSP', 'DNSSEC'],
      relatedCategory: 'Веб-безопасность' },
  ],
};

const AR_MITRE = {
  title: 'MITRE ATT&CK',
  subtitle: 'Тактики жизненного цикла атаки (Enterprise)',
  stages: [
    { id: 1, code: 'ta0043', name: 'Reconnaissance', nameRu: 'Разведка',
      description: 'Сбор информации для планирования атаки: цели, инфраструктура, сотрудники.',
      attacker: ['Active/passive scanning', 'Сбор данных о сотрудниках', 'Поиск технической информации'],
      defender: ['Минимизация публичной информации', 'Мониторинг сканирований', 'Threat Intelligence'],
      metaphor: 'Разведчик, изучающий крепость перед штурмом',
      defenseMethod: { code: 'Detect', nameRu: 'Обнаружение', color: '#3b82f6' },
      defenseTools: ['Threat Intel', 'Анализ логов', 'OPSEC'],
      relatedCategory: 'Технический оффенсив' },
    { id: 2, code: 'ta0042', name: 'Resource Development', nameRu: 'Подготовка ресурсов',
      description: 'Создание инфраструктуры атаки: домены, аккаунты, вредоносное ПО, C2.',
      attacker: ['Регистрация доменов', 'Покупка/создание ВПО', 'Подготовка C2-серверов'],
      defender: ['Мониторинг похожих доменов', 'Блокировка известной инфраструктуры', 'Threat hunting'],
      metaphor: 'Кузница, где куют оружие перед боем',
      defenseMethod: { code: 'Track', nameRu: 'Отслеживание', color: '#a855f7' },
      defenseTools: ['Domain monitoring', 'TI-фиды', 'Sinkholing'],
      relatedCategory: 'Технический оффенсив' },
    { id: 3, code: 'ta0001', name: 'Initial Access', nameRu: 'Первичный доступ',
      description: 'Проникновение в сеть: фишинг, эксплуатация публичных сервисов, валидные учётки.',
      attacker: ['Фишинг', 'Эксплуатация внешних сервисов', 'Кража учётных данных'],
      defender: ['Email-фильтрация', 'Патч-менеджмент', 'MFA', 'Обучение сотрудников'],
      metaphor: 'Первая нога в приоткрытой двери',
      defenseMethod: { code: 'Block', nameRu: 'Блокировка', color: '#ef4444' },
      defenseTools: ['Email security', 'MFA', 'Vuln management', 'Awareness'],
      relatedCategory: 'Социальная инженерия и человеческий фактор' },
    { id: 4, code: 'ta0002', name: 'Execution', nameRu: 'Выполнение',
      description: 'Запуск вредоносного кода на целевой системе.',
      attacker: ['Запуск скриптов (PowerShell)', 'Макросы в документах', 'Эксплойты'],
      defender: ['EDR/контроль выполнения', 'Application allowlisting', 'Отключение макросов'],
      metaphor: 'Поворот ключа зажигания вредоносной программы',
      defenseMethod: { code: 'EDR', nameRu: 'Контроль выполнения', color: '#3b82f6' },
      defenseTools: ['EDR', 'AppLocker/WDAC', 'Script logging'],
      relatedCategory: 'Реверс-инжиниринг и анализ вредоносного ПО' },
    { id: 5, code: 'ta0003', name: 'Persistence', nameRu: 'Закрепление',
      description: 'Сохранение доступа после перезагрузок и смены учётных данных.',
      attacker: ['Автозагрузка/службы', 'Запланированные задачи', 'Бэкдоры'],
      defender: ['Контроль автозапуска', 'Мониторинг изменений', 'Baseline-сравнение'],
      metaphor: 'Запасной ключ, спрятанный под ковриком',
      defenseMethod: { code: 'Monitor', nameRu: 'Мониторинг', color: '#10b981' },
      defenseTools: ['Autoruns', 'FIM', 'EDR', 'Sysmon'],
      relatedCategory: 'Цифровая криминалистика и реагирование на инциденты (DFIR)' },
    { id: 6, code: 'ta0004', name: 'Privilege Escalation', nameRu: 'Повышение привилегий',
      description: 'Получение более высоких прав в системе.',
      attacker: ['Эксплойты ядра', 'Ошибки конфигурации прав', 'Кража токенов'],
      defender: ['Принцип наименьших привилегий', 'Патчи', 'PAM', 'Мониторинг привилегий'],
      metaphor: 'Лестница из рядового в генералы',
      defenseMethod: { code: 'PoLP', nameRu: 'Мин. привилегии', color: '#a855f7' },
      defenseTools: ['PAM', 'Patch mgmt', 'Privilege monitoring'],
      relatedCategory: 'Практический менеджмент и GRC (Управление, риск, соответствие)' },
    { id: 7, code: 'ta0005', name: 'Defense Evasion', nameRu: 'Обход защиты',
      description: 'Уклонение от обнаружения: обфускация, отключение защиты, очистка следов.',
      attacker: ['Обфускация ВПО', 'Отключение антивируса', 'Очистка логов'],
      defender: ['Защита целостности логов', 'Tamper protection', 'Поведенческий анализ'],
      metaphor: 'Камуфляж и стёртые отпечатки пальцев',
      defenseMethod: { code: 'Detect', nameRu: 'Обнаружение', color: '#3b82f6' },
      defenseTools: ['EDR', 'Tamper protection', 'Behavior analytics'],
      relatedCategory: 'Реверс-инжиниринг и анализ вредоносного ПО' },
    { id: 8, code: 'ta0006', name: 'Credential Access', nameRu: 'Доступ к учёткам',
      description: 'Кража логинов и паролей: дампы, кейлоггеры, перехват.',
      attacker: ['Дамп LSASS', 'Кейлоггеры', 'Kerberoasting'],
      defender: ['Credential Guard', 'MFA', 'Мониторинг доступа к секретам'],
      metaphor: 'Связка чужих ключей в кармане',
      defenseMethod: { code: 'Protect', nameRu: 'Защита секретов', color: '#10b981' },
      defenseTools: ['Credential Guard', 'LAPS', 'PAM', 'MFA'],
      relatedCategory: 'Криптография' },
    { id: 9, code: 'ta0007', name: 'Discovery', nameRu: 'Исследование',
      description: 'Изучение внутренней среды: системы, учётки, сеть.',
      attacker: ['Перечисление систем и пользователей', 'Сетевое сканирование изнутри'],
      defender: ['Сегментация', 'Обнаружение аномального перечисления', 'Honeypots'],
      metaphor: 'Осмотр комнат изнутри захваченного здания',
      defenseMethod: { code: 'Detect', nameRu: 'Обнаружение', color: '#3b82f6' },
      defenseTools: ['Honeypots', 'Network detection', 'Segmentation'],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)' },
    { id: 10, code: 'ta0008', name: 'Lateral Movement', nameRu: 'Перемещение',
      description: 'Распространение по сети к новым системам.',
      attacker: ['Pass-the-Hash', 'RDP/SMB', 'Использование валидных учёток'],
      defender: ['Сегментация', 'MFA для внутренних сервисов', 'Мониторинг латерального трафика'],
      metaphor: 'Переход из комнаты в комнату по внутренним дверям',
      defenseMethod: { code: 'Segment', nameRu: 'Сегментация', color: '#a855f7' },
      defenseTools: ['Microsegmentation', 'PAM', 'NDR'],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)' },
    { id: 11, code: 'ta0011', name: 'Command & Control', nameRu: 'Управление (C2)',
      description: 'Связь с захваченными системами для управления.',
      attacker: ['C2 по HTTPS/DNS', 'Маскировка под легитимный трафик', 'Домены-фронтинг'],
      defender: ['Анализ исходящего трафика', 'DNS-мониторинг', 'Блокировка C2'],
      metaphor: 'Рация для управления агентами в тылу',
      defenseMethod: { code: 'Detect', nameRu: 'Обнаружение', color: '#3b82f6' },
      defenseTools: ['NDR', 'DNS analytics', 'Proxy/Egress filtering'],
      relatedCategory: 'Цифровая криминалистика и реагирование на инциденты (DFIR)' },
    { id: 12, code: 'ta0009', name: 'Collection', nameRu: 'Сбор данных',
      description: 'Сбор ценной информации перед выводом.',
      attacker: ['Сбор файлов и БД', 'Скриншоты/запись экрана', 'Архивирование данных'],
      defender: ['DLP', 'Мониторинг доступа к данным', 'Классификация данных'],
      metaphor: 'Складывание добычи в мешок перед побегом',
      defenseMethod: { code: 'DLP', nameRu: 'Защита данных', color: '#10b981' },
      defenseTools: ['DLP', 'Data classification', 'Access monitoring'],
      relatedCategory: 'Управление безопасности данных' },
    { id: 13, code: 'ta0010', name: 'Exfiltration', nameRu: 'Вывод данных',
      description: 'Кража данных из сети наружу.',
      attacker: ['Вывод по C2-каналу', 'Загрузка в облако', 'Туннелирование'],
      defender: ['DLP на периметре', 'Лимиты исходящего трафика', 'Мониторинг аномалий'],
      metaphor: 'Грузовик, вывозящий украденное за ворота',
      defenseMethod: { code: 'Block', nameRu: 'Блокировка', color: '#ef4444' },
      defenseTools: ['DLP', 'Egress filtering', 'CASB'],
      relatedCategory: 'Управление безопасности данных' },
    { id: 14, code: 'ta0040', name: 'Impact', nameRu: 'Воздействие',
      description: 'Нарушение работы: шифрование, уничтожение, подмена данных.',
      attacker: ['Шифрование (ransomware)', 'Уничтожение данных', 'DoS'],
      defender: ['Резервные копии', 'План восстановления (DRP)', 'Сегментация и иммутабельные бэкапы'],
      metaphor: 'Поджог здания на выходе',
      defenseMethod: { code: 'Recover', nameRu: 'Восстановление', color: '#f59e0b' },
      defenseTools: ['Immutable backups', 'DRP/BCP', 'EDR rollback'],
      relatedCategory: 'Цифровая криминалистика и реагирование на инциденты (DFIR)' },
  ],
};

// Реестр всех схем. Активная схема выбирается в openARWithScheme.
const AR_SCHEMES = {
  killchain: AR_KILL_CHAIN,
  owasp: AR_OWASP,
  osi: AR_OSI,
  mitre: AR_MITRE,
};
let arActiveSchemeCode = 'killchain';
function activeScheme() { return AR_SCHEMES[arActiveSchemeCode] || AR_KILL_CHAIN; }

let arSelectedStage = null;  // id текущей раскрытой стадии (или null)
// Рендер схемы — пока заглушка, будет переписан в Итерации 2
let arViewMode = 'attack'; // 'attack' | 'defense'
function renderARScheme(schemeCode) {
  const container = document.getElementById('arSchemeContainer');
  if (!container) return;
  container.innerHTML = '';
  arSelectedStage = null;

  if (!AR_SCHEMES[schemeCode]) {
    container.innerHTML = `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.6);backdrop-filter:blur(10px);padding:20px;border-radius:12px;color:#fff;text-align:center;pointer-events:none;">Схема в разработке</div>`;
    return;
  }
  arActiveSchemeCode = schemeCode;

  if (schemeCode === 'killchain') renderKillChainScheme();
  else if (schemeCode === 'owasp')    renderOwaspScheme();
  else if (schemeCode === 'osi')      renderOsiScheme();
  else if (schemeCode === 'mitre')    renderMitreScheme();
}
// ─── OWASP: вертикальный стек с цветовой шкалой опасности ───────────────────
// 3D-фигуры на фоне AR-схем отключены — отвлекали от контента
const AR_3D = {
  cube: '',
  pyramid: '',
  layers: '',
  octa: '',
};

function renderOwaspScheme() {
  const container = document.getElementById('arSchemeContainer');
  const stages = AR_OWASP.stages;
  // Цвета по убыванию критичности: A01 самый опасный → красный, к A10 → жёлтый
  const colors = ['#ef4444','#f97316','#f97316','#f59e0b','#f59e0b',
                  '#eab308','#84cc16','#84cc16','#10b981','#3b82f6'];

  container.innerHTML = `
    <div id="arSchemeRoot" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;pointer-events:none;background:rgba(0,0,0,0.4);">
      ${AR_3D.pyramid}
      <div style="position:absolute;top:70px;right:12px;z-index:30;display:flex;flex-direction:column;gap:8px;pointer-events:auto;">
        <button onclick="zoomARScheme('in')" style="width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);border:1px solid rgba(239,68,68,0.5);color:#ef4444;font-size:22px;font-weight:bold;cursor:pointer;">+</button>
        <button onclick="zoomARScheme('out')" style="width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);border:1px solid rgba(239,68,68,0.5);color:#ef4444;font-size:22px;font-weight:bold;cursor:pointer;">−</button>
        <button onclick="resetARSchemeZoom()" style="width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);border:1px solid rgba(239,68,68,0.5);color:#ef4444;font-size:14px;cursor:pointer;">⟳</button>
      </div>
      <div id="killChainScrollContainer" style="flex:1;overflow:auto;pointer-events:auto;padding:60px 16px 100px;-webkit-overflow-scrolling:touch;">
        <div id="killChainWrapper" style="display:flex;justify-content:safe center;min-width:min-content;margin:auto;">
          <div id="killChainNodes" style="display:flex;flex-direction:column;gap:6px;width:100%;max-width:380px;transition:transform 0.2s ease;transform-origin:top center;">
            ${stages.map((s, i) => {
              const color = colors[i] || '#3b82f6';
              return `<button onclick="selectKillChainStage(${s.id})" id="arNode${s.id}"
                style="display:flex;align-items:center;gap:12px;width:100%;padding:10px 14px;
                       background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);
                       border:1px solid ${color}44;border-left:4px solid ${color};
                       border-radius:10px;color:#fff;font-family:inherit;cursor:pointer;text-align:left;
                       transition:all 0.2s;pointer-events:auto;">
                <div style="width:36px;height:36px;border-radius:8px;background:${color}22;
                            border:1px solid ${color};color:${color};display:flex;align-items:center;
                            justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;">A${String(s.id).padStart(2,'0')}</div>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:12px;font-weight:700;color:#fff;">${eh(s.nameRu)}</div>
                  <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${eh(s.name)}</div>
                </div>
                <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></div>
              </button>`;
            }).join('')}
          </div>
        </div>
      </div>
      <div id="arStageDetails" class="ar-stage-details-panel" style="display:none;position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.95);backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,0.2);color:#fff;max-height:70%;overflow-y:auto;pointer-events:auto;z-index:20;transform:translateY(calc(100% - 60px));transition:transform 0.3s cubic-bezier(0.2,0.9,0.4,1.1);border-radius:20px 20px 0 0;">
        <div style="position:sticky;top:0;background:inherit;backdrop-filter:blur(20px);padding:12px 20px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.1);">
          <div style="width:40px;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;margin:0 auto 8px;"></div>
          <div style="font-size:10px;color:#ef4444;font-weight:600;" id="arStageDetailTitle">НАЖМИТЕ НА УЯЗВИМОСТЬ</div>
        </div>
        <div id="arStageDetailContent" style="padding:16px 20px 24px;"></div>
      </div>
      <div id="arStageHint" style="position:absolute;bottom:0;left:0;right:0;text-align:center;padding:16px;color:rgba(255,255,255,0.7);font-size:11px;background:linear-gradient(0deg,rgba(0,0,0,0.6) 0%,transparent 100%);pointer-events:none;z-index:5;">Нажми на уязвимость, чтобы узнать подробнее</div>
    </div>`;
  initStageDetailsSwipe();
  initARPan();

  // Анимация: строки вылетают снизу одна за другой
  setTimeout(() => {
    stages.forEach((s, i) => {
      const node = document.getElementById('arNode' + s.id);
      if (!node) return;
      node.style.opacity = '0';
      node.style.transform = 'translateX(-32px)';
      setTimeout(() => {
        node.style.transition = 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.22,1,0.36,1), border-color 0.2s';
        node.style.opacity = '1';
        node.style.transform = 'translateX(0)';
      }, i * 60);
    });
  }, 50);
}

// ─── OSI: горизонтальные слои-плашки (L7 сверху, L1 снизу) ──────────────────
function renderOsiScheme() {
  const container = document.getElementById('arSchemeContainer');
  const stages = [...AR_OSI.stages].reverse(); // L7 вверху
  const layerColors = ['#f59e0b','#10b981','#3b82f6','#a855f7','#ef4444','#64748b','#0ea5e9'];
  // Обращаем — L7=idx0 самый яркий, L1=idx6
  const colorMap = { 7:'#f59e0b', 6:'#10b981', 5:'#3b82f6', 4:'#a855f7', 3:'#8b5cf6', 2:'#6366f1', 1:'#64748b' };

  container.innerHTML = `
    <div id="arSchemeRoot" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;pointer-events:none;background:rgba(0,0,0,0.35);">
      ${AR_3D.layers}
      <div style="position:absolute;top:70px;right:12px;z-index:30;display:flex;flex-direction:column;gap:8px;pointer-events:auto;">
        <button onclick="zoomARScheme('in')" style="width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);border:1px solid rgba(59,130,246,0.5);color:#3b82f6;font-size:22px;font-weight:bold;cursor:pointer;">+</button>
        <button onclick="zoomARScheme('out')" style="width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);border:1px solid rgba(59,130,246,0.5);color:#3b82f6;font-size:22px;font-weight:bold;cursor:pointer;">−</button>
        <button onclick="resetARSchemeZoom()" style="width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);border:1px solid rgba(59,130,246,0.5);color:#3b82f6;font-size:14px;cursor:pointer;">⟳</button>
      </div>
      <div id="killChainScrollContainer" style="flex:1;overflow:auto;pointer-events:auto;padding:60px 16px 100px;-webkit-overflow-scrolling:touch;">
        <div id="killChainWrapper" style="display:flex;justify-content:center;">
          <div id="killChainNodes" style="display:flex;flex-direction:column;gap:3px;width:100%;max-width:400px;transition:transform 0.2s ease;transform-origin:top center;">
            ${stages.map(s => {
              const color = colorMap[s.id] || '#3b82f6';
              const w = 60 + (s.id / 7) * 40; // L7=100%, L1=60% ширина для пирамиды
              return `<button onclick="selectKillChainStage(${s.id})" id="arNode${s.id}"
                style="display:flex;align-items:center;gap:0;width:${w}%;align-self:center;
                       padding:0;background:transparent;border:none;cursor:pointer;pointer-events:auto;transition:all 0.2s;">
                <div style="flex:1;display:flex;align-items:center;gap:10px;padding:10px 14px;
                            background:${color}20;border:1px solid ${color}55;border-radius:8px;
                            backdrop-filter:blur(8px);">
                  <div style="width:28px;height:28px;border-radius:50%;background:${color};color:#fff;
                              display:flex;align-items:center;justify-content:center;
                              font-weight:800;font-size:12px;flex-shrink:0;">L${s.id}</div>
                  <div style="flex:1;text-align:left;">
                    <div style="font-size:12px;font-weight:700;color:#fff;">${eh(s.nameRu)}</div>
                    <div style="font-size:10px;color:rgba(255,255,255,0.5);">${eh(s.name)}</div>
                  </div>
                </div>
              </button>`;
            }).join('')}
            <div style="text-align:center;margin-top:8px;font-size:10px;color:rgba(255,255,255,0.4);">▼ Физический уровень (снизу) → Прикладной (сверху) ▲</div>
          </div>
        </div>
      </div>
      <div id="arStageDetails" class="ar-stage-details-panel" style="display:none;position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.95);backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,0.2);color:#fff;max-height:70%;overflow-y:auto;pointer-events:auto;z-index:20;transform:translateY(calc(100% - 60px));transition:transform 0.3s cubic-bezier(0.2,0.9,0.4,1.1);border-radius:20px 20px 0 0;">
        <div style="position:sticky;top:0;background:inherit;backdrop-filter:blur(20px);padding:12px 20px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.1);">
          <div style="width:40px;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;margin:0 auto 8px;"></div>
          <div style="font-size:10px;color:#3b82f6;font-weight:600;" id="arStageDetailTitle">НАЖМИТЕ НА УРОВЕНЬ</div>
        </div>
        <div id="arStageDetailContent" style="padding:16px 20px 24px;"></div>
      </div>
      <div id="arStageHint" style="position:absolute;bottom:0;left:0;right:0;text-align:center;padding:16px;color:rgba(255,255,255,0.7);font-size:11px;background:linear-gradient(0deg,rgba(0,0,0,0.6) 0%,transparent 100%);pointer-events:none;z-index:5;">Нажми на уровень для подробностей</div>
    </div>`;
  initStageDetailsSwipe();
  initARPan();

  // Анимация: слои раскрываются от середины наружу
  const mid = Math.floor(stages.length / 2);
  setTimeout(() => {
    stages.forEach((s, i) => {
      const node = document.getElementById('arNode' + s.id);
      if (!node) return;
      const delay = Math.abs(i - mid) * 70;
      node.style.opacity = '0';
      node.style.transform = 'scaleX(0.3)';
      node.style.transformOrigin = 'center';
      setTimeout(() => {
        node.style.transition = 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.34,1.56,0.64,1)';
        node.style.opacity = '1';
        node.style.transform = 'scaleX(1)';
      }, delay);
    });
  }, 50);
}

// ─── MITRE: матрица тактик 2 колонки с цветовой кодировкой фаз ───────────────
function renderMitreScheme() {
  const container = document.getElementById('arSchemeContainer');
  const stages = AR_MITRE.stages;
  // Цвет фазы по id: 1-2 разведка/подготовка, 3-5 вход, 6-9 действия внутри, 10-12 С2/сбор, 13-14 вывод/удар
  const phaseColor = (id) => {
    if (id <= 2) return '#a855f7';
    if (id <= 5) return '#ef4444';
    if (id <= 9) return '#f97316';
    if (id <= 12) return '#3b82f6';
    return '#10b981';
  };

  // Разбиваем на 2 колонки
  const left = stages.filter((_, i) => i % 2 === 0);
  const right = stages.filter((_, i) => i % 2 === 1);
  const maxRows = Math.max(left.length, right.length);

  const cardHtml = (s) => {
    if (!s) return '<div></div>';
    const color = phaseColor(s.id);
    return `<button onclick="selectKillChainStage(${s.id})" id="arNode${s.id}"
      style="display:flex;flex-direction:column;align-items:flex-start;padding:8px 10px;
             background:${color}15;border:1px solid ${color}44;border-top:3px solid ${color};
             border-radius:8px;color:#fff;font-family:inherit;cursor:pointer;text-align:left;
             width:100%;transition:all 0.2s;pointer-events:auto;min-height:60px;">
      <div style="font-size:9px;color:${color};font-weight:700;letter-spacing:0.5px;margin-bottom:3px;">TA${String(s.id).padStart(4,'0')}</div>
      <div style="font-size:11px;font-weight:700;line-height:1.2;">${eh(s.nameRu)}</div>
    </button>`;
  };

  const rows = Array.from({length: maxRows}, (_, i) =>
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">
      ${cardHtml(left[i])}${cardHtml(right[i])}
    </div>`
  ).join('');

  // Легенда фаз
  const legend = [
    {label:'Подготовка', color:'#a855f7'},
    {label:'Вход', color:'#ef4444'},
    {label:'Внутри', color:'#f97316'},
    {label:'C2/Сбор', color:'#3b82f6'},
    {label:'Финал', color:'#10b981'},
  ].map(l => `<div style="display:flex;align-items:center;gap:4px;font-size:9px;color:rgba(255,255,255,0.7);">
    <div style="width:10px;height:10px;border-radius:2px;background:${l.color};"></div>${l.label}
  </div>`).join('');

  container.innerHTML = `
    <div id="arSchemeRoot" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;pointer-events:none;background:rgba(0,0,0,0.4);">
      ${AR_3D.octa}
      <div style="position:absolute;top:70px;right:12px;z-index:30;display:flex;flex-direction:column;gap:8px;pointer-events:auto;">
        <button onclick="zoomARScheme('in')" style="width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);border:1px solid rgba(168,85,247,0.5);color:#a855f7;font-size:22px;font-weight:bold;cursor:pointer;">+</button>
        <button onclick="zoomARScheme('out')" style="width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);border:1px solid rgba(168,85,247,0.5);color:#a855f7;font-size:22px;font-weight:bold;cursor:pointer;">−</button>
        <button onclick="resetARSchemeZoom()" style="width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);border:1px solid rgba(168,85,247,0.5);color:#a855f7;font-size:14px;cursor:pointer;">⟳</button>
      </div>
      <div id="killChainScrollContainer" style="flex:1;overflow:auto;pointer-events:auto;padding:56px 12px 100px;-webkit-overflow-scrolling:touch;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;pointer-events:none;">${legend}</div>
        <div id="killChainWrapper" style="width:100%;">
          <div id="killChainNodes" style="width:100%;transition:transform 0.2s ease;transform-origin:top center;">
            ${rows}
          </div>
        </div>
      </div>
      <div id="arStageDetails" class="ar-stage-details-panel" style="display:none;position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.95);backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,0.2);color:#fff;max-height:70%;overflow-y:auto;pointer-events:auto;z-index:20;transform:translateY(calc(100% - 60px));transition:transform 0.3s cubic-bezier(0.2,0.9,0.4,1.1);border-radius:20px 20px 0 0;">
        <div style="position:sticky;top:0;background:inherit;backdrop-filter:blur(20px);padding:12px 20px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.1);">
          <div style="width:40px;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;margin:0 auto 8px;"></div>
          <div style="font-size:10px;color:#a855f7;font-weight:600;" id="arStageDetailTitle">НАЖМИТЕ НА ТАКТИКУ</div>
        </div>
        <div id="arStageDetailContent" style="padding:16px 20px 24px;"></div>
      </div>
      <div id="arStageHint" style="position:absolute;bottom:0;left:0;right:0;text-align:center;padding:16px;color:rgba(255,255,255,0.7);font-size:11px;background:linear-gradient(0deg,rgba(0,0,0,0.6) 0%,transparent 100%);pointer-events:none;z-index:5;">Нажми на тактику для подробностей</div>
    </div>`;
  initStageDetailsSwipe();
  initARPan();

  // Анимация: карточки матрицы всплывают по колонкам
  setTimeout(() => {
    stages.forEach((s, i) => {
      const node = document.getElementById('arNode' + s.id);
      if (!node) return;
      const col = i % 2;
      const row = Math.floor(i / 2);
      const delay = row * 50 + col * 25;
      node.style.opacity = '0';
      node.style.transform = 'scale(0.7) translateY(10px)';
      setTimeout(() => {
        node.style.transition = 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.34,1.4,0.64,1)';
        node.style.opacity = '1';
        node.style.transform = 'scale(1) translateY(0)';
      }, delay);
    });
  }, 50);
}
function findKillChainStageForBook(book) {
  // Ищем первую категорию книги, которая привязана к этапу Kill Chain
  const cats = (book && book.categories) || [];
  for (const cat of cats) {
    const stage = activeScheme().stages.find(s => s.relatedCategory === cat);
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
    (b.categories || []).includes(stage.relatedCategory) && completedBookIds.includes(b.id)
  );
}

function renderKillChainScheme() {
  // Показываем переключатель режима (он скрыт по умолчанию для других схем)
  const toggle = document.getElementById('arViewModeToggle');
  if (toggle) toggle.style.display = 'flex';
  // Восстанавливаем сохранённый режим
  const savedMode = localStorage.getItem('aegis_killchain_mode') || 'attack';
  arViewMode = savedMode;
  // Применим режим после рендера узлов (через тик)
  setTimeout(() => setKillChainViewMode(savedMode), 50);
  const container = document.getElementById('arSchemeContainer');
  if (!container) {
    console.error('arSchemeContainer не найден');
    return;
  }
  
  const stages = activeScheme().stages;
  
  // Определяем ориентацию
  const isMobile = window.innerWidth < 768;
  const isPortrait = window.innerHeight > window.innerWidth;
  const isVertical = window.innerWidth < 1400;
  
  // Сбрасываем зум при открытии
  currentARSchemeZoom = 1;
  
  let html = `
    <div id="arSchemeRoot" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;pointer-events:none;background:rgba(0,0,0,0.3);">
      ${AR_3D.cube}
      
      <!-- Контролы зума -->
      <div style="position:absolute;top:70px;right:12px;z-index:30;display:flex;flex-direction:column;gap:8px;pointer-events:auto;">
        <button onclick="zoomARScheme('in')" style="width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);border:1px solid rgba(0,212,255,0.5);color:#00d4ff;font-size:22px;font-weight:bold;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);">+</button>
        <button onclick="zoomARScheme('out')" style="width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);border:1px solid rgba(0,212,255,0.5);color:#00d4ff;font-size:22px;font-weight:bold;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);">−</button>
        <button onclick="resetARSchemeZoom()" style="width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);border:1px solid rgba(0,212,255,0.5);color:#00d4ff;font-size:14px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);">⟳</button>
      </div>
      
      <!-- Контейнер для скролла с поддержкой зума -->
      <div id="killChainScrollContainer" style="flex:1;overflow:auto;pointer-events:auto;padding:64px 16px 80px;-webkit-overflow-scrolling:touch;">
        <div id="killChainWrapper" style="display:flex;justify-content:safe center;min-width:min-content;margin:auto;">
          <div id="killChainNodes" style="display:flex;flex-direction:${isVertical ? 'column' : 'row'};align-items:center;justify-content:center;gap:${isVertical ? '12px' : '8px'};transition:transform 0.2s ease;transform-origin:center center;">
            ${stages.map((s, i) => `
              ${i > 0 ? `<div class="ar-flow-line${isVertical ? ' vertical' : ''}" style="width:${isVertical ? '2px' : '24px'};height:${isVertical ? '24px' : '2px'};background:linear-gradient(${isVertical ? '180deg' : '90deg'},rgba(0,212,255,0.3),rgba(124,58,237,0.3));flex-shrink:0;"></div>` : ''}
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
  initARPan();
  
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

  // Анимация появления нод — каждая вылетает с задержкой
  setTimeout(() => {
    document.querySelectorAll('.ar-killchain-node').forEach((node, i) => {
      node.style.opacity = '0';
      node.style.transform = 'scale(0.5)';
      setTimeout(() => {
        node.style.transition = 'opacity 0.35s ease, transform 0.35s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s';
        node.style.opacity = '1';
        node.style.transform = 'scale(1)';
      }, i * 80);
    });
    // Пульсирующий эффект на первой ноде как подсказка
    setTimeout(() => {
      const first = document.getElementById('arNode1');
      if (first) first.style.animation = 'arNodePulse 2s ease-in-out 3';
    }, stages.length * 80 + 200);

    // 3D floating анимация с разными задержками
    document.querySelectorAll('.ar-killchain-node').forEach((node, i) => {
      const delay = (i * 300) % 1200;
      const dur = 2.8 + (i % 3) * 0.4;
      setTimeout(() => {
        if (!node.style.animation || node.style.animation.includes('arNodePulse') === false) {
          node.style.animation = `ar3dFloat ${dur}s ease-in-out ${delay}ms infinite`;
        }
      }, stages.length * 80 + 800);
    });
  }, 100);
}

// Глобальные переменные для свайпа
let detailsPanelStartY = 0;
let detailsPanelCurrentY = 0;
let detailsPanelIsDragging = false;
let detailsPanelOpen = false;
let detailsPanelDidDrag = false;

// Панорамирование схемы: нативный скролл (тачпад/колесо) + drag мышью
function initARPan() {
  const sc = document.getElementById('killChainScrollContainer');
  if (!sc) return;
  // Колесо/тачпад: вертикальный жест → горизонтальная прокрутка ТОЛЬКО если
  // по горизонтали скроллить некуда нативно (узкий контент). Иначе не мешаем.
  sc.onwheel = (e) => {
    const canScrollV = sc.scrollHeight > sc.clientHeight;
    const canScrollH = sc.scrollWidth > sc.clientWidth;
    // Если контент шире, чем выше, и вертикально скроллить некуда — конвертим
    if (canScrollH && !canScrollV && e.deltaX === 0) {
      sc.scrollLeft += e.deltaY;
      e.preventDefault();
    }
    // во всех остальных случаях — нативный скролл (работает на тачпаде сам)
  };
  // Drag-to-pan мышью (для обычной мыши без колеса-горизонтали)
  let dragging = false, sx = 0, sy = 0, sl = 0, st = 0, moved = false;
  sc.onmousedown = (e) => {
    if (e.target.closest('button')) return;
    dragging = true; moved = false;
    sx = e.clientX; sy = e.clientY;
    sl = sc.scrollLeft; st = sc.scrollTop;
    sc.style.cursor = 'grabbing';
  };
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    sc.scrollLeft = sl - dx;
    sc.scrollTop = st - dy;
  });
  window.addEventListener('mouseup', () => { dragging = false; sc.style.cursor = ''; });
}

function initStageDetailsSwipe() {
  const panel = document.getElementById('arStageDetails');
  if (!panel) return;

  panel.removeEventListener('touchstart', onDetailsTouchStart);
  panel.removeEventListener('touchmove', onDetailsTouchMove);
  panel.removeEventListener('touchend', onDetailsTouchEnd);
  panel.removeEventListener('mousedown', onDetailsMouseDown);

  panel.addEventListener('touchstart', onDetailsTouchStart, { passive: false });
  panel.addEventListener('touchmove', onDetailsTouchMove, { passive: false });
  panel.addEventListener('touchend', onDetailsTouchEnd);
  panel.addEventListener('mousedown', onDetailsMouseDown);

  // Клик по панели (для ПК/тачпада): переключает открыто/закрыто.
  // Игнорируем клики по кнопкам и случаи, когда было перетаскивание.
  panel.removeEventListener('click', onDetailsClick);
  panel.addEventListener('click', onDetailsClick);
}

function onDetailsClick(e) {
  if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
  if (detailsPanelDidDrag) { detailsPanelDidDrag = false; return; } // это было перетаскивание
  const panel = document.getElementById('arStageDetails');
  if (!panel) return;
  panel.style.transition = 'transform 0.3s ease';
  if (detailsPanelOpen) {
    const ph = panel.offsetHeight;
    panel.style.transform = `translateY(${ph - 60}px)`;
    detailsPanelOpen = false;
  } else {
    panel.style.transform = 'translateY(0)';
    detailsPanelOpen = true;
  }
}

function onDetailsMouseDown(e) {
  // Игнорируем клики по кнопкам внутри панели
  if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
  detailsPanelStartY = e.clientY;
  detailsPanelIsDragging = true;
  const panel = document.getElementById('arStageDetails');
  if (panel) panel.style.transition = 'none';
  const onMove = (ev) => {
    if (!detailsPanelIsDragging) return;
    const p = document.getElementById('arStageDetails');
    if (!p) return;
    const delta = ev.clientY - detailsPanelStartY;
    if (Math.abs(delta) > 5) detailsPanelDidDrag = true;
    const ph = p.offsetHeight;
    const base = detailsPanelOpen ? 0 : ph - 60;
    const nt = Math.max(0, Math.min(base + delta, ph - 60));
    p.style.transform = `translateY(${nt}px)`;
    detailsPanelCurrentY = nt;
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    onDetailsTouchEnd({ touches: [] });
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
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
  activeScheme().stages.forEach(s => {
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
  const nodesContainer = document.getElementById('killChainNodes');
  const scrollContainer = document.getElementById('killChainScrollContainer');
  if (nodesContainer) {
    nodesContainer.style.transform = 'scale(1)';
    nodesContainer.style.transition = 'transform 0.2s ease';
  }
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
    scrollContainer.scrollLeft = 0;
  }
  if (typeof applyARSchemeZoom === 'function') applyARSchemeZoom();
  showZoomIndicator(100);
}

function showZoomIndicator(percent) {
  const old = document.getElementById('zoomIndicator');
  if (old) old.remove();

  const indicator = document.createElement('div');
  indicator.id = 'zoomIndicator';
  indicator.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      <line x1="11" y1="8" x2="11" y2="14"/>
      <line x1="8" y1="11" x2="14" y2="11"/>
    </svg>
    <span>${percent}%</span>
  `;
  indicator.style.cssText = `
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0,0,0,0.85);
    backdrop-filter: blur(12px);
    color: #00d4ff;
    font-size: 16px; font-weight: 700;
    padding: 10px 20px;
    border-radius: 48px;
    z-index: 100; pointer-events: none;
    font-family: 'JetBrains Mono', monospace;
    display: inline-flex; align-items: center;
    border: 1px solid rgba(0,212,255,0.3);
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    animation: zoomFadeOut 0.8s forwards;
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
  const stage = activeScheme().stages.find(s => s.id === stageId);
  if (!stage) return;

  arSelectedStage = stageId;

  // Подсветить выбранную ноду
  activeScheme().stages.forEach(s => {
    const node = document.getElementById('arNode' + s.id);
    if (!node) return;
    if (s.id === stageId) {
      node.style.background = 'var(--accent-gradient)';
      node.style.borderColor = '#fff';
      node.style.transform = 'scale(1.15)';
      node.style.boxShadow = '0 0 24px rgba(0,212,255,0.7)';
      node.style.animation = 'arNodePulse 1.5s ease-in-out 2';
    } else {
      node.style.background = 'rgba(0,0,0,0.5)';
      node.style.borderColor = isKillChainStageStudied(s) ? '#10b981' : 'rgba(255,255,255,0.2)';
      node.style.transform = 'scale(1)';
      node.style.boxShadow = 'none';
    }
  });

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
      <div style="background:linear-gradient(135deg,rgba(0,212,255,0.08),rgba(168,85,247,0.08));border:1px solid rgba(0,212,255,0.25);border-radius:10px;padding:10px 12px;margin-bottom:14px;">
        <div style="font-size:9px;font-weight:700;color:rgba(0,212,255,0.9);letter-spacing:0.8px;margin-bottom:4px;">МЕТАФОРА</div>
        <div style="font-size:12px;line-height:1.4;font-style:italic;opacity:0.9;">${eh(stage.metaphor || '—')}</div>
      </div>

      <div style="display:flex;align-items:center;gap:10px;background:${stage.defenseMethod ? stage.defenseMethod.color : '#666'}20;border:1px solid ${stage.defenseMethod ? stage.defenseMethod.color : '#666'}66;border-radius:10px;padding:10px 12px;margin-bottom:14px;">
        <div style="width:36px;height:36px;border-radius:50%;background:${stage.defenseMethod ? stage.defenseMethod.color : '#666'};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;flex-shrink:0;">
          ${stage.defenseMethod ? stage.defenseMethod.code.charAt(0) : '?'}
        </div>
        <div style="flex:1;">
          <div style="font-size:9px;font-weight:700;letter-spacing:0.8px;opacity:0.7;">МЕТОД ЗАЩИТЫ (6D)</div>
          <div style="font-size:13px;font-weight:700;color:${stage.defenseMethod ? stage.defenseMethod.color : '#fff'};">
            ${stage.defenseMethod ? eh(stage.defenseMethod.code + ' — ' + stage.defenseMethod.nameRu) : '—'}
          </div>
        </div>
      </div>

      <div style="font-size:13px;line-height:1.5;opacity:0.9;margin-bottom:14px;">${eh(stage.description)}</div>

      <div style="display:flex;gap:4px;margin-bottom:10px;background:rgba(255,255,255,0.04);padding:3px;border-radius:8px;">
        <button onclick="switchKillChainTab('attack')" id="killChainTabBtn-attack" class="killchain-tab-btn active" style="flex:1;padding:7px;background:rgba(239,68,68,0.25);border:none;color:#fff;border-radius:6px;cursor:pointer;font-family:inherit;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:4px;">
          ${ICONS.iconSword} АТАКА
        </button>
        <button onclick="switchKillChainTab('defense')" id="killChainTabBtn-defense" class="killchain-tab-btn" style="flex:1;padding:7px;background:transparent;border:none;color:rgba(255,255,255,0.6);border-radius:6px;cursor:pointer;font-family:inherit;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:4px;">
          ${ICONS.iconShield} ЗАЩИТА
        </button>
        <button onclick="switchKillChainTab('tools')" id="killChainTabBtn-tools" class="killchain-tab-btn" style="flex:1;padding:7px;background:transparent;border:none;color:rgba(255,255,255,0.6);border-radius:6px;cursor:pointer;font-family:inherit;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:4px;">
          ИНСТРУМЕНТЫ
        </button>
      </div>

      <div id="killChainTabContent-attack" class="killchain-tab-content" style="display:block;margin-bottom:16px;">
        <ul style="margin:0;padding-left:20px;font-size:12px;line-height:1.6;opacity:0.9;">
          ${stage.attacker.map(a => `<li style="margin-bottom:6px;">${eh(a)}</li>`).join('')}
        </ul>
      </div>

      <div id="killChainTabContent-defense" class="killchain-tab-content" style="display:none;margin-bottom:16px;">
        <ul style="margin:0;padding-left:20px;font-size:12px;line-height:1.6;opacity:0.9;">
          ${stage.defender.map(d => `<li style="margin-bottom:6px;">${eh(d)}</li>`).join('')}
        </ul>
      </div>

      <div id="killChainTabContent-tools" class="killchain-tab-content" style="display:none;margin-bottom:16px;">
        ${(stage.defenseTools && stage.defenseTools.length) ? `
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${stage.defenseTools.map(t => `
              <div style="background:${stage.defenseMethod ? stage.defenseMethod.color : '#666'}25;border:1px solid ${stage.defenseMethod ? stage.defenseMethod.color : '#666'}55;color:${stage.defenseMethod ? stage.defenseMethod.color : '#fff'};padding:5px 10px;border-radius:14px;font-size:11px;font-weight:600;">
                ${eh(t)}
              </div>
            `).join('')}
          </div>
        ` : `<div style="font-size:11px;opacity:0.5;text-align:center;padding:12px;">Список инструментов не задан</div>`}
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
        <button onclick="nextKillChainStage()" ${stageId === activeScheme().stages.length ? 'disabled' : ''} style="flex:1;padding:12px;background:var(--accent-gradient);border:none;border-radius:10px;color:#000;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;${stageId === activeScheme().stages.length ? 'opacity:0.4;cursor:default;' : ''}">Вперёд →</button>
      </div>
    `;
  }

  // Показываем панель и СРАЗУ открываем полностью (без свайпа)
  const panel = document.getElementById('arStageDetails');
  if (panel) {
    panel.style.display = 'block';
    const isWide = window.innerWidth >= 900;
    void panel.offsetHeight; // reflow для transition
    if (isWide) {
      // Правый сайдбар
      panel.style.top = '0';
      panel.style.bottom = '0';
      panel.style.left = 'auto';
      panel.style.right = '0';
      panel.style.width = 'min(420px, 42vw)';
      panel.style.maxHeight = '100%';
      panel.style.height = '100%';
      panel.style.borderRadius = '0';
      panel.style.borderTop = 'none';
      panel.style.borderLeft = '1px solid rgba(255,255,255,0.2)';
      panel.style.transform = 'translateX(0)';
      panel.classList.add('open');
    } else {
      // Узкий экран: нижняя шторка, СРАЗУ открыта полностью
      panel.classList.remove('open');
      panel.style.top = 'auto';
      panel.style.bottom = '0';
      panel.style.left = '0';
      panel.style.right = '0';
      panel.style.width = '100%';
      panel.style.height = 'auto';
      panel.style.maxHeight = '78%';
      panel.style.borderRadius = '20px 20px 0 0';
      panel.style.borderTop = '1px solid rgba(255,255,255,0.2)';
      panel.style.borderLeft = 'none';
      panel.style.transform = 'translateY(0)';
    }
    detailsPanelOpen = true;

    // Кнопка закрытия (добавляем один раз)
    if (!document.getElementById('arПанельCloseBtn')) {
      const cb = document.createElement('button');
      cb.id = 'arПанельCloseBtn';
      cb.innerHTML = '✕';
      cb.onclick = (e) => { e.stopPropagation(); closeKillChainStage(); };
      cb.style.cssText = 'position:absolute;top:10px;right:12px;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.25);color:#fff;font-size:16px;cursor:pointer;z-index:30;display:flex;align-items:center;justify-content:center;';
      panel.appendChild(cb);
    }
  }
}
function switchKillChainTab(tab) {
  ['attack', 'defense', 'tools'].forEach(t => {
    const btn = document.getElementById('killChainTabBtn-' + t);
    const content = document.getElementById('killChainTabContent-' + t);
    if (!btn || !content) return;
    const isActive = t === tab;
    content.style.display = isActive ? 'block' : 'none';
    if (isActive) {
      // Цвет активной вкладки зависит от типа
      if (t === 'attack') btn.style.background = 'rgba(239,68,68,0.25)';
      else if (t === 'defense') btn.style.background = 'rgba(16,185,129,0.25)';
      else btn.style.background = 'rgba(168,85,247,0.25)';
      btn.style.color = '#fff';
    } else {
      btn.style.background = 'transparent';
      btn.style.color = 'rgba(255,255,255,0.6)';
    }
  });
}
function setKillChainViewMode(mode) {
  if (mode !== 'attack' && mode !== 'defense') mode = 'attack';
  arViewMode = mode;
  localStorage.setItem('aegis_killchain_mode', mode);

  // Перекрашиваем кнопки тумблера
  const btnAtt = document.getElementById('arViewBtnAttack');
  const btnDef = document.getElementById('arViewBtnDefense');
  if (btnAtt && btnDef) {
    if (mode === 'attack') {
      btnAtt.style.background = 'rgba(239,68,68,0.4)';
      btnAtt.style.color = '#fff';
      btnDef.style.background = 'transparent';
      btnDef.style.color = 'rgba(255,255,255,0.6)';
    } else {
      btnDef.style.background = 'rgba(16,185,129,0.4)';
      btnDef.style.color = '#fff';
      btnAtt.style.background = 'transparent';
      btnAtt.style.color = 'rgba(255,255,255,0.6)';
    }
  }

  // Перерисовываем узлы с новым стилем
  applyKillChainViewMode();

  // Если открыта детальная карточка этапа — переключаем активную вкладку
  if (arSelectedStage !== null) {
    switchKillChainTab(mode === 'defense' ? 'defense' : 'attack');
  }
}

function applyKillChainViewMode() {
  activeScheme().stages.forEach(s => {
    const node = document.getElementById('arNode' + s.id);
    if (!node) return;

    const isSelected = s.id === arSelectedStage;
    const isStudied = isKillChainStageStudied(s);

    // Содержимое узла: номер (атака) или буква метода (защита)
    let label;
    if (arViewMode === 'defense' && s.defenseMethod) {
      label = s.defenseMethod.code.charAt(0);
    } else {
      label = String(s.id);
    }
    // Обновляем только текстовый блок (первый <div> внутри button), не ломая остальное
    const labelDiv = node.querySelector('.killchain-node-label');
    if (labelDiv) labelDiv.textContent = label;
    else {
      // Если внутри сложная структура — найдём первый <div> с цифрой
      const first = node.querySelector('div');
      if (first) first.textContent = label;
    }

    // Цвет рамки
    if (isSelected) {
      // selectKillChainStage сам красит выбранный — не трогаем
      return;
    }
    let borderColor;
    if (arViewMode === 'defense') {
      borderColor = s.defenseMethod ? s.defenseMethod.color : 'rgba(255,255,255,0.2)';
    } else {
      borderColor = isStudied ? '#10b981' : 'rgba(255,255,255,0.2)';
    }
    node.style.borderColor = borderColor;
  });
}
  
  // Обновляем содержимое панели
  const contentEl = document.getElementById('arStageDetailContent');
  if (contentEl) {
    contentEl.innerHTML = `
      <!-- Метафора визуализации -->
      <div style="background:linear-gradient(135deg,rgba(0,212,255,0.08),rgba(168,85,247,0.08));border:1px solid rgba(0,212,255,0.25);border-radius:10px;padding:10px 12px;margin-bottom:14px;">
        <div style="font-size:9px;font-weight:700;color:rgba(0,212,255,0.9);letter-spacing:0.8px;margin-bottom:4px;">МЕТАФОРА</div>
        <div style="font-size:12px;line-height:1.4;font-style:italic;opacity:0.9;">${eh(stage.metaphor || '—')}</div>
      </div>

      <!-- Бейдж метода защиты -->
      <div style="display:flex;align-items:center;gap:10px;background:${stage.defenseMethod ? stage.defenseMethod.color : '#666'}20;border:1px solid ${stage.defenseMethod ? stage.defenseMethod.color : '#666'}66;border-radius:10px;padding:10px 12px;margin-bottom:14px;">
        <div style="width:36px;height:36px;border-radius:50%;background:${stage.defenseMethod ? stage.defenseMethod.color : '#666'};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;flex-shrink:0;">
          ${stage.defenseMethod ? stage.defenseMethod.code.charAt(0) : '?'}
        </div>
        <div style="flex:1;">
          <div style="font-size:9px;font-weight:700;letter-spacing:0.8px;opacity:0.7;">МЕТОД ЗАЩИТЫ (6D)</div>
          <div style="font-size:13px;font-weight:700;color:${stage.defenseMethod ? stage.defenseMethod.color : '#fff'};">
            ${stage.defenseMethod ? eh(stage.defenseMethod.code + ' — ' + stage.defenseMethod.nameRu) : '—'}
          </div>
        </div>
      </div>

      <!-- Описание -->
      <div style="font-size:13px;line-height:1.5;opacity:0.9;margin-bottom:14px;">${eh(stage.description)}</div>

      <!-- Вкладки Атака / Защита / Инструменты -->
      <div style="display:flex;gap:4px;margin-bottom:10px;background:rgba(255,255,255,0.04);padding:3px;border-radius:8px;">
        <button onclick="switchKillChainTab('attack')" id="killChainTabBtn-attack" class="killchain-tab-btn active" style="flex:1;padding:7px;background:rgba(239,68,68,0.25);border:none;color:#fff;border-radius:6px;cursor:pointer;font-family:inherit;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:4px;">
          ${ICONS.iconSword} АТАКА
        </button>
        <button onclick="switchKillChainTab('defense')" id="killChainTabBtn-defense" class="killchain-tab-btn" style="flex:1;padding:7px;background:transparent;border:none;color:rgba(255,255,255,0.6);border-radius:6px;cursor:pointer;font-family:inherit;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:4px;">
          ${ICONS.iconShield} ЗАЩИТА
        </button>
        <button onclick="switchKillChainTab('tools')" id="killChainTabBtn-tools" class="killchain-tab-btn" style="flex:1;padding:7px;background:transparent;border:none;color:rgba(255,255,255,0.6);border-radius:6px;cursor:pointer;font-family:inherit;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:4px;">
          ⚙ ИНСТРУМЕНТЫ
        </button>
      </div>

      <!-- Содержимое вкладок -->
      <div id="killChainTabContent-attack" class="killchain-tab-content" style="display:block;margin-bottom:16px;">
        <ul style="margin:0;padding-left:20px;font-size:12px;line-height:1.6;opacity:0.9;">
          ${stage.attacker.map(a => `<li style="margin-bottom:6px;">${eh(a)}</li>`).join('')}
        </ul>
      </div>

      <div id="killChainTabContent-defense" class="killchain-tab-content" style="display:none;margin-bottom:16px;">
        <ul style="margin:0;padding-left:20px;font-size:12px;line-height:1.6;opacity:0.9;">
          ${stage.defender.map(d => `<li style="margin-bottom:6px;">${eh(d)}</li>`).join('')}
        </ul>
      </div>

      <div id="killChainTabContent-tools" class="killchain-tab-content" style="display:none;margin-bottom:16px;">
        ${(stage.defenseTools && stage.defenseTools.length) ? `
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${stage.defenseTools.map(t => `
              <div style="background:${stage.defenseMethod ? stage.defenseMethod.color : '#666'}25;border:1px solid ${stage.defenseMethod ? stage.defenseMethod.color : '#666'}55;color:${stage.defenseMethod ? stage.defenseMethod.color : '#fff'};padding:5px 10px;border-radius:14px;font-size:11px;font-weight:600;">
                ${eh(t)}
              </div>
            `).join('')}
          </div>
        ` : `<div style="font-size:11px;opacity:0.5;text-align:center;padding:12px;">Список инструментов не задан</div>`}
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
        <button onclick="nextKillChainStage()" ${stageId === activeScheme().stages.length ? 'disabled' : ''} style="flex:1;padding:12px;background:var(--accent-gradient);border:none;border-radius:10px;color:#000;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;${stageId === activeScheme().stages.length ? 'opacity:0.4;cursor:default;' : ''}">Вперёд →</button>
      </div>
    `;

  // Показываем панель с анимацией
  const panel = document.getElementById('arStageDetails');
  if (panel) {
    panel.style.display = 'block';
    const isDesktop = window.innerWidth >= 1024;
    if (isDesktop) {
      panel.style.transition = '';
      panel.style.transform = '';  // CSS берёт управление через класс
      setTimeout(() => {
        panel.classList.add('open');
        // Помечаем корень чтобы сдвинуть контент
        const root = document.getElementById('arSchemeRoot');
        if (root) root.classList.add('panel-visible');
      }, 10);
      detailsPanelOpen = true;
    } else {
      panel.classList.remove('open');
      setTimeout(() => {
        const panelHeight = panel.offsetHeight;
        panel.style.transform = `translateY(${panelHeight - 60}px)`;
        detailsPanelOpen = false;
      }, 10);
    }
  }

  // Ripple-эффект на выбранной ноде
  const selectedNode = document.getElementById('arNode' + stageId);
  if (selectedNode) {
    const ripple = document.createElement('div');
    ripple.style.cssText = `position:absolute;top:50%;left:50%;width:100%;height:100%;
      border-radius:50%;transform:translate(-50%,-50%) scale(1);
      background:rgba(0,212,255,0.3);animation:arRipple 0.6s ease-out forwards;
      pointer-events:none;z-index:2;`;
    selectedNode.style.position = 'relative';
    selectedNode.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);
  }
}

function closeKillChainStage() {
  arSelectedStage = null;
  // Сбросить визуальное состояние нод
  activeScheme().stages.forEach(s => {
    const node = document.getElementById('arNode' + s.id);
    if (!node) return;
    node.style.background = 'rgba(0,0,0,0.7)';
    node.style.borderColor = isKillChainStageStudied(s) ? '#10b981' : 'rgba(0,212,255,0.5)';
    node.style.transform = 'scale(1)';
    node.style.boxShadow = 'none';
  });
  const detailPanel = document.getElementById('arStageDetails');
  if (detailPanel) {
    detailPanel.classList.remove('open');
    detailPanel.style.display = 'none';
    // полный сброс инлайнов сайдбара
    ['top','bottom','left','right','width','maxHeight','height','borderRadius','borderTop','borderLeft','transform'].forEach(p => detailPanel.style[p] = '');
  }
  const root = document.getElementById('arSchemeRoot');
  if (root) root.classList.remove('panel-visible');
}

function prevKillChainStage() {
  if (arSelectedStage && arSelectedStage > 1) {
    selectKillChainStage(arSelectedStage - 1);
  }
}

function nextKillChainStage() {
  if (arSelectedStage && arSelectedStage < activeScheme().stages.length) {
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
let readerCurrentPageText = '';  // текст текущей страницы для AI-ассистента
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
    // новые
    'ach_finish_1':  ICONS.check,
    'books_5':       ICONS.book,
    'books_10':      ICONS.book,
    'finish_5':      ICONS.check,
    'ach_note_1':    ICONS.achReview,
    'quiz_5':        ICONS.achQuiz,
    'quiz_10':       ICONS.achQuiz,
    'quiz_perfect':  ICONS.star,
    'review_5':      ICONS.achReview,
    'xp_500':        ICONS.achXp,
    'xp_5000':       ICONS.achXp,
    'streak_3':      ICONS.fire,
    'streak_7':      ICONS.fire,
    'streak_30':     ICONS.fire,
    'ach_level_test': ICONS.target,
    // дополнительный набор
    'books_25':       ICONS.book,
    'finish_10':      ICONS.check,
    'finish_25':      ICONS.check,
    'quiz_25':        ICONS.achQuiz,
    'quiz_perfect_5': ICONS.star,
    'review_10':      ICONS.achReview,
    'streak_14':      ICONS.fire,
    'streak_100':     ICONS.fire,
    'xp_2500':        ICONS.achXp,
    'xp_10000':       ICONS.achXp,
  };
  return map[code] || ICONS.target;  // fallback на мишень, если код не знаем
}

function renderAchievementsInProfile() {
  const l = document.getElementById('achievementsList');
  if (!l) return;
  const owned = state.gamification.achievementsOwned || [];
  const catalog = state.gamification.achievementsCatalog || [];
  const ownedCodes = new Set(owned.map(a => a.code));

  if (!owned.length && !catalog.length) {
    l.innerHTML = '<span style="font-size:10px;color:var(--text-muted);">Нет достижений</span>';
    return;
  }

  // Сначала полученные (ярко), затем остальные из каталога (приглушённо — как цели).
  const lockedList = catalog.filter(a => !ownedCodes.has(a.code));
  const ownedHtml = owned.map(a =>
    `<span class="achievement-badge ${a.tier}" title="${eh(a.description)}"><span style="display:inline-flex;vertical-align:middle;margin-right:4px;">${getAchievementIcon(a.code)}</span>${eh(a.name)}</span>`
  ).join('');
  const lockedHtml = lockedList.map(a =>
    `<span class="achievement-badge ${a.tier} locked" title="${eh(a.description)}"><span style="display:inline-flex;vertical-align:middle;margin-right:4px;">${getAchievementIcon(a.code)}</span>${eh(a.name)}</span>`
  ).join('');

  l.innerHTML = ownedHtml + lockedHtml;
}

// ===== Рекомендации по подразделению (#10) =====
// Каждое подразделение → ключевые слова тем. Сопоставляем с категориями книг
// в каталоге (регистронезависимо, по вхождению). Коды и полные названия — оба варианта.
const DEPARTMENT_TOPICS = {
  'ЦКЗ':   ['soc', 'мониторинг', 'incident', 'инцидент', 'threat', 'ВПО', 'malware', 'форензик', 'forensic', 'siem', 'сетев', 'анализ'],
  'ДПМ':   ['мошенничес', 'fraud', 'социальн', 'social', 'osint', 'фишинг', 'phishing', 'поведенч'],
  'УБД':   ['данны', 'data', 'dlp', 'приватнос', 'privacy', 'субд', 'database', 'классификац', 'gdpr'],
  'УКИИ':  ['ии', 'ai', 'machine learning', 'ml', 'нейросет', 'adversarial', 'модел'],
  'УКАИ':  ['криптограф', 'crypto', 'pki', 'tls', 'iam', 'аутентификац', 'идентификац', 'zero trust', 'ключ'],
  'УМК':   ['методолог', 'governance', 'compliance', 'риск', 'risk', 'дизайн', 'ux', 'метрик', 'nist'],
  'УЭК':   ['пентест', 'pentest', 'red team', 'эксплуатац', 'уязвим', 'web', 'веб', 'exploit', 'devops', 'devsecops'],
  'ЦКГ':   ['архитектур', 'стратег', 'лидер', 'ciso', 'enterprise', 'программ', 'devsecops', 'управлени'],
  'ЦУПКБ': ['продукт', 'product', 'vendor', 'рынок', 'mvp', 'управлени'],
  'ЦВВ':   ['коммуникац', 'переговор', 'влияни', 'изменени', 'команд', 'взаимодейств', 'поддержк'],
};

// Возвращает ключевые слова тем для текущего пользователя по его подразделению.
function departmentTopicKeywords() {
  const dep = (state.currentUser && state.currentUser.department) || '';
  if (!dep) return null;
  // Сопоставляем по коду в начале строки (ЦКЗ, ДПМ, ...) либо по подстроке.
  const upper = dep.toUpperCase();
  for (const code of Object.keys(DEPARTMENT_TOPICS)) {
    if (upper.startsWith(code) || upper.includes(code)) return DEPARTMENT_TOPICS[code];
  }
  return null; // «Другое» / не распознано → рекомендуем по уровню (см. ниже)
}

function bookMatchesDepartment(book, keywords) {
  if (!keywords) return false;
  const hay = ((book.categories || []).join(' ') + ' ' + (book.title || '') + ' ' + (book.author || '')).toLowerCase();
  return keywords.some(k => hay.includes(k));
}

// Для «Другое» / внешних людей — рекомендуем по уровню знаний (cyber_level).
// Ключевые слова сложности сопоставляем с темами книг.
const LEVEL_TOPICS = {
  gate_guardian:    ['основ', 'введен', 'beginner', 'для начинающих', 'азбук', 'чайник', 'basics', 'fundamental'],
  scout:            ['основ', 'practical', 'практическ', 'hands-on', 'introduction', 'web', 'сет'],
  stronghold:       ['security engineering', 'pentest', 'пентест', 'attacking', 'cloud', 'практическ', 'defense', 'защит'],
  shadow_architect: ['advanced', 'продвинут', 'architecture', 'архитектур', 'apt', 'red team', 'exploit', 'reverse'],
  abyss_warden:     ['advanced', 'architecture', 'архитектур', 'cyberwar', 'нулев', 'zero day', 'research', 'эксперт', 'strategy'],
};

function levelTopicKeywords() {
  const lvl = state.currentUser && state.currentUser.cyber_level;
  if (!lvl) return null;
  return LEVEL_TOPICS[lvl] || null;
}

function getRecommendations(limit = 5) {
  if (!state.currentUser) return [];
  const depKeywords = departmentTopicKeywords();
  // Если подразделение не распознано (или «Другое») — рекомендуем по уровню знаний.
  const levelKeywords = depKeywords ? null : levelTopicKeywords();

  const ub = Object.entries(state.mylist || {}).filter(([, s]) => ['reading', 'completed', 'liked'].includes(s)).map(([id]) => parseInt(id));
  const cats = new Set(), auths = new Set();
  ub.forEach(id => {
    const b = state.books.find(x => x.id === id);
    if (b) { (b.categories || []).forEach(c => cats.add(c)); auths.add(b.author); }
  });

  return state.books.filter(b => !ub.includes(b.id))
    .map(b => {
      const bookCats = b.categories || [];
      const hasMatchingCategory = bookCats.some(c => cats.has(c));
      const depMatch = bookMatchesDepartment(b, depKeywords);
      const lvlMatch = bookMatchesDepartment(b, levelKeywords);
      const score = (depMatch ? 60 : 0)               // приоритет — профиль подразделения
                  + (lvlMatch ? 50 : 0)                 // либо по уровню (для «Другое»)
                  + (hasMatchingCategory ? 40 : 0)      // затем — личная история
                  + (auths.has(b.author) ? 25 : 0)
                  + (b.popularity || 0) / 20;
      return { b, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.b);
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

// ===== Полнотекстовый поиск по содержимому книг (H) =====
async function runFullTextSearch() {
  const input = document.getElementById('searchInput');
  const q = (input?.value || '').trim();
  if (q.length < 2) { showToast('Введите минимум 2 символа'); return; }

  const container = document.getElementById('booksContainer') || document.getElementById('homeBooksGrid');
  // показываем оверлей результатов
  let panel = document.getElementById('fullTextResults');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'fullTextResults';
    panel.style.cssText = 'margin-top:14px;';
    const anchor = document.getElementById('sectionResume') || container;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor);
    else if (container) container.parentNode.insertBefore(panel, container);
  }
  panel.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">Ищу «${eh(q)}»…</div>`;

  try {
    const res = await api.library.searchBooks(q, 20);
    renderFullTextResults(res);
  } catch (e) {
    panel.innerHTML = `<div style="text-align:center;padding:20px;color:#ef4444;font-size:13px;">Ошибка поиска. ${eh(e?.detail || '')}</div>`;
  }
}

function renderFullTextResults(res) {
  const panel = document.getElementById('fullTextResults');
  if (!panel) return;
  if (!res.hits || !res.hits.length) {
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div class="section-title">Поиск: «${eh(res.query)}»</div>
        <button onclick="clearFullTextSearch()" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:12px;">Очистить</button>
      </div>
      <div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">Ничего не найдено. Возможно, книги ещё не проиндексированы (админ → «Переиндексировать»).</div>`;
    return;
  }
  const matchLabel = { meta: 'в описании', content: 'в тексте', both: 'в описании и тексте' };
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <div class="section-title">Найдено: ${res.total} по «${eh(res.query)}»</div>
      <button onclick="clearFullTextSearch()" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:12px;">Очистить</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${res.hits.map(h => `
        <div onclick="openBookDetail(${h.book_id})" style="display:flex;gap:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px;cursor:pointer;">
          <div style="width:46px;height:62px;border-radius:8px;overflow:hidden;flex-shrink:0;background:var(--bg-primary);">
            ${h.has_cover ? `<img src="${api.books.coverUrl(h.book_id)}" alt="" style="width:100%;height:100%;object-fit:cover;">` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:20px;">📕</div>`}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:600;">${eh(h.title)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin:2px 0 4px;">${eh(h.author)} · совпадение ${matchLabel[h.matched_in] || ''}</div>
            ${h.pages && h.pages.length ? h.pages.map(p => `
              <div style="font-size:11px;color:var(--text-secondary);background:var(--bg-primary);border-radius:6px;padding:5px 8px;margin-top:4px;line-height:1.4;">
                <span style="color:var(--accent);font-weight:600;">с. ${p.page}:</span> …${p.snippet}…
                <button onclick="event.stopPropagation();askAiAboutSnippet(${h.book_id}, ${p.page}, '${_encodeSnippet(p.snippet)}', '${_encodeSnippet(h.title)}')" style="display:block;margin-top:4px;background:none;border:none;color:var(--accent);cursor:pointer;font-size:10px;padding:0;font-family:inherit;">✨ Спросить AI про этот фрагмент</button>
              </div>`).join('') : ''}
          </div>
        </div>`).join('')}
    </div>`;
}

// убирает <b>-теги и кодирует для безопасной передачи в onclick
function _encodeSnippet(s) {
  const clean = String(s || '').replace(/<\/?b>/g, '');
  return encodeURIComponent(clean).replace(/'/g, '%27');
}

function askAiAboutSnippet(bookId, page, encSnippet, encTitle) {
  const snippet = decodeURIComponent(encSnippet);
  const title = decodeURIComponent(encTitle);
  // переходим к ассистенту и задаём вопрос с контекстом фрагмента
  navigateTo('assistant');
  setTimeout(() => {
    const surface = assistantSurface('full');
    const prompt = `Объясни простыми словами этот фрагмент из книги «${title}» (стр. ${page}):\n\n«${snippet}»\n\nЧто это означает и почему это важно?`;
    assistantSend(surface, prompt);
  }, 150);
}

function clearFullTextSearch() {
  const panel = document.getElementById('fullTextResults');
  if (panel) panel.remove();
  const input = document.getElementById('searchInput');
  if (input) { input.value = ''; renderHome(); }
}

async function openAdminLogs() {
  const ex = document.getElementById('adminLogsModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'adminLogsModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  m.innerHTML = `<div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:560px;width:100%;max-height:80vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <h3 style="font-size:15px;font-weight:700;color:var(--accent);">Журнал действий</h3>
      <button onclick="document.getElementById('adminLogsModal').remove()" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;">✕</button>
    </div>
    <div id="adminLogsBody" style="font-size:13px;color:var(--text-muted);text-align:center;padding:16px;">Загрузка…</div>
  </div>`;
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  document.body.appendChild(m);
  try {
    const logs = await api.library.adminLogs(100);
    const body = document.getElementById('adminLogsBody');
    if (!logs.length) { body.innerHTML = '<div style="padding:16px;color:var(--text-muted);">Записей пока нет.</div>'; return; }
    const actionLabel = {
      book_create: '➕ Создание', book_update: '✏️ Изменение', book_delete: '🗑 Удаление',
      pdf_upload: '📄 Загрузка PDF', cover_upload: '🖼 Обложка', reindex: '🔍 Индексация',
    };
    body.style.textAlign = 'left'; body.style.padding = '0';
    body.innerHTML = logs.map(l => {
      const d = new Date(l.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `<div style="padding:9px 6px;border-bottom:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;gap:8px;">
          <span style="font-size:12px;color:var(--text-primary);">${actionLabel[l.action] || l.action}</span>
          <span style="font-size:10px;color:var(--text-muted);white-space:nowrap;">${d}</span>
        </div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${eh(l.detail || '')}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:1px;">${eh(l.admin || '—')}</div>
      </div>`;
    }).join('');
  } catch (e) {
    const body = document.getElementById('adminLogsBody');
    if (body) body.innerHTML = '<div style="padding:16px;color:#ef4444;">Не удалось загрузить журнал.</div>';
  }
}

let _certExam = null; // {token, category, questions, answers, index}

async function renderMyCertificates() {
  const el = document.getElementById('certMineList');
  if (!el) return;
  try {
    const certs = await api.library.certMine();
    if (!certs.length) { el.innerHTML = ''; return; }
    el.innerHTML = certs.map(c => `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;margin-bottom:6px;">
        <div><span style="color:var(--text-primary);font-weight:600;">${eh(c.category)}</span> <span style="color:var(--text-muted);font-size:11px;">· ${c.score}%</span></div>
        <button onclick="downloadCertificate('${encodeURIComponent(c.category).replace(/'/g, '')}')" style="background:rgba(0,212,255,0.15);border:none;color:var(--accent);border-radius:6px;padding:5px 12px;cursor:pointer;font-size:12px;font-family:inherit;">Скачать PDF</button>
      </div>`).join('');
  } catch (_) { el.innerHTML = ''; }
}

async function downloadCertificate(categoryEnc) {
  const category = decodeURIComponent(categoryEnc);
  try {
    const blob = await api.library.certPdfBlob(category);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'sertifikat_' + category + '.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (e) { showToast('Не удалось скачать сертификат'); }
}

function certModalShell(inner) {
  let modal = document.getElementById('certModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'certModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:2500;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `<div style="background:var(--bg-elevated);border-radius:14px;padding:22px;max-width:560px;width:96%;border:1px solid var(--border);max-height:90vh;overflow-y:auto;">${inner}</div>`;
  return modal;
}

function closeCertModal() {
  const m = document.getElementById('certModal');
  if (m) m.remove();
  _certExam = null;
}

async function openCertificationModal() {
  certModalShell('<div style="text-align:center;padding:30px;color:var(--text-secondary);">Загрузка тем…</div>');
  try {
    const cats = await api.library.certCategories();
    const options = cats.map(c => `<option value="${eh(c)}">${eh(c)}</option>`).join('');
    certModalShell(`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="font-size:16px;font-weight:700;">Аттестация</h3>
        <button onclick="closeCertModal()" style="background:var(--bg-card);border:1px solid var(--border);color:var(--text-secondary);width:28px;height:28px;border-radius:8px;cursor:pointer;">✕</button>
      </div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">Выберите тему. Будет сгенерирован тест из 50 вопросов (это может занять до минуты). Для прохождения нужно 85% правильных.</p>
      <select id="certCategorySelect" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);margin-bottom:16px;font-family:inherit;">${options}</select>
      <button id="certStartBtn" style="width:100%;background:linear-gradient(135deg,#00d4ff,#7b61ff);border:none;color:#fff;padding:12px;border-radius:10px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:700;">Начать тест</button>
    `);
    document.getElementById('certStartBtn').onclick = startCertExam;
  } catch (e) {
    certModalShell('<div style="padding:20px;color:#ef4444;">Не удалось загрузить темы<br><button onclick="closeCertModal()" style="margin-top:12px;background:var(--bg-card);border:1px solid var(--border);color:var(--text-primary);padding:8px 16px;border-radius:8px;cursor:pointer;">Закрыть</button></div>');
  }
}

async function startCertExam() {
  const category = document.getElementById('certCategorySelect').value;
  certModalShell(`<div style="text-align:center;padding:40px;color:var(--text-secondary);"><div style="font-size:32px;margin-bottom:12px;">⏳</div>Генерируем тест по теме<br><b style="color:var(--text-primary);">${eh(category)}</b><br><span style="font-size:12px;color:var(--text-muted);">Это может занять до минуты…</span></div>`);
  try {
    const data = await api.library.certStartExam(category);
    _certExam = { token: data.exam_token, category: data.category, questions: data.questions, answers: new Array(data.questions.length).fill(-1), index: 0 };
    renderCertQuestion();
  } catch (e) {
    const msg = (e && e.detail) || 'Не удалось сгенерировать тест';
    certModalShell(`<div style="padding:20px;color:#ef4444;">${eh(msg)}<br><button onclick="closeCertModal()" style="margin-top:12px;background:var(--bg-card);border:1px solid var(--border);color:var(--text-primary);padding:8px 16px;border-radius:8px;cursor:pointer;">Закрыть</button></div>`);
  }
}

function renderCertQuestion() {
  const ex = _certExam;
  if (!ex) return;
  const q = ex.questions[ex.index];
  const total = ex.questions.length;
  const opts = q.options.map((o, i) => `
    <button onclick="answerCertQuestion(${i})" style="display:block;width:100%;text-align:left;margin-bottom:8px;padding:11px 14px;border-radius:8px;border:1px solid ${ex.answers[ex.index] === i ? 'var(--accent)' : 'var(--border)'};background:${ex.answers[ex.index] === i ? 'rgba(0,212,255,0.12)' : 'var(--bg-card)'};color:var(--text-primary);cursor:pointer;font-family:inherit;font-size:13px;">${eh(o)}</button>`).join('');
  const answered = ex.answers.filter(a => a >= 0).length;
  certModalShell(`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <span style="font-size:12px;color:var(--text-muted);">Вопрос ${ex.index + 1} из ${total}</span>
      <button onclick="closeCertModal()" style="background:var(--bg-card);border:1px solid var(--border);color:var(--text-secondary);width:26px;height:26px;border-radius:7px;cursor:pointer;">✕</button>
    </div>
    <div style="height:4px;background:var(--bg-card);border-radius:2px;margin-bottom:16px;overflow:hidden;"><div style="height:100%;width:${(answered / total * 100)}%;background:var(--accent);"></div></div>
    <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:16px;">${eh(q.question)}</div>
    ${opts}
    <div style="display:flex;justify-content:space-between;gap:8px;margin-top:16px;">
      <button onclick="certNav(-1)" ${ex.index === 0 ? 'disabled' : ''} style="flex:1;background:var(--bg-card);border:1px solid var(--border);color:var(--text-primary);padding:10px;border-radius:8px;cursor:pointer;font-family:inherit;opacity:${ex.index === 0 ? '0.4' : '1'};">← Назад</button>
      ${ex.index < total - 1
        ? `<button onclick="certNav(1)" style="flex:1;background:var(--bg-card);border:1px solid var(--border);color:var(--text-primary);padding:10px;border-radius:8px;cursor:pointer;font-family:inherit;">Далее →</button>`
        : `<button onclick="submitCertExam()" style="flex:1;background:linear-gradient(135deg,#22c55e,#16a34a);border:none;color:#fff;padding:10px;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:700;">Завершить</button>`}
    </div>
  `);
}

function answerCertQuestion(i) {
  if (!_certExam) return;
  _certExam.answers[_certExam.index] = i;
  renderCertQuestion();
}

function certNav(d) {
  if (!_certExam) return;
  _certExam.index = Math.max(0, Math.min(_certExam.questions.length - 1, _certExam.index + d));
  renderCertQuestion();
}

async function submitCertExam() {
  const ex = _certExam;
  if (!ex) return;
  const unanswered = ex.answers.filter(a => a < 0).length;
  if (unanswered > 0 && !confirm(`Без ответа: ${unanswered}. Они будут засчитаны как неверные. Завершить?`)) return;
  certModalShell('<div style="text-align:center;padding:40px;color:var(--text-secondary);">Проверяем ответы…</div>');
  try {
    const res = await api.library.certSubmitExam(ex.token, ex.answers);
    if (res.needs_full_name) {
      certModalShell(`
        <h3 style="font-size:16px;font-weight:700;margin-bottom:12px;">Заполните ФИО</h3>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">Вы прошли тест (${res.score}%)! Для сертификата укажите ФИО — оно появится в документе.</p>
        <input type="text" id="certFullName" placeholder="Фамилия Имя Отчество" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);margin-bottom:14px;font-family:inherit;">
        <button id="certSaveNameBtn" style="width:100%;background:linear-gradient(135deg,#00d4ff,#7b61ff);border:none;color:#fff;padding:11px;border-radius:10px;cursor:pointer;font-family:inherit;font-weight:700;">Сохранить и получить сертификат</button>
      `);
      document.getElementById('certSaveNameBtn').onclick = async () => {
        const fio = document.getElementById('certFullName').value.trim();
        if (fio.length < 3) return showToast('Введите ФИО');
        try {
          await api.updateMe({ full_name: fio });
          if (state.currentUser) state.currentUser.full_name = fio;
          // повторно отправляем экзамен — теперь ФИО есть
          const res2 = await api.library.certSubmitExam(ex.token, ex.answers);
          if (res2.passed && !res2.needs_full_name) {
            showCertResult(res2.score, ex.category);
          } else {
            showToast('Экзамен истёк, пройдите заново');
            closeCertModal();
          }
        } catch (e) { showToast('Не удалось сохранить'); }
      };
    } else if (res.passed) {
      showCertResult(res.score, ex.category);
    } else {
      certModalShell(`
        <div style="text-align:center;padding:20px;">
          <div style="font-size:36px;margin-bottom:10px;">😔</div>
          <h3 style="font-size:18px;font-weight:700;margin-bottom:8px;">Не пройдено</h3>
          <p style="color:var(--text-secondary);margin-bottom:6px;">Результат: ${res.score}% (${res.correct_count} из ${res.total})</p>
          <p style="font-size:12px;color:var(--text-muted);margin-bottom:18px;">Для сертификата нужно 85%. Попробуйте ещё раз после изучения материалов.</p>
          <button onclick="closeCertModal()" style="background:var(--bg-card);border:1px solid var(--border);color:var(--text-primary);padding:10px 20px;border-radius:8px;cursor:pointer;font-family:inherit;">Закрыть</button>
        </div>`);
    }
  } catch (e) {
    showToast('Ошибка проверки');
    closeCertModal();
  }
}

function showCertResult(score, category) {
  certModalShell(`
    <div style="text-align:center;padding:20px;">
      <div style="font-size:44px;margin-bottom:10px;">🎉</div>
      <h3 style="font-size:20px;font-weight:800;margin-bottom:8px;">Поздравляем!</h3>
      <p style="color:var(--text-secondary);margin-bottom:6px;">Вы прошли аттестацию по теме<br><b style="color:var(--text-primary);">${eh(category)}</b></p>
      <p style="color:var(--accent);font-weight:700;font-size:18px;margin-bottom:18px;">${score}%</p>
      <button onclick="downloadCertificate('${encodeURIComponent(category).replace(/'/g, '')}');closeCertModal();renderMyCertificates();" style="background:linear-gradient(135deg,#00d4ff,#7b61ff);border:none;color:#fff;padding:11px 22px;border-radius:10px;cursor:pointer;font-family:inherit;font-weight:700;margin-bottom:10px;">Скачать сертификат</button>
      <br><button onclick="closeCertModal();renderMyCertificates();" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-family:inherit;font-size:12px;">Закрыть</button>
    </div>`);
}

function openCreateUserModal() {
  let modal = document.getElementById('createUserModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'createUserModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div style="background:var(--bg-elevated);border-radius:14px;padding:22px;max-width:420px;width:95%;border:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="font-size:16px;font-weight:700;">Создать пользователя</h3>
        <button onclick="document.getElementById('createUserModal').remove()" style="background:var(--bg-card);border:1px solid var(--border);color:var(--text-secondary);width:28px;height:28px;border-radius:8px;cursor:pointer;">✕</button>
      </div>
      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;">Пользователь создаётся сразу активным. Передайте ему логин и пароль.</p>
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px;">Логин (латиница, цифры, _)</label>
      <input type="text" id="cuUsername" autocomplete="off" style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);margin-bottom:10px;font-family:inherit;">
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px;">Пароль (минимум 8 символов)</label>
      <input type="text" id="cuPassword" autocomplete="off" style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);margin-bottom:10px;font-family:inherit;">
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px;">ФИО</label>
      <input type="text" id="cuFullName" style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);margin-bottom:10px;font-family:inherit;">
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px;">Подразделение</label>
      <input type="text" id="cuDepartment" style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);margin-bottom:18px;font-family:inherit;">
      <button id="cuCreateBtn" style="width:100%;background:linear-gradient(135deg,#00d4ff,#7b61ff);border:none;color:#fff;padding:12px;border-radius:10px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:700;">Создать</button>
    </div>`;

  document.getElementById('cuCreateBtn').onclick = async () => {
    const btn = document.getElementById('cuCreateBtn');
    const username = document.getElementById('cuUsername').value.trim();
    const password = document.getElementById('cuPassword').value;
    const full_name = document.getElementById('cuFullName').value.trim() || null;
    const department = document.getElementById('cuDepartment').value.trim() || null;
    if (username.length < 3) return showToast('Логин: минимум 3 символа');
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return showToast('Логин: только латиница, цифры и _');
    if (password.length < 8) return showToast('Пароль: минимум 8 символов');
    btn.disabled = true; btn.textContent = 'Создаю…';
    try {
      await api.library.adminCreateUser({ username, password, full_name, department });
      showToast('Пользователь создан');
      document.getElementById('createUserModal').remove();
      // обновим список пользователей
      try {
        state._adminUsers = await api.library.adminUsers();
        renderAdminUsersWithFilter();
      } catch (_) {}
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Создать';
      const msg = (e && (e.detail || (e.body && e.body.detail))) || 'Не удалось создать пользователя';
      showToast(msg);
    }
  };
}

function openExportModal() {
  let modal = document.getElementById('exportModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'exportModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div style="background:var(--bg-elevated);border-radius:14px;padding:22px;max-width:420px;width:95%;border:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="font-size:16px;font-weight:700;">Выгрузка в Excel</h3>
        <button onclick="document.getElementById('exportModal').remove()" style="background:var(--bg-card);border:1px solid var(--border);color:var(--text-secondary);width:28px;height:28px;border-radius:8px;cursor:pointer;">✕</button>
      </div>
      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:16px;">Прочитанные книги по сотрудникам за период (ФИО, подразделение, книги). Оставьте даты пустыми — выгрузится всё.</p>
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px;">Дата с</label>
      <input type="date" id="exportDateFrom" style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);margin-bottom:12px;font-family:inherit;">
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px;">Дата по</label>
      <input type="date" id="exportDateTo" style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);margin-bottom:18px;font-family:inherit;">
      <button id="exportRunBtn" style="width:100%;background:linear-gradient(135deg,#22c55e,#16a34a);border:none;color:#fff;padding:12px;border-radius:10px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:700;">Скачать Excel</button>
    </div>`;

  document.getElementById('exportRunBtn').onclick = async () => {
    const btn = document.getElementById('exportRunBtn');
    const from = document.getElementById('exportDateFrom').value || null;
    const to = document.getElementById('exportDateTo').value || null;
    btn.disabled = true;
    btn.textContent = 'Формирую…';
    try {
      const blob = await api.library.adminExportReading(from, to);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'aegis_reading' + (from || to ? '_' + (from || 'нач') + '_' + (to || 'кон') : '') + '.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      document.getElementById('exportModal').remove();
      showToast('Файл выгружен');
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Скачать Excel';
      console.error('Ошибка экспорта:', err);
      showToast('Не удалось сформировать файл');
    }
  };
}

async function openPendingUsersModal() {
  let modal = document.getElementById('pendingUsersModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'pendingUsersModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div style="background:var(--bg-elevated);border-radius:14px;padding:20px;max-width:560px;width:95%;border:1px solid var(--border);max-height:85vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h3 style="font-size:16px;font-weight:700;">Заявки на регистрацию</h3>
        <button onclick="document.getElementById('pendingUsersModal').remove()" style="background:var(--bg-card);border:1px solid var(--border);color:var(--text-secondary);width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:14px;">✕</button>
      </div>
      <div id="pendingUsersList" style="font-size:13px;color:var(--text-secondary);">Загрузка…</div>
    </div>`;

  try {
    const users = await api.library.adminPendingUsers();
    const list = document.getElementById('pendingUsersList');
    if (!users.length) {
      list.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted);">Нет заявок на рассмотрении</div>';
    } else {
      list.innerHTML = users.map(u => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;">
          <div style="min-width:0;flex:1;">
            <div style="font-weight:600;color:var(--text-primary);">${eh(u.full_name || u.username)}</div>
            <div style="font-size:11px;color:var(--text-muted);">@${eh(u.username)} · ${eh(u.email || '—')}</div>
            ${u.department ? `<div style="font-size:11px;color:var(--accent);">${eh(u.department)}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button onclick="approvePendingUser(${u.id}, this)" style="background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.4);color:#22c55e;border-radius:7px;padding:6px 12px;cursor:pointer;font-size:12px;font-family:inherit;font-weight:600;">Одобрить</button>
            <button onclick="rejectPendingUser(${u.id}, this)" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);color:#ef4444;border-radius:7px;padding:6px 12px;cursor:pointer;font-size:12px;font-family:inherit;font-weight:600;">Отклонить</button>
          </div>
        </div>`).join('');
    }
    updatePendingBadge(users.length);
  } catch (err) {
    console.error('Ошибка загрузки заявок:', err, err && err.status, err && err.body);
    const detail = (err && (err.detail || (err.body && err.body.detail))) || (err && err.message) || '';
    document.getElementById('pendingUsersList').innerHTML = '<div style="color:#ef4444;padding:16px;">Не удалось загрузить заявки' + (detail ? '<br><span style="font-size:11px;color:var(--text-muted);">' + eh(String(detail)) + '</span>' : '') + '</div>';
  }
}

async function approvePendingUser(userId, btn) {
  btn.disabled = true; btn.textContent = '…';
  try {
    await api.library.adminApproveUser(userId);
    btn.closest('div[style*="justify-content:space-between"]').parentElement.remove();
    showToast('Пользователь одобрен');
    refreshPendingBadge();
    const list = document.getElementById('pendingUsersList');
    if (list && !list.querySelector('button')) {
      list.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted);">Нет заявок на рассмотрении</div>';
    }
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Одобрить';
    showToast('Не удалось одобрить');
  }
}

async function rejectPendingUser(userId, btn) {
  if (!confirm('Отклонить заявку? Аккаунт будет удалён.')) return;
  btn.disabled = true; btn.textContent = '…';
  try {
    await api.library.adminRejectUser(userId);
    btn.closest('div[style*="justify-content:space-between"]').parentElement.remove();
    showToast('Заявка отклонена');
    refreshPendingBadge();
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Отклонить';
    showToast('Не удалось отклонить');
  }
}

function updatePendingBadge(count) {
  const badge = document.getElementById('pendingUsersBadge');
  if (!badge) return;
  if (count > 0) { badge.textContent = count; badge.style.display = 'inline-block'; }
  else badge.style.display = 'none';
}

async function refreshPendingBadge() {
  if (!state.currentUser || state.currentUser.role !== 'admin') return;
  try {
    const users = await api.library.adminPendingUsers();
    updatePendingBadge(users.length);
  } catch (_) {}
}

function collectArTopics() {
  // Собираем уникальные relatedCategory из всех AR-схем
  const topics = new Set();
  try {
    Object.values(AR_SCHEMES || {}).forEach(scheme => {
      const stages = (scheme && scheme.stages) || [];
      stages.forEach(st => { if (st.relatedCategory) topics.add(st.relatedCategory); });
    });
  } catch (_) {}
  return Array.from(topics);
}

async function aiMatchArBooksUI() {
  const topics = collectArTopics();
  if (!topics.length) { showToast('Не удалось собрать темы AR-схем'); return; }
  if (!confirm(`ИИ проанализирует книги и подберёт подходящие к ${topics.length} темам AR-схем. Это может занять пару минут. Продолжить?`)) return;
  showToast('ИИ подбирает книги для AR-тем, подождите…');
  try {
    const res = await api.library.aiMatchArTopics(topics);
    showToast(`Готово: обновлено книг ${res.updated} из ${res.total}`);
    // обновим книги в состоянии, чтобы рекомендации в AR появились
    try { await loadBooksFromApi(); } catch (_) {}
  } catch (e) {
    const msg = (e && (e.detail || (e.body && e.body.detail))) || 'Не удалось подобрать книги';
    showToast(msg);
  }
}

async function generateMissingCoversUI() {
  const candidates = (state.books || []).filter(b => !b.has_cover && (b.has_pdf || b.format !== 'epub'));
  if (!candidates.length) {
    showToast('Все книги уже с обложками');
    return;
  }
  showConfirmModal({
    title: 'Создать обложки?',
    message: `Книг без обложки: ${candidates.length}. Для каждой будет скачан PDF и создана обложка из первой страницы. Это может занять время.`,
    confirmText: 'Создать',
    cancelText: 'Отмена',
    onConfirm: async () => {
      let done = 0, failed = 0;
      showToast('Создание обложек запущено…');
      for (const b of candidates) {
        try {
          const bytes = await api.books.fetchPdfBytes(b.id);
          const blob = await generateCoverFromPdf(new Blob([bytes], { type: 'application/pdf' }));
          if (blob) {
            const f = new File([blob], 'cover.jpg', { type: 'image/jpeg' });
            await api.books.uploadCover(b.id, f);
            done++;
          } else {
            failed++;
          }
        } catch (e) {
          failed++;
          console.warn('Обложка не создана для книги', b.id, e);
        }
      }
      showToast(`Обложки созданы: ${done}` + (failed ? ` · не удалось: ${failed}` : ''));
      await loadBooksFromApi();
      if (typeof renderAdminPanel === 'function') renderAdminPanel();
    },
  });
}

async function reindexAllBooksUI() {
  showConfirmModal({
    title: 'Переиндексировать все книги?',
    message: 'Будет извлечён текст из всех PDF для полнотекстового поиска. Индексация идёт в фоне — можно продолжать работу.',
    confirmText: 'Запустить',
    cancelText: 'Отмена',
    onConfirm: async () => {
      try {
        const res = await api.library.reindexAllBooks();
        if (res.started === false && res.reason === 'already_running') {
          showToast('Индексация уже идёт');
        } else {
          showToast('Индексация запущена');
        }
        showReindexProgress();
      } catch (e) {
        showToast(e && e.detail ? e.detail : 'Ошибка запуска индексации');
      }
    },
  });
}

function showReindexProgress() {
  const ex = document.getElementById('reindexProgressModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'reindexProgressModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  m.innerHTML = `<div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:16px;padding:22px;max-width:400px;width:100%;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <h3 style="font-size:15px;font-weight:700;color:var(--accent);">Индексация поиска</h3>
      <button onclick="stopReindexPolling();document.getElementById('reindexProgressModal').remove()" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;">✕</button>
    </div>
    <div id="reindexProgressBody">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Запуск…</div>
      <div style="height:8px;background:var(--bg-primary);border-radius:4px;overflow:hidden;">
        <div id="reindexBar" style="height:100%;width:0%;background:var(--accent-gradient);transition:width 0.4s;"></div>
      </div>
    </div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:10px;">Можно закрыть это окно — индексация продолжится в фоне.</div>
  </div>`;
  m.onclick = (e) => { if (e.target === m) { stopReindexPolling(); m.remove(); } };
  document.body.appendChild(m);
  startReindexPolling();
}

let _reindexPollTimer = null;
function stopReindexPolling() {
  if (_reindexPollTimer) { clearInterval(_reindexPollTimer); _reindexPollTimer = null; }
}
function startReindexPolling() {
  stopReindexPolling();
  const poll = async () => {
    try {
      const s = await api.library.reindexStatus();
      const body = document.getElementById('reindexProgressBody');
      if (!body) { stopReindexPolling(); return; }
      const bar = document.getElementById('reindexBar');
      if (bar) bar.style.width = (s.percent || 0) + '%';
      if (s.finished) {
        stopReindexPolling();
        body.innerHTML = `<div style="font-size:13px;color:#10b981;text-align:center;padding:8px;">
          ✓ Готово: ${s.done} книг, ${s.indexed_pages} страниц${s.errors ? `, ошибок: ${s.errors}` : ''}
        </div>`;
      } else if (s.running) {
        body.querySelector('div').textContent = `Обработано ${s.done} из ${s.total} книг (${s.percent}%)`;
      }
    } catch (e) {
      stopReindexPolling();
    }
  };
  poll();
  _reindexPollTimer = setInterval(poll, 1500);
}

// ===== Обсуждения книги (комментарии + ответы) =====
let _replyingTo = null;

async function renderDiscussion() {
  const c = document.getElementById('detailTabDiscussion');
  if (!c || !currentBookId) return;
  c.innerHTML = `
    <div style="margin-bottom:14px;">
      <textarea id="discussInput" placeholder="Написать комментарий..." rows="3" style="width:100%;box-sizing:border-box;padding:12px;background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;color:var(--text-primary);font-family:inherit;font-size:14px;resize:vertical;"></textarea>
      <div id="discussReplyHint" style="display:none;font-size:11px;color:var(--accent);margin-top:4px;"></div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button onclick="submitComment()" class="set-save-btn" style="flex:1;">Отправить</button>
        <button id="discussCancelReply" onclick="cancelReply()" style="display:none;padding:0 16px;background:transparent;border:1px solid var(--border);border-radius:10px;color:var(--text-secondary);cursor:pointer;font-family:inherit;font-size:13px;">Отмена</button>
      </div>
    </div>
    <div id="discussList" style="font-size:13px;color:var(--text-muted);text-align:center;padding:16px;">Загрузка...</div>
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
      list.innerHTML = '<div style="padding:20px;color:var(--text-muted);">Пока нет комментариев. Будьте первым!</div>';
      return;
    }
    list.style.textAlign = 'left';
    list.style.padding = '0';
    list.innerHTML = comments.map(renderCommentNode).join('');
  } catch (e) {
    list.innerHTML = '<div style="padding:16px;color:#ef4444;">Не удалось загрузить обсуждение.</div>';
  }
}

function _commentBubble(c, isReply) {
  const name = eh(c.author.full_name || c.author.username);
  const when = _formatCommentDate(c.created_at);
  const avatar = c.author.has_avatar
    ? `<img src="${api.users.avatarUrl(c.author.id)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
    : `<div style="width:32px;height:32px;border-radius:50%;background:var(--accent-gradient);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;flex-shrink:0;">${name.charAt(0).toUpperCase()}</div>`;
  return `
    <div style="display:flex;gap:10px;padding:10px 0;${isReply ? 'margin-left:42px;' : ''}">
      ${avatar}
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-size:13px;font-weight:600;color:var(--text-primary);">${name}</span>
          <span style="font-size:10px;color:var(--text-muted);">${when}</span>
        </div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin:3px 0 6px;white-space:pre-wrap;word-break:break-word;">${eh(c.text)}</div>
        <div style="display:flex;gap:14px;">
          ${!isReply ? `<button onclick="startReply(${c.id}, '${name.replace(/'/g, "\\'")}')" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:11px;padding:0;">Ответить</button>` : ''}
          ${c.can_delete ? `<button onclick="deleteComment(${c.id})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:11px;padding:0;">Удалить</button>` : ''}
        </div>
      </div>
    </div>`;
}

function renderCommentNode(c) {
  const replies = (c.replies || []).map(r => _commentBubble(r, true)).join('');
  return `<div style="border-bottom:1px solid var(--border);padding-bottom:4px;">${_commentBubble(c, false)}${replies}</div>`;
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

async function adaptAnnotation(a) {
  return {
    id: a.id,
    type: a.type,
    text: await decryptNote(a.selected_text),
    note: await decryptNote(a.note_text || ''),
    page: a.page,
    position: a.position || {},
    date: a.created_at,
  };
}

async function getAnnotations(bookId) {
  if (annotationsCache[bookId]) return annotationsCache[bookId];
  try {
    const list = await api.library.annotations(bookId);
    const adapted = await Promise.all(list.map(adaptAnnotation));
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
    const encText = await encryptNote(text);
    const created = await api.library.addAnnotation(bookId, {
      type: 'highlight',
      page: pageNum,
      selected_text: encText,
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

// ============ ШИФРОВАНИЕ ЗАМЕТОК (client-side, AES-GCM) ============
// Ключ выводится из пароля пользователя при входе и держится только в памяти.
// Сервер хранит лишь шифротекст и не может его расшифровать.
let _noteKey = null; // CryptoKey | null
const NOTE_ENC_PREFIX = 'enc:v1:'; // маркер зашифрованного значения

async function deriveNoteKey(password, username) {
  // PBKDF2 из пароля; соль привязана к username (стабильна на пользователя)
  try {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    const salt = enc.encode('aegis-notes-salt:' + (username || ''));
    _noteKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  } catch (e) {
    console.warn('Не удалось вывести ключ шифрования заметок:', e);
    _noteKey = null;
  }
}

function clearNoteKey() { _noteKey = null; }

async function encryptNote(plain) {
  // Возвращает строку enc:v1:<base64(iv+ciphertext)>; при отсутствии ключа — исходный текст
  if (!_noteKey || plain == null || plain === '') return plain;
  try {
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, _noteKey, enc.encode(plain));
    const combined = new Uint8Array(iv.length + ct.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ct), iv.length);
    let bin = '';
    combined.forEach(b => bin += String.fromCharCode(b));
    return NOTE_ENC_PREFIX + btoa(bin);
  } catch (e) {
    console.warn('Ошибка шифрования заметки:', e);
    return plain;
  }
}

async function decryptNote(value) {
  // Расшифровывает enc:v1:...; обычный текст (старые незашифрованные) возвращает как есть
  if (value == null || typeof value !== 'string') return value;
  if (!value.startsWith(NOTE_ENC_PREFIX)) return value; // не зашифровано
  if (!_noteKey) return '🔒 (зашифровано — войдите заново для просмотра)';
  try {
    const bin = atob(value.slice(NOTE_ENC_PREFIX.length));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const iv = bytes.slice(0, 12);
    const ct = bytes.slice(12);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, _noteKey, ct);
    return new TextDecoder().decode(pt);
  } catch (e) {
    console.warn('Ошибка расшифровки заметки:', e);
    return '🔒 (не удалось расшифровать)';
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
  if (!_noteKey) {
    showToast('Для шифрования заметок войдите в аккаунт заново (введите пароль)');
  }
  try {
    const encText = await encryptNote(text);
    const encNote = await encryptNote(note || '');
    const created = await api.library.addAnnotation(bookId, {
      type: 'note',
      page: pageNum,
      selected_text: encText,
      note_text: encNote,
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

async function renderAnnotations() {
  if (isEpubMode) return;
  const layer = document.getElementById('annotationLayer');
  if (!layer || !currentBookId) return;
  const list = await getAnnotations(currentBookId);
  const onPage = list.filter(a => a.page === pdfCurrentPage);
  layer.innerHTML = onPage.map(a => a.type === 'highlight'
    ? `<div class="highlight-mark" style="left:${a.position?.x || 10}%;top:${a.position?.y || 10}%;width:${a.position?.w || 30}%;height:${a.position?.h || 3}%;background:${a.position?.color || '#fbbf24'}55;border-bottom:2px solid ${a.position?.color || '#fbbf24'};" title="${eh(a.text)}" onclick="showAnnotationDetail(${a.id})"></div>`
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

function _downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function _csvEscape(v) {
  const s = String(v == null ? '' : v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function exportAllUserData() {
  showToast('Собираю данные…');
  const u = state.currentUser || {};
  const out = {
    exported_at: new Date().toISOString(),
    format: 'aegis-user-data-v1',
    profile: {
      username: u.name, full_name: u.full_name || null, email: u.email || null,
      department: u.department || null, role: u.role || null,
      cyber_level: u.cyber_level || null, xp: state.gamification?.xp || 0,
      streak: state.gamification?.streakCount || 0,
    },
    mylist: [], reading_progress: [], achievements: [], quiz_attempts: [], annotations: [],
    settings: {
      theme: localStorage.getItem('aegis_app_theme') || 'dark',
      reading_goal: localStorage.getItem('aegis_reading_goal') || null,
      reader_font: localStorage.getItem('aegis_reader_font') || null,
      favorite_categories: getFavCategories(),
    },
  };

  // mylist + прогресс из state
  Object.entries(state.mylist || {}).forEach(([bid, status]) => {
    const b = (state.books || []).find(x => String(x.id) === String(bid));
    out.mylist.push({ book_id: Number(bid), title: b?.title || null, status });
  });
  Object.entries(state.readingProgress || {}).forEach(([bid, p]) => {
    out.reading_progress.push({ book_id: Number(bid), current_page: p.currentPage, total_pages: p.totalPages, started: p.started });
  });

  // ачивки
  (state.gamification?.achievementsOwned || []).forEach(a => out.achievements.push({ code: a.code, name: a.name || null }));

  // дозапрос с сервера: попытки тестов + аннотации по всем книгам из mylist
  try { out.quiz_attempts = (await api.library.myQuizAttempts()) || []; } catch (_) {}
  const bookIds = Object.keys(state.mylist || {});
  for (const bid of bookIds) {
    try {
      const ann = await api.library.annotations(Number(bid));
      (ann || []).forEach(a => out.annotations.push({
        book_id: Number(bid), page: a.page, type: a.type,
        text: a.selected_text, note: a.note_text || null,
      }));
    } catch (_) {}
  }

  _downloadBlob(JSON.stringify(out, null, 2), `aegis_my_data_${u.name || 'user'}.json`, 'application/json');
  if (navigator.vibrate) navigator.vibrate(15);
  showToast('Данные выгружены');
}

async function exportNotes() {
  if (!currentBookId) { showToast('Откройте книгу для экспорта заметок'); return; }
  const ann = await getAnnotations(currentBookId);
  if (!ann.length) { showToast('Нет заметок для экспорта'); return; }
  const ex = document.getElementById('exportFmtModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'exportFmtModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  const btn = (fmt, label, desc) => `<button onclick="doExportNotes('${fmt}')" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:8px;cursor:pointer;font-family:inherit;color:var(--text-primary);">
    <span style="font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--accent);font-size:13px;min-width:42px;">${fmt.toUpperCase()}</span>
    <span><span style="font-size:13px;font-weight:600;display:block;">${label}</span><span style="font-size:11px;color:var(--text-muted);">${desc}</span></span>
  </button>`;
  m.innerHTML = `<div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:380px;width:100%;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <h3 style="font-size:15px;font-weight:700;color:var(--accent);">Экспорт заметок</h3>
      <button onclick="document.getElementById('exportFmtModal').remove()" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;">&times;</button>
    </div>
    ${btn('pdf', 'PDF документ', 'Для печати и чтения')}
    ${btn('md', 'Markdown', 'Текст с разметкой')}
    ${btn('json', 'JSON', 'Для импорта в другие приложения')}
    ${btn('csv', 'CSV', 'Таблица для Excel')}
  </div>`;
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  document.body.appendChild(m);
}

async function doExportNotes(fmt) {
  const modal = document.getElementById('exportFmtModal');
  if (modal) modal.remove();
  const ann = await getAnnotations(currentBookId);
  const b = state.books.find(x => x.id === currentBookId);
  const title = b ? b.title : 'Книга';
  const safe = (title.replace(/[^a-z0-9а-яё]/gi, '_') || 'book');
  const sorted = [...ann].sort((a, b) => a.page - b.page);

  if (fmt === 'json') {
    const data = {
      book: title, author: b?.author || null,
      exported_at: new Date().toISOString(),
      annotations: sorted.map(a => ({ page: a.page, type: a.type, text: a.text, note: a.note || null })),
    };
    _downloadBlob(JSON.stringify(data, null, 2), `notes_${safe}.json`, 'application/json');
  } else if (fmt === 'csv') {
    let csv = 'Страница;Тип;Текст;Заметка\n';
    sorted.forEach(a => {
      csv += [a.page, a.type === 'note' ? 'Заметка' : 'Выделение', _csvEscape(a.text), _csvEscape(a.note || '')].join(';') + '\n';
    });
    _downloadBlob('\uFEFF' + csv, `notes_${safe}.csv`, 'text/csv;charset=utf-8');
  } else if (fmt === 'md') {
    let md = `# Заметки: ${title}\n\n`;
    sorted.forEach(a => {
      md += `## Стр. ${a.page}\n> ${a.text}\n\n`;
      if (a.type === 'note' && a.note) md += `Заметка: ${a.note}\n\n`;
      md += `---\n\n`;
    });
    _downloadBlob(md, `notes_${safe}.md`, 'text/markdown');
  } else if (fmt === 'pdf') {
    exportNotesPdf(title, b?.author, sorted);
  }
  if (navigator.vibrate) navigator.vibrate(12);
  if (fmt !== 'pdf') showToast('Заметки экспортированы!');
}

function exportNotesPdf(title, author, sorted) {
  const rows = sorted.map(a => `
    <div style="margin-bottom:14px;page-break-inside:avoid;">
      <div style="font-size:11px;color:#888;margin-bottom:3px;">Страница ${a.page} &middot; ${a.type === 'note' ? 'Заметка' : 'Выделение'}</div>
      <div style="border-left:3px solid #00b4d8;padding-left:10px;font-size:13px;">${eh(a.text)}</div>
      ${a.type === 'note' && a.note ? `<div style="margin-top:5px;font-size:13px;color:#333;"><b>Заметка:</b> ${eh(a.note)}</div>` : ''}
    </div>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Заметки: ${eh(title)}</title>
    <style>body{font-family:Arial,sans-serif;color:#111;max-width:720px;margin:24px auto;padding:0 16px;}
    h1{font-size:22px;} .meta{color:#888;font-size:12px;margin-bottom:20px;}</style></head>
    <body><h1>Заметки: ${eh(title)}</h1>
    <div class="meta">${author ? eh(author) + ' &middot; ' : ''}Экспорт: ${new Date().toLocaleDateString('ru-RU')}</div>
    ${rows}
    <script>window.onload=()=>{window.print();}<\/script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { showToast('Разрешите всплывающие окна для PDF'); return; }
  w.document.write(html); w.document.close();
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
    console.error('Не удалось загрузить тест для книги', bookId, err);
    const msg = (err && err.status)
      ? `Ошибка теста (${err.status}${err.detail ? ': ' + err.detail : ''})`
      : 'Не удалось загрузить тест';
    showToast(msg);
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
// Ленивая инициализация: запоминаем элементы при первом обращении,
// чтобы избежать гонки если app.js загружается до конца DOM
const _screensCache = {};
const SCREEN_IDS = {
  auth: 'authScreen',
  home: 'homeScreen',
  detail: 'detailScreen',
  reader: 'readerScreen',
  mylist: 'mylistScreen',
  profile: 'profileScreen',
  assistant: 'assistantScreen',
  settings: 'settingsScreen',
  admin: 'adminScreen',
  training: 'trainingScreen',
  onboarding: 'onboardingScreen',
};

const screens = new Proxy({}, {
  get(_t, key) {
    if (_screensCache[key]) return _screensCache[key];
    const id = SCREEN_IDS[key];
    if (!id) return null;
    const el = document.getElementById(id);
    if (el) _screensCache[key] = el;
    return el;
  },
  ownKeys() {
    return Object.keys(SCREEN_IDS);
  },
  getOwnPropertyDescriptor(_t, key) {
    return { enumerable: true, configurable: true };
  },
});

function navigateTo(s) {
  // Привратник: неодобрённый пользователь не попадает в библиотеку.
  // Разрешены только онбординг (тест уровня) и экран авторизации.
  if (state.currentUser && state.currentUser.is_approved === false
      && s !== 'onboarding' && s !== 'auth') {
    showPendingApprovalScreen();
    return;
  }
  // Снимаем active со всех известных экранов
  Object.keys(SCREEN_IDS).forEach(key => {
    const el = screens[key];
    if (el) el.classList.remove('active');
  });
  const target = screens[s];
  if (!target) {
    console.error(`Screen "${s}" not found, fallback to home`);
    s = 'home';
  }
  const isAuthScreen = s === 'auth' || s === 'onboarding';
  if (isAuthScreen) {
    screens[s].classList.add('active');
    document.getElementById('bottomNav')?.classList.add('hidden');
    document.getElementById('sidebarNav')?.classList.add('hidden-on-auth');
  } else {
    screens[s].classList.add('active');
    document.getElementById('bottomNav')?.classList.remove('hidden');
    document.getElementById('sidebarNav')?.classList.remove('hidden-on-auth');
  }
  state.currentScreen = s;
  document.body.classList.toggle('reader-active', s === 'reader');
  document.querySelectorAll('.nav-item, .sidebar-item').forEach(i => i.classList.toggle('active', i.dataset.screen === s));
  closeAIPanel();
  if (s === 'home') { renderHome(); renderRecommendations(); }
  if (s === 'mylist') { renderMyList(); initDragAndDrop(); }
  if (s === 'training') renderTrainingScreen();
  if (s === 'profile') { renderProfile(); updateProfileXpDisplay(); renderAchievementsInProfile(); renderHeatmap(); renderSkillsRadar(); renderMyCertificates(); }
  if (s === 'settings') { renderSettingsScreen(); }
  if (s === 'assistant') { renderAssistantScreen(); }
  if (s === 'admin') { renderAdminPanel(); refreshPendingBadge(); }
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
  document.getElementById('registerDepartmentField').classList.toggle('hidden', !isRegister);
  document.getElementById('registerFirstNameField').classList.toggle('hidden', !isRegister);
  document.getElementById('registerLastNameField').classList.toggle('hidden', !isRegister);
  document.getElementById('authPass').required = !isRegister;
  // Обновляем текст кнопки и заголовка формы
  const submitText = document.getElementById('authSubmitText');
  if (submitText) submitText.textContent = isRegister ? 'Зарегистрироваться' : 'Войти';
  else if (document.querySelector('#authForm .btn')) document.querySelector('#authForm .btn').textContent = isRegister ? 'Зарегистрироваться' : 'Войти';
  const title = document.getElementById('authFormTitle');
  const subtitle = document.getElementById('authFormSubtitle');
  const forgotHint = document.getElementById('forgotPasswordHint');
  if (title) title.textContent = isRegister ? 'Создать аккаунт' : 'С возвращением';
  if (subtitle) subtitle.textContent = isRegister ? 'Заполните данные для регистрации' : 'Войдите в свой аккаунт';
  if (forgotHint) forgotHint.style.display = isRegister ? 'none' : '';
}));

function togglePasswordVisibility() {
  const input = document.getElementById('authPass');
  const icon = document.getElementById('eyeIcon');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>';
  } else {
    input.type = 'password';
    if (icon) icon.innerHTML = '<path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/>';
  }
}

function socialAuth(provider) {
  if (provider === 'sberid') {
    showToast('Вход через Сбер ID скоро будет доступен');
  } else {
    showToast(`Вход через ${provider} ещё не реализован`);
  }
}

document.getElementById('authDepartment').addEventListener('change', function() {
  const other = document.getElementById('authDepartmentOther');
  if (this.value === '__other__') {
    other.classList.remove('hidden');
    other.focus();
  } else {
    other.classList.add('hidden');
    other.value = '';
  }
});

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
    const perPage = 100;
    let page = 1;
    let all = [];
    let total = Infinity;
    // догружаем страницы, пока не соберём все книги (защита: максимум 50 страниц = 5000 книг)
    while (all.length < total && page <= 50) {
      const data = await api.books.list({ per_page: perPage, page });
      if (typeof data.total === 'number') total = data.total;
      const items = data.items || [];
      all = all.concat(items);
      if (items.length < perPage) break; // последняя страница
      page++;
    }
    state.books = all.map(adaptBookFromApi);
    state.books.forEach(b => { ensureProgress(b); });
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

  // Полезно для отладки: показываем точную причину от сервера в консоли
  try { console.warn('API error', err.status, err.detail, err.body); } catch (_) {}

  if (Array.isArray(err.detail) && err.detail.length > 0) {
    const first = err.detail[0];
    const field = first.loc?.[first.loc.length - 1] || 'поле';
    const fieldRu = { username: 'логин', password: 'пароль', email: 'email', full_name: 'имя', department: 'подразделение' }[field] || field;
    return `${fieldRu}: ${first.msg}`;
  }

  if (typeof err.detail === 'string' && err.detail) return err.detail;

  // Иногда сервер кладёт сообщение в другие поля тела
  if (err.body && typeof err.body === 'object') {
    if (typeof err.body.message === 'string') return err.body.message;
    if (typeof err.body.error === 'string') return err.body.error;
  }

  return `Ошибка ${err.status}`;
}

let pendingVerifyEmail = null;
let pendingVerifyCreds = null;

function showPendingApprovalScreen() {
  let overlay = document.getElementById('pendingApprovalOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pendingApprovalOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg-primary);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';
    document.body.appendChild(overlay);
  }
  const hasLevel = state.currentUser && state.currentUser.cyber_level;
  overlay.innerHTML = `
    <div style="max-width:420px;width:100%;text-align:center;">
      <div style="font-size:44px;margin-bottom:14px;">⏳</div>
      <h2 style="font-size:20px;font-weight:800;margin-bottom:10px;color:var(--text-primary);">Заявка на рассмотрении</h2>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;line-height:1.5;">
        Ваш email подтверждён. Теперь администратор должен одобрить доступ к библиотеке.
        Это обычно занимает немного времени.
      </p>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:22px;line-height:1.5;">
        А пока вы можете пройти тест на уровень знаний — результат сохранится в вашем профиле.
      </p>
      ${hasLevel ? `
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:16px;font-size:13px;color:var(--text-secondary);">
          Вы уже прошли тест уровня. Дождитесь одобрения администратора.
        </div>` : `
        <button id="pendingStartTestBtn" style="width:100%;background:linear-gradient(135deg,#00d4ff,#7b61ff);border:none;color:#fff;padding:13px;border-radius:10px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:700;margin-bottom:12px;">Пройти тест на уровень знаний</button>
      `}
      <button id="pendingRefreshBtn" style="width:100%;background:var(--bg-card);border:1px solid var(--border);color:var(--text-primary);padding:11px;border-radius:10px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;margin-bottom:10px;">Проверить статус одобрения</button>
      <button id="pendingLogoutBtn" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-family:inherit;font-size:12px;">Выйти</button>
    </div>`;

  const startBtn = document.getElementById('pendingStartTestBtn');
  if (startBtn) {
    startBtn.onclick = () => {
      overlay.style.display = 'none';
      renderLevelChoices();
      navigateTo('onboarding');
    };
  }
  document.getElementById('pendingRefreshBtn').onclick = async () => {
    const rbtn = document.getElementById('pendingRefreshBtn');
    rbtn.disabled = true;
    const orig = rbtn.textContent;
    rbtn.textContent = 'Проверяю…';
    try {
      const u = await api.me();
      if (u && u.is_approved === true) {
        overlay.remove();
        if (state.currentUser) state.currentUser.is_approved = true;
        showToast('Доступ одобрен! Добро пожаловать');
        // Подгружаем данные библиотеки перед входом
        try {
          await loadBooksFromApi();
          await loadMyListFromApi();
          await loadProgressFromApi();
        } catch (_) {}
        navigateTo(u.cyber_level ? 'home' : 'onboarding');
      } else {
        rbtn.disabled = false;
        rbtn.textContent = orig;
        showToast('Заявка пока на рассмотрении администратором');
      }
    } catch (err) {
      rbtn.disabled = false;
      rbtn.textContent = orig;
      showToast('Не удалось проверить статус, попробуйте ещё раз');
    }
  };
  document.getElementById('pendingLogoutBtn').onclick = () => {
    overlay.remove();
    api.logout();    clearNoteKey(); stopSyncPolling();
    state.currentUser = null;
    navigateTo('auth');
  };
}

function showVerifyEmailScreen(email) {
  let overlay = document.getElementById('verifyEmailOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'verifyEmailOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg-primary);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px;';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div style="max-width:400px;width:100%;text-align:center;">
      <div style="font-size:40px;margin-bottom:12px;">✉️</div>
      <h2 style="font-size:20px;font-weight:800;margin-bottom:8px;color:var(--text-primary);">Подтвердите email</h2>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;">
        Мы отправили код подтверждения на<br><b style="color:var(--text-primary);">${email}</b><br>
        <span style="font-size:11px;color:var(--text-muted);">Проверьте папку «Спам», если письма нет</span>
      </p>
      <input type="text" id="verifyCodeInput" inputmode="numeric" maxlength="6" placeholder="000000"
        style="width:100%;text-align:center;font-size:24px;letter-spacing:8px;padding:12px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);margin-bottom:14px;font-family:inherit;">
      <button id="verifyCodeBtn" style="width:100%;background:linear-gradient(135deg,#00d4ff,#7b61ff);border:none;color:#fff;padding:12px;border-radius:10px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:700;margin-bottom:12px;">Подтвердить</button>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;">
        <button id="verifyResendBtn" style="background:none;border:none;color:var(--accent);cursor:pointer;font-family:inherit;font-size:12px;">Отправить код повторно</button>
        <button id="verifyBackBtn" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-family:inherit;font-size:12px;">Назад</button>
      </div>
    </div>`;

  const input = document.getElementById('verifyCodeInput');
  input.focus();
  document.getElementById('verifyCodeBtn').onclick = submitVerifyCode;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submitVerifyCode(); });
  document.getElementById('verifyResendBtn').onclick = async () => {
    try {
      await api.resendCode(pendingVerifyEmail);
      showToast('Код отправлен повторно');
    } catch (err) {
      showToast(getAuthErrorMessage(err));
    }
  };
  document.getElementById('verifyBackBtn').onclick = () => {
    overlay.remove();
    pendingVerifyEmail = null;
    pendingVerifyCreds = null;
  };
}

async function submitVerifyCode() {
  const code = document.getElementById('verifyCodeInput').value.trim();
  if (code.length < 4) return showToast('Введите код из письма');
  const btn = document.getElementById('verifyCodeBtn');
  btn.disabled = true;
  btn.textContent = '...';
  try {
    await api.verifyEmail(pendingVerifyEmail, code);
    // Выводим ключ шифрования из сохранённого при регистрации пароля
    if (pendingVerifyCreds && pendingVerifyCreds.password) {
      await deriveNoteKey(pendingVerifyCreds.password, pendingVerifyCreds.username);
    }
    // Успех — токены сохранены, грузим пользователя
    const user = await api.me();
    state.currentUser = {
      name: user.username, role: user.role, id: user.id, email: user.email,
      full_name: user.full_name, has_avatar: user.has_avatar, cyber_level: user.cyber_level,
      topic_scores: user.topic_scores, level_assessed_at: user.level_assessed_at,
      department: user.department || null,
      is_approved: user.is_approved !== false,
    };
    await loadBooksFromApi();
    await loadMyListFromApi();
    await loadProgressFromApi();
    await loadCompletedQuizzesFromApi();
    await loadGamificationFromApi();
    await loadOfflineBookIds();
    const ov = document.getElementById('verifyEmailOverlay');
    if (ov) ov.remove();
    pendingVerifyEmail = null;
    pendingVerifyCreds = null;
    showToast('Email подтверждён! Добро пожаловать');
    if (state.currentUser && state.currentUser.is_approved === false) {
      showPendingApprovalScreen();
    } else if (!user.cyber_level) navigateTo('onboarding');
    else navigateTo('home');
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Подтвердить';
    showToast(getAuthErrorMessage(err));
  }
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
    if (!email) return showToast('Email обязателен — на него придёт код подтверждения');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showToast('Введите корректный email (например, name@example.com)');
  }

  const submitBtn = document.getElementById('authSubmitBtn');
  const submitText = document.getElementById('authSubmitText');
  const submitSpinner = document.getElementById('authSubmitSpinner');
  const originalText = submitText ? submitText.textContent : submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.classList.add('loading');
  if (submitText) submitText.textContent = '...';
  else submitBtn.textContent = '...';
  if (submitSpinner) submitSpinner.classList.remove('hidden');

  try {
    if (state.currentTab === 'register') {
      const firstName = document.getElementById('authFirstName').value.trim();
      const lastName = document.getElementById('authLastName').value.trim();
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;
      // Собираем подразделение
      const depSelect = document.getElementById('authDepartment').value;
      let department = null;
      if (depSelect === '__other__') {
        department = document.getElementById('authDepartmentOther').value.trim() || null;
      } else if (depSelect) {
        department = depSelect;
      }
      await api.register(n, p, email, fullName, department);
      // Регистрация создаёт неподтверждённый аккаунт — показываем экран ввода кода
      pendingVerifyEmail = email;
      pendingVerifyCreds = { username: n, password: p };
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
      if (submitText) submitText.textContent = originalText;
      if (submitSpinner) submitSpinner.classList.add('hidden');
      showVerifyEmailScreen(email);
      return;
    } else {
      await api.login(n, p);
    }
    // Выводим ключ шифрования заметок из пароля (держится только в памяти)
    await deriveNoteKey(p, n);
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
        department: user.department || null,
      is_approved: user.is_approved !== false,
      };
      await loadBooksFromApi();
      await loadMyListFromApi();
      await loadProgressFromApi();
      await loadCompletedQuizzesFromApi();
      await loadGamificationFromApi();
      await loadOfflineBookIds();
      maybeAutoPreload();

      saveState();
      document.getElementById('authForm').reset();

      // Не одобрен админом — показываем экран ожидания (с возможностью пройти тест уровня)
      if (state.currentUser && state.currentUser.is_approved === false) {
        showPendingApprovalScreen();
      } else if (state.currentTab === 'register' && !user.cyber_level) {
        renderLevelChoices();
        navigateTo('onboarding');
      } else {
        navigateTo('home');
      }
  } catch (err) {
    // Если вход заблокирован из-за неподтверждённого email — показываем экран кода
    const msg = (err && (err.detail || (err.body && err.body.detail))) || '';
    if (err && err.status === 403 && /not verified/i.test(msg)) {
      const loginName = document.getElementById('authName').value.trim();
      const loginPass = document.getElementById('authPass').value.trim();
      try {
        // Узнаём email по аккаунту нельзя без входа — просим ввести email для повторной отправки
        const emailForVerify = document.getElementById('authEmail')?.value?.trim();
        if (emailForVerify) {
          pendingVerifyEmail = emailForVerify;
          pendingVerifyCreds = { username: loginName, password: loginPass };
          await api.resendCode(emailForVerify);
          showVerifyEmailScreen(emailForVerify);
        } else {
          showToast('Подтвердите email. Введите его в поле email и попробуйте снова.');
        }
      } catch (_) {
        showToast('Подтвердите email перед входом');
      }
    } else {
      showToast(formatApiError(err));
      if (!(err instanceof api.ApiError)) console.error(err);
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading');
    if (submitText) submitText.textContent = originalText;
    else submitBtn.textContent = originalText;
    if (submitSpinner) submitSpinner.classList.add('hidden');
  }
});

function logout() {
  // Используем кастомный confirm вместо нативного — выглядит в стиле приложения
  showConfirmModal({
    title: 'Выход из аккаунта',
    message: 'Вы уверены, что хотите выйти?',
    confirmText: 'Выйти',
    cancelText: 'Отмена',
    danger: true,
    onConfirm: () => {
      api.logout();      clearNoteKey(); stopSyncPolling();
      state.currentUser = null;
      navigateTo('auth');
      showToast('Вы вышли из аккаунта');
    },
  });
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
      profile_visibility: user.profile_visibility || 'public',
      department: user.department || null,
      is_approved: user.is_approved !== false,
    };

    await loadBooksFromApi();
    await loadMyListFromApi();
    await loadProgressFromApi();
    await loadCompletedQuizzesFromApi();
    await loadGamificationFromApi();
    await loadOfflineBookIds();
      maybeAutoPreload();

    saveState();
    return true;
  } catch (err) {
    api.logout();    clearNoteKey(); stopSyncPolling();
    return false;
  }
}

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
      `<button class="ai-book-option" onclick="assistantPickBook('${surfaceKind}','${action}',${b.id})"><span class="t">${eh(b.title)}</span></button>`
    ).join('') + `</div>`;
  }

  if (m._action === 'goto_quiz' && m._bookId != null) {
    inner += `<button class="ai-action-btn" onclick="assistantGotoQuiz(${m._bookId})">` +
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>` +
      `Перейти к тесту</button>`;
  }

  const copyBtn = `<button class="ai-copy" onclick="assistantCopy('${surfaceKind}',${idx})" title="Скопировать">${COPY_SVG}<span>Копировать</span></button>`;

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
  m.innerHTML = `<div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:440px;width:100%;max-height:80vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <h3 style="font-size:15px;font-weight:700;color:var(--accent);">История диалогов</h3>
      <button onclick="document.getElementById('chatHistoryModal').remove()" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;">✕</button>
    </div>
    <div id="chatHistoryBody" style="font-size:13px;color:var(--text-muted);text-align:center;padding:16px;">Загружаю…</div>
  </div>`;
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  document.body.appendChild(m);
  try {
    const chats = await api.library.chats();
    const body = document.getElementById('chatHistoryBody');
    if (!chats.length) { body.innerHTML = '<div style="padding:16px;color:var(--text-muted);">Сохранённых диалогов пока нет.</div>'; return; }
    body.style.textAlign = 'left'; body.style.padding = '0';
    body.innerHTML = chats.map(c => `
      <div style="display:flex;align-items:center;gap:8px;padding:11px 8px;border-bottom:1px solid var(--border);">
        <div onclick="loadChatFromHistory(${c.id})" style="flex:1;cursor:pointer;">
          <div style="font-size:13px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${eh(c.title)}</div>
          <div style="font-size:10px;color:var(--text-muted);">${c.message_count} сообщений</div>
        </div>
        <button onclick="deleteChatFromHistory(${c.id})" style="background:transparent;border:none;color:#ef4444;cursor:pointer;font-size:15px;padding:4px 8px;">✕</button>
      </div>`).join('');
  } catch (_) {
    const body = document.getElementById('chatHistoryBody');
    if (body) body.innerHTML = '<div style="padding:16px;color:#ef4444;">Не удалось загрузить историю.</div>';
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

// ========== CATALOG & FILTERS ==========
function toggleCatalogPanel() { state.catalogOpen = !state.catalogOpen; document.getElementById('catalogPanel').classList.toggle('show', state.catalogOpen); if (state.catalogOpen) populateCatalog(); }
function closeCatalogPanel() { state.catalogOpen = false; document.getElementById('catalogPanel').classList.remove('show'); }
function populateCatalog() {
  // Собираем все уникальные категории из всех книг
  const allCats = new Set();
  state.books.forEach(b => (b.categories || []).forEach(c => allCats.add(c)));
  const cats = [...allCats];
  document.getElementById('catalogChips').innerHTML = cats.map((c, idx) => {
  const isActive = state.filters.categories.includes(c);
  return `<span class="catalog-chip${isActive ? ' active' : ''}" data-cat-idx="${idx}" onclick="toggleCategoryFilter(window._catCache[${idx}])">${eh(c)}</span>`;
}).join('');
window._catCache = cats;
  document.getElementById('filterSort').value = state.filters.sort;
}
function toggleCategoryFilter(c) { const idx = state.filters.categories.indexOf(c); if (idx === -1) state.filters.categories.push(c); else state.filters.categories.splice(idx, 1); populateCatalog(); applyFilters(); }
function applyFilters() { state.filters.sort = document.getElementById('filterSort').value; renderHome(); showToast('Применено'); }
function resetFilters() { state.filters = { categories: [], sort: 'default' }; populateCatalog(); renderHome(); showToast('Сброшено'); }
function getFilteredBooks() {
  let books = [...state.books]; const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  if (q) books = books.filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q));
  if (state.filters.categories.length > 0) {
    books = books.filter(b => {
      const bCats = b.categories || [];
      return state.filters.categories.some(filterCat => bCats.includes(filterCat));
    });
  }
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

  const recs = getRecommendations(5);
  if (recs.length === 0) {
    container.style.display = 'none';
    return;
  }

  // Заголовок секции: если есть подразделение — подсказываем, что подборка под него
  const titleEl = container.querySelector('.section-title');
  if (titleEl) {
    const dep = state.currentUser && state.currentUser.department;
    titleEl.textContent = (dep && departmentTopicKeywords())
      ? `Рекомендуем для вашего подразделения`
      : 'Рекомендации';
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
  renderBookScroll('scrollPopular', [...sorted].sort((a, b) => b.popularity - a.popularity).slice(0, 5), q);
  renderBookScroll('scrollAll', sorted, q);
  setHomeBooksTab(state.homeBooksTab || 'popular');
  renderResumeReading();
  renderBooksGoalWidget();
  renderFavCategories();
  renderRecommendations();
}

function setHomeBooksTab(tab) {
  state.homeBooksTab = tab;
  document.querySelectorAll('.books-tab').forEach(b => b.classList.toggle('active', b.dataset.btab === tab));
  const pop = document.getElementById('scrollPopular');
  const all = document.getElementById('scrollAll');
  if (pop) pop.classList.toggle('hidden', tab !== 'popular');
  if (all) all.classList.toggle('hidden', tab !== 'all');
}

// ===== D: Виджет цели по книгам =====
function renderBooksGoalWidget() {
  const section = document.getElementById('sectionBooksGoal');
  const wrap = document.getElementById('booksGoalWidget');
  if (!section || !wrap) return;
  const goal = getBooksGoal();
  if (!goal) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  const done = booksCompletedInPeriod();
  const pct = Math.min(100, Math.round(done / goal.count * 100));
  const periodLabel = goal.period === 'month' ? 'месяц' : goal.period === 'quarter' ? 'квартал' : 'год';
  wrap.innerHTML = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-size:14px;font-weight:700;">Цель: ${goal.count} книг за ${periodLabel}</div>
        <div style="font-size:13px;color:var(--accent);font-weight:700;font-family:'JetBrains Mono',monospace;">${done}/${goal.count}</div>
      </div>
      <div style="height:8px;background:var(--bg-primary);border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:var(--accent-gradient);transition:width 0.4s;"></div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">${pct >= 100 ? '🎉 Цель достигнута!' : `Осталось ${goal.count - done} — продолжайте!`}</div>
    </div>`;
}

// ===== D: Возобновить чтение (последние 1-3 книги) =====
function renderResumeReading() {
  const section = document.getElementById('sectionResume');
  const wrap = document.getElementById('resumeReadingCards');
  if (!section || !wrap) return;

  const started = (state.books || [])
    .filter(b => state.readingProgress[b.id]?.started)
    .map(b => ({ b, p: state.readingProgress[b.id] }))
    .sort((x, y) => {
      const tx = x.p.lastReadAt ? new Date(x.p.lastReadAt).getTime() : 0;
      const ty = y.p.lastReadAt ? new Date(y.p.lastReadAt).getTime() : 0;
      return ty - tx;
    })
    .slice(0, 3);

  if (!started.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  wrap.innerHTML = started.map(({ b, p }) => {
    const pct = p.totalPages ? Math.round(p.currentPage / p.totalPages * 100) : 0;
    return `<div onclick="openReader(${b.id})" style="display:flex;gap:12px;align-items:center;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px;cursor:pointer;">
      <div style="width:48px;height:64px;border-radius:8px;overflow:hidden;flex-shrink:0;background:var(--bg-primary);">
        ${b.has_cover ? `<img src="${api.books.coverUrl(b.id)}" alt="" style="width:100%;height:100%;object-fit:cover;">` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:22px;">📖</div>`}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${eh(b.title)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin:3px 0 6px;">Стр. ${p.currentPage} из ${p.totalPages} · ${pct}%</div>
        <div style="height:5px;background:var(--bg-primary);border-radius:3px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:var(--accent-gradient);"></div></div>
      </div>
      <div style="flex-shrink:0;color:var(--accent);">${ICONS.book}</div>
    </div>`;
  }).join('');
}

// ===== A3: Избранные категории =====
const FAV_CATS_KEY = 'aegis_fav_categories';
function getFavCategories() {
  try { return JSON.parse(localStorage.getItem(FAV_CATS_KEY) || '[]'); } catch (_) { return []; }
}
function saveFavCategories(arr) { localStorage.setItem(FAV_CATS_KEY, JSON.stringify(arr)); }
function toggleFavCategory(cat) {
  const favs = getFavCategories();
  const i = favs.indexOf(cat);
  if (i >= 0) favs.splice(i, 1); else favs.push(cat);
  saveFavCategories(favs);
  if (navigator.vibrate) navigator.vibrate(10);
  renderFavCategories();
  if (document.getElementById('favCatsPickerModal')) renderFavCatsPicker();
}
function renderFavCategories() {
  const section = document.getElementById('sectionFavCategories');
  const wrap = document.getElementById('favCategoriesChips');
  if (!section || !wrap) return;
  const favs = getFavCategories();
  section.style.display = 'block';
  const chipStyle = 'display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;border:1px solid var(--border);';
  let html = favs.map(c =>
    `<button onclick="filterByCategory('${encodeURIComponent(c).replace(/'/g, '')}')" style="${chipStyle}background:var(--accent-gradient);color:#fff;border-color:transparent;">${eh(c)}</button>`
  ).join('');
  html += `<button onclick="openFavCatsPicker()" style="${chipStyle}background:transparent;color:var(--text-secondary);border-style:dashed;">+ Тема</button>`;
  wrap.innerHTML = html;
}
function filterByCategory(encCat) {
  const cat = decodeURIComponent(encCat);
  const input = document.getElementById('searchInput');
  if (input) { input.value = cat; }
  // используем существующую фильтрацию по тексту
  setHomeBooksTab('all');
  renderHome();
  const all = document.getElementById('scrollAll');
  if (all) all.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function openFavCatsPicker() {
  const ex = document.getElementById('favCatsPickerModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'favCatsPickerModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px;';
  m.innerHTML = `<div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:440px;width:100%;max-height:80vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <h3 style="font-size:15px;font-weight:700;color:var(--accent);">Избранные темы</h3>
      <button onclick="document.getElementById('favCatsPickerModal').remove()" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;">✕</button>
    </div>
    <div id="favCatsPickerBody"></div>
  </div>`;
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  document.body.appendChild(m);
  renderFavCatsPicker();
}
function renderFavCatsPicker() {
  const body = document.getElementById('favCatsPickerBody');
  if (!body) return;
  const allCats = new Set();
  (state.books || []).forEach(b => (b.categories || []).forEach(c => allCats.add(c)));
  const favs = getFavCategories();
  body.innerHTML = [...allCats].sort().map(c => {
    const on = favs.includes(c);
    return `<button onclick="toggleFavCategory(${JSON.stringify(c).replace(/"/g, '&quot;')})" style="display:flex;justify-content:space-between;align-items:center;width:100%;text-align:left;padding:11px 14px;margin-bottom:6px;border-radius:10px;border:1px solid ${on ? 'var(--accent)' : 'var(--border)'};background:${on ? 'rgba(0,212,255,0.1)' : 'var(--bg-primary)'};color:var(--text-primary);cursor:pointer;font-family:inherit;font-size:13px;">
      <span>${eh(c)}</span><span style="color:var(--accent);font-weight:700;">${on ? '✓' : '+'}</span>
    </button>`;
  }).join('') || '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:20px;">Категорий пока нет</div>';
}

function highlightText(text, query) {
  if (!query) return eh(text);
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return eh(text).replace(regex, '<span class="search-highlight">$1</span>');
}

function renderBookScroll(id, books, query) {
  document.getElementById(id).innerHTML = books.map(b => cardHTML(b, query)).join('');
}

function extractBookYear(datePublished) {
  if (!datePublished) return null;
  const s = String(datePublished);
  const match = s.match(/\d{4}/);
  return match ? match[0] : null;
}

function cardHTML(b, query) {
  const p = state.readingProgress[b.id];
  const pct = p?.started ? Math.min(Math.round(p.currentPage / p.totalPages * 100), 100) : 0;

  const coverInner = b.has_cover
    ? `<img src="${api.books.coverUrl(b.id)}" alt="" loading="lazy"
            style="width:100%;height:100%;object-fit:cover;"
            onerror="this.outerHTML='<div class=&quot;cover-bg&quot;>${ICONS.bookCover.replace(/"/g, '&quot;')}</div>'">`
    : `<div class="cover-bg">${ICONS.bookCover}</div>`;

  const year = extractBookYear(b.datePublished);

  return `<div class="book-card-compact" onclick="openBookDetail(${b.id})" data-book-id="${b.id}" draggable="true">
    <div class="cover-area">
      ${coverInner}
      <div class="rating-badge">${ICONS.star}${b.rating}</div>
      ${offlineBookIds.has(b.id) ? `<div class="offline-badge" title="Доступна оффлайн">${ICONS.cloudCheck}</div>` : ''}
      ${pct ? `<div class="progress-badge">${pct}%</div><div class="progress-indicator" style="width:${pct}%"></div>` : ''}
    </div>
    <div class="book-card-meta">
      <div class="book-card-title" title="${eh(b.title)}">${eh(b.title)}</div>
      ${year ? `<div class="book-card-year">${eh(year)}</div>` : ''}
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
  header.textContent = displayName;

  // Под заголовком — username (он не меняется)
  let usernameLine = document.getElementById('profileUsernameLine');
  if (!usernameLine) {
    usernameLine = document.createElement('div');
    usernameLine.id = 'profileUsernameLine';
    usernameLine.style.cssText = 'font-size:11px;color:var(--text-muted);margin-bottom:4px;';
    header.parentNode.insertBefore(usernameLine, header.nextSibling);
  }
  usernameLine.textContent = '@' + u.name;

  // Подразделение под username
  let depLine = document.getElementById('profileDepartmentLine');
  if (u.department) {
    if (!depLine) {
      depLine = document.createElement('div');
      depLine.id = 'profileDepartmentLine';
      depLine.style.cssText = 'font-size:11px;color:var(--accent);margin-bottom:4px;font-weight:600;';
      usernameLine.parentNode.insertBefore(depLine, usernameLine.nextSibling);
    }
    depLine.textContent = u.department;
  } else if (depLine) {
    depLine.remove();
  }

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
      takeQuizBtn.className = 'profile-take-quiz-btn';
      takeQuizBtn.onclick = () => {
        navigateTo('onboarding');
        document.getElementById('onboardingResult').classList.add('hidden');
        document.getElementById('onboardingQuiz').classList.add('hidden');
        document.getElementById('onboardingWelcome').classList.remove('hidden');
      };
      // Кнопка — в отдельный слот внизу карточки профиля
      const slot = document.getElementById('profileTestSlot');
      (slot || usernameLine.parentNode).appendChild(takeQuizBtn);
    }
    takeQuizBtn.innerHTML = `<span style="display:inline-flex;vertical-align:middle;margin-right:10px;">${ICONS.target}</span>Пройти тест уровня кибербезопасности`;
    takeQuizBtn.style.display = 'flex';
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
  renderSkillsRadar();
  renderOfflineBooks();
  // Кнопки переключения темы приложения
  const btnDark = document.getElementById('appThemeBtnDark');
  const btnLight = document.getElementById('appThemeBtnLight');
  if (btnDark && !btnDark.innerHTML.trim()) {
    btnDark.innerHTML = ICONS.themeMoon + '<span>Тёмная</span>';
  }
  if (btnLight && !btnLight.innerHTML.trim()) {
    btnLight.innerHTML = ICONS.themeSun + '<span>Светлая</span>';
  }
  // Применяем актуальное состояние
  applyAppTheme(getAppTheme());
// SVG в шапке: шестерёнка + звезда + пламя
  const gearBtn = document.getElementById('btnOpenSettings');
  if (gearBtn && !gearBtn.innerHTML.trim()) gearBtn.innerHTML = ICONS.settingsGear;
  const starIc = document.getElementById('profileStarIcon');
  if (starIc && !starIc.innerHTML.trim()) starIc.innerHTML = ICONS.iconStar;
  const flameIc = document.getElementById('statStreakFlame');
  if (flameIc && !flameIc.innerHTML.trim()) flameIc.innerHTML = ICONS.iconFlame;
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

// ========== ЭКРАН НАСТРОЕК ==========

const SETTINGS_TABS = [
  { id: 'info',            label: 'Информация',     icon: 'iconUser' },
  { id: 'security',        label: 'Безопасность',   icon: 'iconLock' },
  { id: 'privacy',         label: 'Приватность',    icon: 'iconEye' },
  { id: 'storage',         label: 'Данные и память', icon: 'iconDatabase' },
  { id: 'personalization', label: 'Персонализация', icon: 'iconPalette' },
];

let settingsCurrentTab = 'info';

function renderSettingsScreen() {
  // Заполнить навигацию (один раз)
  document.querySelectorAll('.settings-tab').forEach(btn => {
    const tabId = btn.dataset.stab;
    const tab = SETTINGS_TABS.find(t => t.id === tabId);
    if (!tab) return;
    if (!btn.innerHTML.trim()) {
      btn.innerHTML = `${ICONS[tab.icon]}<span>${tab.label}</span>`;
    }
    btn.classList.toggle('active', tabId === settingsCurrentTab);
  });

  // Иконка для кнопки выхода
  const logoutIc = document.getElementById('logoutIcon');
  if (logoutIc && !logoutIc.innerHTML.trim()) logoutIc.innerHTML = ICONS.iconLogout;

  renderSettingsTabContent();
}

function openSettingsTab(tabId) {
  settingsCurrentTab = tabId;
  document.querySelectorAll('.settings-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.stab === tabId);
  });
  renderSettingsTabContent();
}

async function renderSettingsStorageTab(c) {
  c.innerHTML = `
    <h3 style="font-size:14px;font-weight:700;margin-bottom:14px;color:var(--accent);">Данные и память</h3>
    <div id="storageStatsContent" style="font-size:12px;color:var(--text-muted);text-align:center;padding:20px;">
      ${ICONS.iconDatabase}
      <div style="margin-top:8px;">Подсчёт...</div>
    </div>
  `;

  const stats = await getStorageStats();
  const cont = document.getElementById('storageStatsContent');
  if (!cont) return;

  const usedPct = stats.quota > 0 ? Math.round((stats.used / stats.quota) * 100) : 0;
  const wifiOnly = isWifiOnlyEnabled();

  cont.style.textAlign = 'left';
  cont.style.padding = '0';
  cont.innerHTML = `
    <div style="background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
        <div style="font-size:11px;font-weight:600;color:var(--text-muted);">ИСПОЛЬЗОВАНО</div>
        <div style="font-size:14px;font-weight:700;color:var(--accent);font-family:'JetBrains Mono',monospace;">${formatBytes(stats.used)}</div>
      </div>
      <div style="height:8px;background:var(--bg-card);border-radius:4px;overflow:hidden;margin-bottom:6px;">
        <div style="height:100%;width:${usedPct}%;background:var(--accent-gradient);transition:width 0.3s;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);">
        <span>${usedPct}% от доступного</span>
        <span>из ${formatBytes(stats.quota)}</span>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
      <div style="background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center;">
        <div style="font-size:16px;font-weight:700;color:var(--accent);font-family:'JetBrains Mono',monospace;">${formatBytes(stats.cacheSize)}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">Кэш приложения</div>
      </div>
      <div style="background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center;">
        <div style="font-size:16px;font-weight:700;color:#a855f7;font-family:'JetBrains Mono',monospace;">${stats.cacheCount}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">Файлов в кэше</div>
      </div>
    </div>

    <!-- Тумблер «только Wi-Fi» -->
    <div class="set-row" style="background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;padding:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:2px;">Скачивать только по Wi-Fi</div>
          <div style="font-size:10px;color:var(--text-muted);">Экономия мобильного трафика</div>
        </div>
        <label class="toggle-switch" style="position:relative;display:inline-block;width:42px;height:24px;flex-shrink:0;cursor:pointer;">
          <input type="checkbox" id="wifiOnlyToggle" ${wifiOnly ? 'checked' : ''} onchange="setWifiOnly(this.checked);renderSettingsScreen();showToast(this.checked ? 'Только Wi-Fi' : 'Любая сеть')" style="opacity:0;width:0;height:0;position:absolute;">
          <span class="toggle-slider" style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${wifiOnly ? 'var(--accent)' : 'var(--bg-card-hover)'};transition:0.2s;border-radius:24px;pointer-events:none;">
            <span style="position:absolute;height:18px;width:18px;left:${wifiOnly ? '21px' : '3px'};bottom:3px;background:#fff;transition:0.2s;border-radius:50%;"></span>
          </span>
        </label>
      </div>
    </div>

    <!-- Тумблер автопредзагрузки -->
    <div class="set-row" style="background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;padding:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:2px;">Автосохранение книг офлайн</div>
          <div style="font-size:10px;color:var(--text-muted);">Начатые книги автоматически скачиваются по Wi-Fi</div>
        </div>
        <label class="toggle-switch" style="position:relative;display:inline-block;width:42px;height:24px;flex-shrink:0;cursor:pointer;">
          <input type="checkbox" id="autoPreloadToggle" ${isAutoPreloadEnabled() ? 'checked' : ''} onchange="setAutoPreload(this.checked);renderSettingsScreen();showToast(this.checked ? 'Автосохранение включено' : 'Автосохранение выключено')" style="opacity:0;width:0;height:0;position:absolute;">
          <span class="toggle-slider" style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${isAutoPreloadEnabled() ? 'var(--accent)' : 'var(--bg-card-hover)'};transition:0.2s;border-radius:24px;pointer-events:none;">
            <span style="position:absolute;height:18px;width:18px;left:${isAutoPreloadEnabled() ? '21px' : '3px'};bottom:3px;background:#fff;transition:0.2s;border-radius:50%;"></span>
          </span>
        </label>
      </div>
    </div>

    <button class="set-save-btn" onclick="exportAllUserData()" style="background:rgba(0,212,255,0.12);color:var(--accent);border:1px solid rgba(0,212,255,0.4);margin-top:14px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      <span>Скачать все мои данные</span>
    </button>
    <div style="margin-top:8px;font-size:10px;color:var(--text-muted);line-height:1.5;">
      Выгрузка всех ваших данных (профиль, списки, заметки, прогресс, результаты тестов) одним JSON-файлом.
    </div>

    <button class="set-save-btn" onclick="confirmClearCache()" style="background:#ef444425;color:#ef4444;border:1px solid #ef444466;margin-top:14px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
      <span>Очистить кэш</span>
    </button>

    <div style="margin-top:10px;font-size:10px;color:var(--text-muted);line-height:1.5;">
      После очистки книги придётся скачать заново при следующем чтении. Прогресс чтения, заметки и достижения сохранятся.
    </div>
  `;
}

function confirmClearCache() {
  showConfirmModal({
    title: 'Очистить кэш приложения?',
    message: 'Все скачанные книги будут удалены из кэша. Прогресс, заметки и достижения сохранятся.',
    confirmText: 'Очистить',
    cancelText: 'Отмена',
    danger: true,
    onConfirm: async () => {
      try {
        await clearAllAppCache();
        showToast('Кэш очищен');
        // Перерисуем вкладку
        renderSettingsStorageTab(document.getElementById('settingsContent'));
      } catch (e) {
        showToast('Не удалось очистить кэш');
        console.error(e);
      }
    },
  });
}

function renderSettingsTabContent() {
  const c = document.getElementById('settingsContent');
  if (!c || !state.currentUser) return;

  if (settingsCurrentTab === 'info') {
    renderSettingsInfoTab(c);
  } else if (settingsCurrentTab === 'security') {
    renderSettingsSecurityTab(c);
  } else if (settingsCurrentTab === 'personalization') {
    renderSettingsPersonalizationTab(c); 
  } else if (settingsCurrentTab === 'privacy') {
    renderSettingsPrivacyTab(c);
  } else if (settingsCurrentTab === 'storage') {
    renderSettingsStorageTab(c);
  }else {
    const tab = SETTINGS_TABS.find(t => t.id === settingsCurrentTab);
    c.innerHTML = `
      <div style="text-align:center;padding:32px 12px;color:var(--text-muted);">
        <div style="font-size:14px;font-weight:600;margin-bottom:6px;">${tab ? tab.label : ''}</div>
        <div style="font-size:12px;">Раздел будет доступен в ближайшее время</div>
      </div>
    `;
  }
}

function renderSettingsPrivacyTab(c) {
  const u = state.currentUser;
  const current = u.profile_visibility || 'public';

  const options = [
    { value: 'public',     label: 'Публичный',         desc: 'Профиль доступен всем авторизованным пользователям' },
    { value: 'colleagues', label: 'Только для коллег', desc: 'Видят только пользователи твоего подразделения' },
    { value: 'private',    label: 'Приватный',         desc: 'Профиль скрыт от всех, кроме тебя' },
  ];

  c.innerHTML = `
    <h3 style="font-size:14px;font-weight:700;margin-bottom:14px;color:var(--accent);">Приватность</h3>

    <div style="background:rgba(0,212,255,0.08);border:1px solid rgba(0,212,255,0.3);border-radius:10px;padding:10px 12px;margin-bottom:14px;display:flex;gap:8px;align-items:flex-start;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <div style="font-size:11px;color:var(--text-secondary);line-height:1.5;">
        В публичном профиле ваш email показывается замаскированным (например i***n@mail.ru). Приватный профиль скрыт от всех.
      </div>
    </div>

    <div class="set-row">
      <label>Отображение профиля</label>
      <div style="display:flex;flex-direction:column;gap:6px;background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;padding:6px;">
        ${options.map(opt => `
          <button onclick="setPrivacyVisibility('${opt.value}')" style="text-align:left;display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:${current === opt.value ? 'var(--accent-gradient)' : 'transparent'};border:none;border-radius:8px;cursor:pointer;font-family:inherit;color:${current === opt.value ? '#fff' : 'var(--text-primary)'};">
            <div style="width:18px;height:18px;border-radius:50%;border:2px solid ${current === opt.value ? '#fff' : 'var(--border-light)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">
              ${current === opt.value ? '<div style="width:8px;height:8px;border-radius:50%;background:#fff;"></div>' : ''}
            </div>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:600;margin-bottom:2px;">${opt.label}</div>
              <div style="font-size:11px;opacity:0.8;line-height:1.4;">${opt.desc}</div>
            </div>
          </button>
        `).join('')}
      </div>
    </div>

    <div style="margin-top:22px;padding-top:18px;border-top:1px solid var(--border);">
      <label style="font-size:12px;color:#ef4444;font-weight:700;display:block;margin-bottom:8px;">Опасная зона</label>
      <button onclick="confirmDeleteAccount()" class="set-save-btn" style="background:#ef444418;color:#ef4444;border:1px solid #ef444455;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        <span>Удалить аккаунт</span>
      </button>
      <div style="margin-top:8px;font-size:10px;color:var(--text-muted);line-height:1.5;">
        Безвозвратно удаляет аккаунт и все данные: списки, заметки, прогресс, результаты тестов, коллекции.
      </div>
    </div>
  `;
}

function confirmDeleteAccount() {
  const ex = document.getElementById('deleteAccModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'deleteAccModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  m.innerHTML = `<div style="background:var(--bg-elevated);border:1px solid #ef444455;border-radius:16px;padding:22px;max-width:400px;width:100%;">
    <h3 style="font-size:16px;font-weight:700;color:#ef4444;margin-bottom:10px;">Удалить аккаунт?</h3>
    <p style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px;">Это действие необратимо. Все ваши данные будут удалены навсегда. Для подтверждения введите пароль и слово <b style="color:var(--text-primary);">УДАЛИТЬ</b>.</p>
    <input id="delAccPassword" type="password" placeholder="Пароль" style="width:100%;padding:11px 14px;margin-bottom:8px;background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;color:var(--text-primary);font-family:inherit;font-size:14px;">
    <input id="delAccConfirm" type="text" placeholder="Введите УДАЛИТЬ" style="width:100%;padding:11px 14px;margin-bottom:14px;background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;color:var(--text-primary);font-family:inherit;font-size:14px;">
    <div style="display:flex;gap:8px;">
      <button onclick="document.getElementById('deleteAccModal').remove()" style="flex:1;padding:12px;background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;color:var(--text-primary);cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;">Отмена</button>
      <button onclick="doDeleteAccount()" style="flex:1;padding:12px;background:#ef4444;border:none;border-radius:10px;color:#fff;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;">Удалить</button>
    </div>
  </div>`;
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  document.body.appendChild(m);
}

async function doDeleteAccount() {
  const pwd = document.getElementById('delAccPassword')?.value || '';
  const conf = document.getElementById('delAccConfirm')?.value || '';
  if (!pwd || !conf) { showToast('Заполните оба поля'); return; }
  try {
    await api.library.deleteAccount(pwd, conf);
    const m = document.getElementById('deleteAccModal');
    if (m) m.remove();
    showToast('Аккаунт удалён');
    api.logout();    clearNoteKey(); stopSyncPolling();
    setTimeout(() => location.reload(), 800);
  } catch (err) {
    const msg = err && err.detail ? err.detail : (err && err.status ? 'Ошибка ' + err.status : 'Не удалось удалить');
    showToast(msg);
  }
}

async function setPrivacyVisibility(value) {
  try {
    const updated = await api.updateMe({ profile_visibility: value });
    state.currentUser.profile_visibility = updated.profile_visibility;
    renderSettingsPrivacyTab(document.getElementById('settingsContent'));
    showToast('Настройка сохранена');
  } catch (e) {
    console.error(e);
    showToast('Не удалось сохранить');
  }
}

// --- Цель чтения (страниц/день) ---
const READING_GOAL_KEY = 'aegis_reading_goal';
// --- Цель по книгам за период (#10 целей) ---
const BOOKS_GOAL_KEY = 'aegis_books_goal';
function getBooksGoal() {
  try { return JSON.parse(localStorage.getItem(BOOKS_GOAL_KEY) || 'null'); } catch (_) { return null; }
}
function saveBooksGoalFromUI() {
  const input = document.getElementById('booksGoalCount');
  const count = parseInt(input?.value) || window._booksGoalCount || 0;
  const period = window._booksGoalPeriod || (getBooksGoal()?.period) || 'quarter';
  if (!count || count < 1) { showToast('Укажите количество книг'); return; }
  setBooksGoal(count, period);
}

function setBooksGoal(count, period) {
  if (!count) { localStorage.removeItem(BOOKS_GOAL_KEY); }
  else { localStorage.setItem(BOOKS_GOAL_KEY, JSON.stringify({ count, period, since: new Date().toISOString() })); }
  renderBooksGoalWidget();
  if (document.getElementById('settingsContent')) renderSettingsPersonalizationTab(document.getElementById('settingsContent'));
  showToast(count ? `Цель: ${count} книг / ${period === 'month' ? 'месяц' : period === 'quarter' ? 'квартал' : 'год'}` : 'Цель снята');
}
// сколько книг завершено с начала периода
function booksCompletedInPeriod() {
  const goal = getBooksGoal();
  if (!goal) return 0;
  const since = new Date(goal.since).getTime();
  // считаем completed из mylist (без дат завершения — берём все completed; для простоты)
  return Object.values(state.mylist || {}).filter(s => s === 'completed').length;
}

function getReadingGoal() { return parseInt(localStorage.getItem(READING_GOAL_KEY) || '20', 10); }
function setReadingGoal(n) {
  localStorage.setItem(READING_GOAL_KEY, String(n));
  renderSettingsPersonalizationTab(document.getElementById('settingsContent'));
  showToast(`Цель: ${n} стр./день`);
}

// --- Размер шрифта читалки (масштаб PDF/EPUB-текста) ---
const READER_FONT_KEY = 'aegis_reader_font';
function getReaderFontScale() { return parseInt(localStorage.getItem(READER_FONT_KEY) || '100', 10); }
function setReaderFontScale(pct) {
  localStorage.setItem(READER_FONT_KEY, String(pct));
  renderSettingsPersonalizationTab(document.getElementById('settingsContent'));
  showToast(`Шрифт читалки: ${pct}%`);
}

function renderSettingsPersonalizationTab(c) {
  const currentTheme = getAppTheme();
  const currentGrid = getGridSize();
  const goal = getReadingGoal();
  const fontScale = getReaderFontScale();

  c.innerHTML = `
    <h3 style="font-size:14px;font-weight:700;margin-bottom:14px;color:var(--accent);">Персонализация</h3>

    <!-- Тема -->
    <div class="set-row">
      <label>Тема приложения</label>
      <div style="display:flex;gap:8px;background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;padding:4px;">
        <button onclick="setAppTheme('dark');renderSettingsPersonalizationTab(document.getElementById('settingsContent'))" class="app-theme-btn ${currentTheme === 'dark' ? 'active' : ''}" style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:${currentTheme === 'dark' ? 'var(--accent-gradient)' : 'transparent'};border:none;color:${currentTheme === 'dark' ? '#fff' : 'var(--text-secondary)'};border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;">
          ${ICONS.themeMoon}<span>Тёмная</span>
        </button>
        <button onclick="setAppTheme('light');renderSettingsPersonalizationTab(document.getElementById('settingsContent'))" class="app-theme-btn ${currentTheme === 'light' ? 'active' : ''}" style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:${currentTheme === 'light' ? 'var(--accent-gradient)' : 'transparent'};border:none;color:${currentTheme === 'light' ? '#fff' : 'var(--text-secondary)'};border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;">
          ${ICONS.themeSun}<span>Светлая</span>
        </button>
      </div>
    </div>

    <!-- Карточек в ряд -->
    <div class="set-row">
      <label>Карточек книг в ряд</label>
      <div style="display:flex;gap:8px;background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;padding:4px;">
        ${[2, 3, 4].map(n => `
          <button onclick="setGridSize(${n})" style="flex:1;padding:10px;background:${currentGrid === n ? 'var(--accent-gradient)' : 'transparent'};border:none;color:${currentGrid === n ? '#fff' : 'var(--text-secondary)'};border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;font-family:'JetBrains Mono',monospace;">
            ${n}
          </button>
        `).join('')}
      </div>
    </div>

    <!-- Предпросмотр -->
    <div class="set-row">
      <label>Предпросмотр</label>
      <div style="background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;padding:10px;">
        <div id="gridPreview" style="display:grid;grid-template-columns:repeat(${currentGrid},1fr);gap:6px;">
          ${Array.from({length: currentGrid * 2}, () => `
            <div style="aspect-ratio:2/3;background:var(--accent-gradient);opacity:0.6;border-radius:6px;display:flex;align-items:center;justify-content:center;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
            </div>
          `).join('')}
        </div>
      </div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Изменения применяются ко всему каталогу</div>
    </div>

    <!-- Цель чтения -->
    <div class="set-row">
      <label>Цель чтения (страниц в день)</label>
      <div style="display:flex;gap:8px;background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;padding:4px;">
        ${[10, 20, 30, 50].map(n => `
          <button onclick="setReadingGoal(${n})" style="flex:1;padding:10px;background:${goal === n ? 'var(--accent-gradient)' : 'transparent'};border:none;color:${goal === n ? '#fff' : 'var(--text-secondary)'};border-radius:8px;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;">
            ${n}
          </button>
        `).join('')}
      </div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Цель отображается в профиле и тепловой карте</div>
    </div>

    <!-- Цель по книгам за период -->
    <div class="set-row">
      <label>Цель: сколько книг прочитать</label>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">Выберите количество книг и период</div>

      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">Количество книг</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
        ${[5, 10, 15, 20, 30].map(n => {
          const sel = (getBooksGoal()?.count) === n;
          return `<button type="button" onclick="window._booksGoalCount=${n};document.querySelectorAll('.bg-count-btn').forEach(b=>{b.style.background='var(--bg-primary)';b.style.color='var(--text-secondary)';b.style.borderColor='var(--border)';});this.style.background='var(--accent-gradient)';this.style.color='#fff';this.style.borderColor='transparent';document.getElementById('booksGoalCount').value=${n};" class="bg-count-btn" style="min-width:52px;padding:12px 10px;border-radius:10px;border:1px solid ${sel ? 'transparent' : 'var(--border)'};background:${sel ? 'var(--accent-gradient)' : 'var(--bg-primary)'};color:${sel ? '#fff' : 'var(--text-secondary)'};cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:700;">${n}</button>`;
        }).join('')}
      </div>

      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">Или своё число</div>
      <input id="booksGoalCount" type="number" inputmode="numeric" min="1" max="200" value="${(getBooksGoal()?.count) || ''}" placeholder="например, 12" style="width:100%;box-sizing:border-box;padding:14px 16px;margin-bottom:14px;background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;color:var(--text-primary);font-family:inherit;font-size:16px;">

      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">За какой период</div>
      <div style="display:flex;gap:6px;margin-bottom:14px;">
        ${[{v:'month',l:'Месяц'},{v:'quarter',l:'Квартал'},{v:'year',l:'Год'}].map(o => {
          const cur = getBooksGoal()?.period || 'quarter';
          const sel = cur === o.v;
          return `<button type="button" onclick="window._booksGoalPeriod='${o.v}';document.querySelectorAll('.bg-period-btn').forEach(b=>{b.style.background='var(--bg-primary)';b.style.color='var(--text-secondary)';b.style.borderColor='var(--border)';});this.style.background='var(--accent-gradient)';this.style.color='#fff';this.style.borderColor='transparent';" class="bg-period-btn" style="flex:1;padding:13px 8px;border-radius:10px;border:1px solid ${sel ? 'transparent' : 'var(--border)'};background:${sel ? 'var(--accent-gradient)' : 'var(--bg-primary)'};color:${sel ? '#fff' : 'var(--text-secondary)'};cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;">${o.l}</button>`;
        }).join('')}
      </div>

      <button onclick="saveBooksGoalFromUI()" class="set-save-btn" style="width:100%;">Сохранить цель</button>
      ${getBooksGoal() ? `<button onclick="setBooksGoal(0)" class="set-save-btn" style="width:100%;background:#ef444418;color:#ef4444;border:1px solid #ef444455;margin-top:8px;">Снять цель</button>` : ''}
      <div style="font-size:10px;color:var(--text-muted);margin-top:8px;">Прогресс-бар появится на главной странице</div>
    </div>

    <!-- Размер шрифта читалки -->
    <div class="set-row">
      <label>Размер шрифта в читалке</label>
      <div style="display:flex;gap:8px;background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;padding:4px;">
        ${[{p:90,l:'А-'},{p:100,l:'А'},{p:115,l:'А+'},{p:130,l:'А++'}].map(o => `
          <button onclick="setReaderFontScale(${o.p})" style="flex:1;padding:10px;background:${fontScale === o.p ? 'var(--accent-gradient)' : 'transparent'};border:none;color:${fontScale === o.p ? '#fff' : 'var(--text-secondary)'};border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;">
            ${o.l}
          </button>
        `).join('')}
      </div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Масштаб страницы при открытии книги</div>
    </div>
  `;
}

function setGridSize(n) {
  applyGridSize(n);
  // Перерисуем экран настроек чтобы обновить активную кнопку и предпросмотр
  renderSettingsPersonalizationTab(document.getElementById('settingsContent'));
  // Если открыта главная — перерисуем каталог
  if (state.currentScreen === 'home') renderHome();
  showToast(`Карточек в ряд: ${n}`);
}

function renderSettingsSecurityTab(c) {
  c.innerHTML = `
    <h3 style="font-size:14px;font-weight:700;margin-bottom:14px;color:var(--accent);">Смена пароля</h3>

    <div style="background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:14px;font-size:11px;color:var(--text-muted);line-height:1.5;">
      Для смены пароля введи текущий пароль и новый пароль. Новый пароль должен быть не короче 8 символов и отличаться от текущего.
    </div>

    <div class="set-row">
      <label>Текущий пароль</label>
      <input type="password" id="setCurrentPassword" autocomplete="current-password" placeholder="Введите текущий пароль" maxlength="128">
    </div>

    <div class="set-row">
      <label>Новый пароль</label>
      <input type="password" id="setNewPassword" autocomplete="new-password" placeholder="Минимум 8 символов" maxlength="128">
    </div>

    <div class="set-row">
      <label>Повторите новый пароль</label>
      <input type="password" id="setNewPasswordConfirm" autocomplete="new-password" placeholder="Ещё раз новый пароль" maxlength="128">
    </div>

    <div id="setPasswordError" style="font-size:11px;color:#ef4444;margin-bottom:10px;min-height:14px;"></div>

    <button class="set-save-btn" onclick="saveSettingsPassword()">
      ${ICONS.iconSave}<span>Изменить пароль</span>
    </button>

    <div style="margin-top:24px;padding-top:18px;border-top:1px solid var(--border);">
      <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--accent);">Смена email</h3>
      <div style="font-size:11px;color:var(--text-muted);line-height:1.5;margin-bottom:12px;">
        Текущий email: <strong style="color:var(--text-secondary);">${eh(state.currentUser?.email || 'не указан')}</strong>.
        На новый адрес придёт код подтверждения.
      </div>

      <div id="emailStep1">
        <div class="set-row">
          <label>Новый email</label>
          <input type="email" id="setNewEmail" autocomplete="email" placeholder="new@example.com">
        </div>
        <div class="set-row">
          <label>Пароль (для подтверждения)</label>
          <input type="password" id="setEmailPassword" autocomplete="current-password" placeholder="Ваш пароль">
        </div>
        <div id="setEmailError" style="font-size:11px;color:#ef4444;margin-bottom:10px;min-height:14px;"></div>
        <button class="set-save-btn" onclick="requestEmailChangeUI()">Отправить код подтверждения</button>
      </div>

      <div id="emailStep2" style="display:none;">
        <div style="font-size:11px;color:#10b981;margin-bottom:10px;">Код отправлен на новый адрес. Введите его ниже.</div>
        <div class="set-row">
          <label>Код из письма</label>
          <input type="text" inputmode="numeric" id="setEmailCode" placeholder="6-значный код" maxlength="6">
        </div>
        <div id="setEmailError2" style="font-size:11px;color:#ef4444;margin-bottom:10px;min-height:14px;"></div>
        <button class="set-save-btn" onclick="confirmEmailChangeUI()">Подтвердить смену email</button>
        <button class="set-save-btn" onclick="renderSettingsSecurityTab(document.getElementById('settingsContent'))" style="background:transparent;border:1px solid var(--border);color:var(--text-secondary);margin-top:8px;">Отмена</button>
      </div>
    </div>
  `;
}

async function requestEmailChangeUI() {
  const email = (document.getElementById('setNewEmail').value || '').trim();
  const pwd = (document.getElementById('setEmailPassword').value || '');
  const err = document.getElementById('setEmailError');
  err.textContent = '';
  if (!email || !email.includes('@')) { err.textContent = 'Введите корректный email'; return; }
  if (!pwd) { err.textContent = 'Введите пароль'; return; }
  try {
    await api.requestEmailChange(email, pwd);
    document.getElementById('emailStep1').style.display = 'none';
    document.getElementById('emailStep2').style.display = 'block';
    showToast('Код отправлен на новый адрес');
  } catch (e) {
    err.textContent = e && e.detail ? e.detail : 'Не удалось отправить код';
  }
}

async function confirmEmailChangeUI() {
  const code = (document.getElementById('setEmailCode').value || '').trim();
  const err = document.getElementById('setEmailError2');
  err.textContent = '';
  if (!code) { err.textContent = 'Введите код'; return; }
  try {
    const updated = await api.confirmEmailChange(code);
    state.currentUser.email = updated.email;
    showToast('Email изменён');
    renderSettingsSecurityTab(document.getElementById('settingsContent'));
  } catch (e) {
    err.textContent = e && e.detail ? e.detail : 'Неверный код';
  }
}

async function saveSettingsPassword() {
  const current = (document.getElementById('setCurrentPassword').value || '');
  const newp = (document.getElementById('setNewPassword').value || '');
  const confirm = (document.getElementById('setNewPasswordConfirm').value || '');
  const errEl = document.getElementById('setPasswordError');
  errEl.textContent = '';

  if (!current) { errEl.textContent = 'Введите текущий пароль'; return; }
  if (newp.length < 8) { errEl.textContent = 'Новый пароль должен быть не короче 8 символов'; return; }
  if (newp !== confirm) { errEl.textContent = 'Новые пароли не совпадают'; return; }
  if (newp === current) { errEl.textContent = 'Новый пароль должен отличаться от текущего'; return; }

  try {
    await api.changePassword(current, newp);
    showToast('Пароль изменён');
    // Чистим поля для безопасности
    document.getElementById('setCurrentPassword').value = '';
    document.getElementById('setNewPassword').value = '';
    document.getElementById('setNewPasswordConfirm').value = '';
  } catch (e) {
    if (e.status === 401) {
      errEl.textContent = 'Текущий пароль неверный';
    } else if (e.status === 400) {
      errEl.textContent = e.detail || 'Ошибка при смене пароля';
    } else {
      errEl.textContent = 'Не удалось изменить пароль. Попробуйте позже.';
      console.error(e);
    }
  }
}

function renderSettingsInfoTab(c) {
  const u = state.currentUser;
  c.innerHTML = `
    <h3 style="font-size:14px;font-weight:700;margin-bottom:14px;color:var(--accent);">Информация о профиле</h3>

    <!-- Аватар -->
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;padding:12px;background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;">
      <div class="profile-avatar-lg" style="width:64px;height:64px;font-size:22px;cursor:pointer;flex-shrink:0;" onclick="document.getElementById('settingsAvatarUpload').click()">
        <span id="settingsAvatarText">U</span>
        <img id="settingsAvatarImg" style="display:none;">
      </div>
      <input type="file" id="settingsAvatarUpload" accept="image/*" style="display:none;" onchange="uploadAvatar(event)">
      <div style="flex:1;font-size:11px;color:var(--text-muted);">
        Кликни на аватар чтобы загрузить новое фото<br>
        (JPEG/PNG/WEBP, до 2 МБ)
      </div>
    </div>

    <!-- Никнейм (только просмотр пока) -->
    <div class="set-row">
      <label>Никнейм (логин)</label>
      <input type="text" id="setUsername" value="${eh(u.name || '')}" disabled style="opacity:0.6;cursor:not-allowed;">
      <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Изменение никнейма пока не поддерживается</div>
    </div>

    <!-- ФИО -->
    <div class="set-row">
      <label>ФИО</label>
      <input type="text" id="setFullName" value="${eh(u.full_name || '')}" placeholder="Иванов Иван Иванович" maxlength="128">
    </div>

    <!-- Подразделение -->
    <div class="set-row">
      <label>Подразделение</label>
      <select id="setDepartment">
        <option value="">— Не указано —</option>
        <option value="ЦКЗ">ЦКЗ</option>
        <option value="ДПМ">ДПМ</option>
        <option value="УБД">УБД</option>
        <option value="УКИИ">УКИИ</option>
        <option value="УКАИ">УКАИ</option>
        <option value="УМК">УМК</option>
        <option value="УЭК">УЭК</option>
        <option value="ЦКГ">ЦКГ</option>
        <option value="ЦУПКБ">ЦУПКБ</option>
        <option value="ЦВВ">ЦВВ</option>
        <option value="__other__">Другое...</option>
      </select>
      <input type="text" id="setDepartmentOther" placeholder="Введите название" maxlength="64" style="margin-top:8px;display:none;">
    </div>

    <button class="set-save-btn" onclick="saveSettingsInfo()">
      ${ICONS.iconSave}<span>Сохранить изменения</span>
    </button>
  `;

  // Применяем аватар
  updateAvatar('settingsAvatarImg');
  const avatarText = document.getElementById('settingsAvatarText');
  if (avatarText) {
    avatarText.textContent = (u.name || 'U').charAt(0).toUpperCase();
    const img = document.getElementById('settingsAvatarImg');
    if (img && img.src && !img.src.endsWith('undefined') && img.style.display !== 'none') {
      avatarText.style.display = 'none';
    }
  }

  // Подставляем текущее подразделение
  const depSelect = document.getElementById('setDepartment');
  const depOther = document.getElementById('setDepartmentOther');
  const KNOWN_DEPS = ['ЦКЗ','ДПМ','УБД','УКИИ','УКАИ','УМК','УЭК','ЦКГ','ЦУПКБ','ЦВВ'];
  if (u.department) {
    if (KNOWN_DEPS.includes(u.department)) {
      depSelect.value = u.department;
      depOther.style.display = 'none';
    } else {
      depSelect.value = '__other__';
      depOther.value = u.department;
      depOther.style.display = 'block';
    }
  }

  depSelect.addEventListener('change', () => {
    if (depSelect.value === '__other__') {
      depOther.style.display = 'block';
      depOther.focus();
    } else {
      depOther.style.display = 'none';
      depOther.value = '';
    }
  });
}

async function saveSettingsInfo() {
  const fullName = (document.getElementById('setFullName').value || '').trim();
  const depSelect = document.getElementById('setDepartment').value;
  let department = null;
  if (depSelect === '__other__') {
    department = (document.getElementById('setDepartmentOther').value || '').trim();
  } else if (depSelect) {
    department = depSelect;
  }

  try {
    const updated = await api.updateMe({
      full_name: fullName || null,
      department: department || null,
    });
    // Обновим state
    state.currentUser.full_name = updated.full_name;
    state.currentUser.department = updated.department;
    showToast('Изменения сохранены');
    renderProfile();
  } catch (e) {
    console.error(e);
    showToast('Ошибка: ' + (e.detail || e.message));
  }
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

async function showMyStatsModal() {
  const ex = document.getElementById('myStatsModal');
  if (ex) ex.remove();

  const modal = document.createElement('div');
  modal.id = 'myStatsModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = `<div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:16px;padding:22px;max-width:680px;width:100%;max-height:88vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
      <h2 style="font-size:18px;font-weight:800;color:var(--accent);">Моя статистика</h2>
      <button id="myStatsClose" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:20px;width:32px;height:32px;border-radius:50%;">✕</button>
    </div>
    <div id="myStatsBody" style="font-size:13px;color:var(--text-muted);text-align:center;padding:24px;">Считаю…</div>
  </div>`;
  document.body.appendChild(modal);
  document.getElementById('myStatsClose').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  // Подгружаем свежие данные
  try { await loadHeatmapFromApi(); } catch (_) {}
  let attempts = [];
  try { attempts = await api.library.myQuizAttempts(); } catch (_) {}

  const days = state.heatmapData || [];
  const totalPages = days.reduce((s, d) => s + (d.pages || 0), 0);
  const activeDays = days.filter(d => (d.pages || 0) > 0).length;
  // Оценка часов: ~1.8 мин на страницу
  const hours = Math.round((totalPages * 1.8 / 60) * 10) / 10;
  const goal = (typeof getReadingGoal === 'function') ? getReadingGoal() : 20;

  // Любимые категории — из mylist + books
  const catCount = {};
  Object.keys(state.mylist || {}).forEach(bid => {
    const b = (state.books || []).find(x => String(x.id) === String(bid));
    if (b) (b.categories || []).forEach(c => { catCount[c] = (catCount[c] || 0) + 1; });
  });
  const topCats = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Средний балл тестов
  const avgQuiz = attempts.length
    ? Math.round(attempts.reduce((s, a) => s + (a.percentage || 0), 0) / attempts.length)
    : null;
  const passedCount = attempts.filter(a => (a.percentage || 0) >= 60).length;

  // Динамика по неделям (последние ~12 недель)
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    weeks.push(chunk.reduce((s, d) => s + (d.pages || 0), 0));
  }
  const maxWeek = Math.max(1, ...weeks);

  // Статусы книг
  const statuses = Object.values(state.mylist || {});
  const reading = statuses.filter(s => s === 'reading').length;
  const completed = statuses.filter(s => s === 'completed').length;
  const planned = statuses.filter(s => s === 'planned').length;

  const card = (val, label, color) => `
    <div style="background:var(--bg-primary);border:1px solid var(--border);border-radius:12px;padding:14px;text-align:center;">
      <div style="font-size:24px;font-weight:800;color:${color};font-family:'JetBrains Mono',monospace;">${val}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${label}</div>
    </div>`;

  const body = document.getElementById('myStatsBody');
  if (!body) return;
  body.style.textAlign = 'left';
  body.style.padding = '0';
  body.style.color = 'var(--text-primary)';
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:18px;">
      ${card(totalPages, 'страниц прочитано', 'var(--accent)')}
      ${card(hours + ' ч', 'примерно времени', '#a855f7')}
      ${card(activeDays, 'активных дней', '#10b981')}
      ${card(avgQuiz !== null ? avgQuiz + '%' : '—', 'средний балл тестов', '#f59e0b')}
    </div>

    <div style="margin-bottom:18px;">
      <div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:8px;">Динамика по неделям</div>
      <div style="display:flex;align-items:flex-end;gap:4px;height:90px;background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;padding:10px;">
        ${weeks.map(w => `<div title="${w} стр." style="flex:1;min-width:4px;height:${Math.max(4, Math.round(w / maxWeek * 70))}px;background:var(--accent-gradient);border-radius:3px 3px 0 0;"></div>`).join('') || '<div style="margin:auto;color:var(--text-muted);font-size:11px;">Нет данных</div>'}
      </div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Сумма страниц за каждую неделю (90 дней)</div>
    </div>

    <div style="margin-bottom:18px;">
      <div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:8px;">Любимые категории</div>
      ${topCats.length ? topCats.map(([cat, n]) => {
        const pct = Math.round(n / topCats[0][1] * 100);
        return `<div style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;"><span>${eh(cat)}</span><span style="color:var(--text-muted);">${n}</span></div>
          <div style="height:6px;background:var(--bg-primary);border-radius:3px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:var(--accent-gradient);"></div></div>
        </div>`;
      }).join('') : '<div style="font-size:11px;color:var(--text-muted);">Добавь книги в список, чтобы увидеть категории</div>'}
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
      ${card(reading, 'читаю', '#3b82f6')}
      ${card(completed, 'прочитано', '#10b981')}
      ${card(planned, 'в планах', '#a855f7')}
    </div>

    <div style="margin-top:16px;font-size:11px;color:var(--text-muted);text-align:center;">
      Тестов пройдено: ${passedCount} из ${attempts.length} · Цель: ${goal} стр./день
    </div>
  `;
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

// ===== Карта знаний по темам (radar chart) =====
// Группируем категории книг в крупные направления кибербезопасности
const SKILL_THEMES = {
  'Network Security': ['сет', 'network', 'сетев', 'firewall', 'protocol', 'traffic', 'трафик'],
  'AppSec / Web': ['web', 'веб', 'приложен', 'app', 'owasp', 'devsecops', 'код', 'программ'],
  'Offensive': ['пентест', 'pentest', 'red team', 'эксплуатац', 'exploit', 'атак', 'attack', 'взлом', 'hacking'],
  'Defense / SOC': ['soc', 'мониторинг', 'incident', 'инцидент', 'защит', 'defense', 'blue team', 'siem', 'форензик', 'forensic'],
  'Crypto / IAM': ['криптограф', 'crypto', 'шифр', 'pki', 'tls', 'iam', 'аутентификац', 'идентификац', 'ключ'],
  'GRC / Risk': ['риск', 'risk', 'governance', 'compliance', 'политик', 'аудит', 'audit', 'nist', 'iso', 'методолог', 'управлени'],
  'Malware / RE': ['malware', 'впо', 'вирус', 'reverse', 'реверс', 'анализ вредонос', 'троян'],
  'AI Security': ['ии', 'ai', 'machine learning', 'ml', 'нейросет', 'adversarial', 'модел'],
};

function computeSkillScores() {
  // Для каждой темы: сила = прочитанные книги (вес 2) + в процессе (вес 1), нормализуем 0-100
  const scores = {};
  for (const theme of Object.keys(SKILL_THEMES)) scores[theme] = 0;

  const books = state.books || [];
  for (const b of books) {
    const status = state.mylist && state.mylist[b.id];
    const prog = state.readingProgress && state.readingProgress[b.id];
    let weight = 0;
    if (status === 'completed') weight = 2;
    else if (status === 'reading' || (prog && prog.started)) weight = 1;
    else if (status === 'liked' || status === 'planned') weight = 0.3;
    if (weight === 0) continue;

    const hay = ((b.categories || []).join(' ') + ' ' + (b.title || '')).toLowerCase();
    for (const [theme, keywords] of Object.entries(SKILL_THEMES)) {
      if (keywords.some(k => hay.includes(k))) {
        scores[theme] += weight;
      }
    }
  }
  // Нормализация: максимум приводим к 100, чтобы график читался
  const max = Math.max(1, ...Object.values(scores));
  const normalized = {};
  for (const [theme, val] of Object.entries(scores)) {
    normalized[theme] = Math.round((val / max) * 100);
  }
  return { raw: scores, normalized };
}

let _skillsRadarChart = null;
function renderSkillsRadar() {
  const canvas = document.getElementById('skillsRadarCanvas');
  const empty = document.getElementById('skillsRadarEmpty');
  if (!canvas || typeof Chart === 'undefined') return;

  const { raw, normalized } = computeSkillScores();
  const total = Object.values(raw).reduce((a, b) => a + b, 0);

  // Если совсем нет данных — показываем заглушку
  if (total < 0.5) {
    canvas.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }
  canvas.style.display = 'block';
  if (empty) empty.style.display = 'none';

  const labels = Object.keys(SKILL_THEMES);
  const data = labels.map(l => normalized[l]);

  if (_skillsRadarChart) { _skillsRadarChart.destroy(); _skillsRadarChart = null; }

  const styles = getComputedStyle(document.documentElement);
  const accent = (styles.getPropertyValue('--accent') || '#00d4ff').trim();
  const textMuted = (styles.getPropertyValue('--text-muted') || '#8a93a6').trim();
  const border = (styles.getPropertyValue('--border') || 'rgba(255,255,255,0.1)').trim();

  _skillsRadarChart = new Chart(canvas, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: 'Уровень знаний',
        data,
        fill: true,
        backgroundColor: 'rgba(0,212,255,0.18)',
        borderColor: accent,
        borderWidth: 2,
        pointBackgroundColor: accent,
        pointRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: { display: false, stepSize: 25 },
          grid: { color: border },
          angleLines: { color: border },
          pointLabels: { color: textMuted, font: { size: 10 } },
        },
      },
    },
  });
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
    return `<div class="heatmap-cell level-${level}" data-date="${d.date}" data-pages="${p}" onclick="showHeatmapDayDetails('${d.date}')" title="${d.date}: ${p} стр."></div>`;
  }).join('');
}

async function showHeatmapDayDetails(date) {
  // Открываем модалку с показом «Загрузка»
  const ex = document.getElementById('heatmapDayModal');
  if (ex) ex.remove();

  const modal = document.createElement('div');
  modal.id = 'heatmapDayModal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px;';
  modal.innerHTML = `
    <div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:14px;padding:20px;max-width:420px;width:100%;max-height:85vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h3 style="font-size:15px;font-weight:700;color:var(--accent);">${formatHeatmapDate(date)}</h3>
        <button id="heatmapDayCloseBtn" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;width:28px;height:28px;border-radius:50%;">✕</button>
      </div>
      <div id="heatmapDayContent" style="font-size:12px;color:var(--text-secondary);text-align:center;padding:20px;">Загрузка...</div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('heatmapDayCloseBtn').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  try {
    const data = await api.library.dayStats(date);
    document.getElementById('heatmapDayContent').innerHTML = renderHeatmapDayContent(data);
  } catch (e) {
    document.getElementById('heatmapDayContent').innerHTML = `<div style="color:#ef4444;">Не удалось загрузить статистику</div>`;
  }
}

function formatHeatmapDate(iso) {
  try {
    const d = new Date(iso + 'T00:00:00');
    const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
    const weekdays = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
    return `${weekdays[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch (_) { return iso; }
}

function renderHeatmapDayContent(data) {
  const hasActivity = data.pages_read > 0 || data.quiz_attempts > 0 || data.annotations_count > 0;

  if (!hasActivity) {
    return `
      <div style="padding:32px 12px;text-align:center;">
        <div style="font-size:32px;margin-bottom:6px;opacity:0.4;">💤</div>
        <div style="color:var(--text-muted);font-size:12px;">В этот день активности не было</div>
      </div>
    `;
  }

  const statBox = (label, value, color = 'var(--accent)') => `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center;">
      <div style="font-size:18px;font-weight:700;color:${color};font-family:'JetBrains Mono',monospace;">${value}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${label}</div>
    </div>
  `;

  return `
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-bottom:14px;text-align:left;">
      ${statBox('Страниц', data.pages_read)}
      ${statBox('Тестов', data.quiz_attempts, '#a855f7')}
      ${statBox('Маркеров', data.highlights_count, '#fbbf24')}
      ${statBox('Заметок', data.notes_count, '#22c55e')}
    </div>

    ${data.books.length > 0 ? `
      <div style="text-align:left;margin-bottom:12px;">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:0.5px;margin-bottom:6px;">КНИГИ В РАБОТЕ</div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          ${data.books.map(b => `
            <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:11px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
              <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${eh(b.title)}</div>
              <div style="color:var(--text-muted);font-size:10px;flex-shrink:0;">стр.${b.pages_at_end}</div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    ${data.quizzes.length > 0 ? `
      <div style="text-align:left;">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:0.5px;margin-bottom:6px;">ТЕСТЫ</div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          ${data.quizzes.map(q => `
            <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:11px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
              <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${eh(q.book_title)}</div>
              <div style="color:${q.passed ? '#22c55e' : '#ef4444'};font-weight:700;font-size:11px;flex-shrink:0;">${q.percentage}%</div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
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
  if (state.detailTab === 'discussion') renderDiscussion();
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
          <button class="btn-detail" style="background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.5);color:#c084fc;" onclick="openAddToCollection(${b.id})">${ICONS.bookmark || ''} В коллекцию</button>
        </div>
      </div>
    </div>
    <div id="alsoReadSection" style="margin-top:28px;"></div>`;
  loadAlsoRead(currentBookId);
}

async function loadAlsoRead(bookId) {
  const c = document.getElementById('alsoReadSection');
  if (!c) return;
  try {
    const books = await api.library.alsoRead(bookId, 8);
    if (!books || !books.length) { c.innerHTML = ''; return; }
    c.innerHTML = `
      <div class="section-title" style="margin-bottom:12px;">Также читают</div>
      <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;">
        ${books.map(b => `
          <div onclick="openBookDetail(${b.id})" style="flex:0 0 auto;width:120px;cursor:pointer;">
            <div style="width:120px;height:160px;border-radius:10px;overflow:hidden;background:var(--bg-primary);border:1px solid var(--border);margin-bottom:6px;">
              ${b.has_cover ? `<img src="${api.books.coverUrl(b.id)}" alt="" style="width:100%;height:100%;object-fit:cover;">` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:32px;">📕</div>`}
            </div>
            <div style="font-size:12px;font-weight:600;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${eh(b.title)}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${eh(b.author)}</div>
          </div>
        `).join('')}
      </div>`;
  } catch (_) { c.innerHTML = ''; }
}

// ===== #9 Кастомные коллекции =====
let _collectionsCache = null;
async function getCollections(force) {
  if (_collectionsCache && !force) return _collectionsCache;
  try { _collectionsCache = await api.library.collections(); } catch (_) { _collectionsCache = []; }
  return _collectionsCache;
}

async function openAddToCollection(bookId) {
  const cols = await getCollections(true);
  const ex = document.getElementById('addToColModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'addToColModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  const rows = cols.map(col => {
    const has = (col.book_ids || []).includes(bookId);
    return `<button onclick="toggleBookInCollection(${col.id},${bookId},${has})" style="display:flex;justify-content:space-between;align-items:center;width:100%;padding:12px 14px;margin-bottom:6px;border-radius:10px;border:1px solid ${has ? 'var(--accent)' : 'var(--border)'};background:${has ? 'rgba(0,212,255,0.1)' : 'var(--bg-primary)'};color:var(--text-primary);cursor:pointer;font-family:inherit;font-size:13px;">
      <span>${col.icon || '📁'} ${eh(col.name)}</span><span style="color:var(--accent);font-weight:700;">${has ? '✓' : '+'}</span>
    </button>`;
  }).join('');
  m.innerHTML = `<div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:400px;width:100%;max-height:80vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <h3 style="font-size:15px;font-weight:700;color:var(--accent);">В коллекцию</h3>
      <button onclick="document.getElementById('addToColModal').remove()" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;">✕</button>
    </div>
    <div id="addToColRows">${rows || '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px;">Пока нет коллекций</div>'}</div>
    <div style="display:flex;gap:8px;margin-top:10px;">
      <input id="newColName" placeholder="Новая коллекция" style="flex:1;padding:10px 12px;background:var(--bg-primary);border:1px solid var(--border);border-radius:10px;color:var(--text-primary);font-family:inherit;font-size:13px;">
      <button onclick="createCollectionFromModal(${bookId})" style="padding:10px 14px;background:var(--accent-gradient);border:none;border-radius:10px;color:#fff;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;">Создать</button>
    </div>
  </div>`;
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  document.body.appendChild(m);
}

async function toggleBookInCollection(colId, bookId, has) {
  try {
    if (has) await api.library.removeFromCollection(colId, bookId);
    else await api.library.addToCollection(colId, bookId);
    if (navigator.vibrate) navigator.vibrate(10);
    await getCollections(true);
    openAddToCollection(bookId); // перерисовать
  } catch (_) { showToast('Ошибка'); }
}

async function createCollectionFromModal(bookId) {
  const name = document.getElementById('newColName')?.value.trim();
  if (!name) { showToast('Введите название'); return; }
  try {
    const col = await api.library.createCollection(name);
    await api.library.addToCollection(col.id, bookId);
    await getCollections(true);
    showToast('Коллекция создана');
    openAddToCollection(bookId);
  } catch (err) {
    showToast(err && err.detail ? err.detail : 'Не удалось создать');
  }
}

function renderDetailTraining() {
  if (!currentBookId) return;
  const isAdmin = state.currentUser?.role === 'admin';
  const adminBtn = isAdmin
    ? `<button onclick="regenerateBookQuiz(${currentBookId})" id="regenQuizBtn" style="margin-top:14px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 16px;background:rgba(168,85,247,0.15);border:1px solid rgba(168,85,247,0.5);border-radius:10px;color:#c084fc;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;">${ICONS.sparkles || ''}<span>Пересоздать тест (ИИ)</span></button>`
    : '';
  const c = state.completedQuizzes[state.currentUser?.name] || [];
  if (c.includes(currentBookId)) {
    document.getElementById('detailTabTraining').innerHTML = `
      <div style="text-align:center;padding:20px;">
        <div style="font-size:48px;">${ICONS.check}</div>
        <p>Пройдено!</p>
        <button class="btn-quiz primary" onclick="startQuiz(${currentBookId})" style="display:inline-flex;align-items:center;justify-content:center;gap:6px;">${ICONS.refresh}<span>Заново</span></button>
        <div>${adminBtn}</div>
        </div>`;
  } else {
    startQuiz(currentBookId);
  }
}

async function regenerateBookQuiz(bookId) {
  if (!confirm('Пересоздать тест через ИИ? Старые вопросы будут заменены.')) return;
  const btn = document.getElementById('regenQuizBtn');
  if (btn) { btn.disabled = true; btn.querySelector('span').textContent = 'Генерация…'; }
  try {
    const questions = await api.library.regenerateQuiz(bookId);
    delete quizCache[bookId];
    showToast(`Тест пересоздан: ${questions.length} вопросов`);
    startQuiz(bookId);
  } catch (err) {
    const msg = (err && err.status) ? `Ошибка (${err.status})` : 'Не удалось пересоздать тест';
    showToast(msg);
    if (btn) { btn.disabled = false; btn.querySelector('span').textContent = 'Пересоздать тест (ИИ)'; }
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

// ========== ОФФЛАЙН-ОЧЕРЕДЬ СИНХРОНИЗАЦИИ ==========
// Если сохранить прогресс на сервер не удалось (нет сети) — кладём в очередь
// и досылаем, когда сеть появится. Конфликт прогресса решается по max(page).
const SYNC_QUEUE_KEY = 'aegis_sync_queue';

function _loadSyncQueue() {
  try { return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '{}'); }
  catch (_) { return {}; }
}
function _saveSyncQueue(q) {
  try { localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(q)); } catch (_) {}
}

// Поставить прогресс книги в очередь (перезаписывает прежний — нужен только последний)
function queueProgress(bookId, currentPage, totalPages) {
  const q = _loadSyncQueue();
  q['progress_' + bookId] = {
    type: 'progress', bookId, currentPage, totalPages, ts: Date.now(),
  };
  _saveSyncQueue(q);
}

// Досылка очереди на сервер
let _syncing = false;
async function flushSyncQueue() {
  if (_syncing || !navigator.onLine || !api.isAuthenticated()) return;
  const q = _loadSyncQueue();
  const keys = Object.keys(q);
  if (!keys.length) return;
  _syncing = true;
  let sentAny = false;
  for (const key of keys) {
    const item = q[key];
    try {
      if (item.type === 'progress') {
        await api.library.updateProgress(item.bookId, item.currentPage, item.totalPages);
      }
      delete q[key];
      sentAny = true;
    } catch (e) {
      // не удалось — оставляем в очереди, прервёмся (сеть, видимо, снова пропала)
      break;
    }
  }
  _saveSyncQueue(q);
  _syncing = false;
  if (sentAny && Object.keys(q).length === 0) {
    // всё досланоо — обновим прогресс с сервера (вдруг другое устройство тоже писало)
    await loadProgressFromApi();
  }
}

// При появлении сети — досылаем очередь
window.addEventListener('online', () => {
  showToast('Соединение восстановлено, синхронизируем…');
  flushSyncQueue();
});
window.addEventListener('offline', () => {
  showToast('Нет сети — изменения сохранятся локально');
});

// ========== ПЕРИОДИЧЕСКАЯ СИНХРОНИЗАЦИЯ (polling) ==========
// Раз в 30 сек, когда вкладка активна, подтягиваем свежий прогресс с сервера
// (на случай чтения с другого устройства) и досылаем очередь.
let _syncPollTimer = null;
const SYNC_POLL_MS = 30000;

function startSyncPolling() {
  if (_syncPollTimer) return;
  _syncPollTimer = setInterval(async () => {
    if (document.hidden || !api.isAuthenticated() || !navigator.onLine) return;
    // не мешаем активному чтению — синхронизируем прогресс в фоне
    await flushSyncQueue();
    try {
      await loadProgressFromApi();
      // обновим экран «Продолжить чтение», если пользователь на главной
      if (state.currentScreen === 'home' && typeof renderHome === 'function') renderHome();
    } catch (_) {}
  }, SYNC_POLL_MS);
}

function stopSyncPolling() {
  if (_syncPollTimer) { clearInterval(_syncPollTimer); _syncPollTimer = null; }
}

// При возврате на вкладку — сразу синхронизируем
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && api.isAuthenticated()) {
    flushSyncQueue();
  }
});

async function loadProgressFromApi() {
  try {
    const entries = await api.library.progress();
    const serverProgress = {};
    entries.forEach(p => {
      serverProgress[p.book_id] = {
        currentPage: p.current_page,
        totalPages: p.total_pages,
        started: p.started,
        lastReadAt: p.last_read_at || null,
      };
    });
    // Разрешение конфликта: если локально прочитано ДАЛЬШE, чем на сервере —
    // оставляем локальный прогресс и досылаем его на сервер (мы прочитали больше).
    const local = state.readingProgress || {};
    Object.keys(local).forEach(bid => {
      const lp = local[bid], sp = serverProgress[bid];
      if (lp && lp.started && (!sp || (lp.currentPage || 0) > (sp.currentPage || 0))) {
        serverProgress[bid] = lp;
        queueProgress(Number(bid), lp.currentPage, lp.totalPages);
      }
    });
    state.readingProgress = serverProgress;
    flushSyncQueue();
    startSyncPolling();
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
    console.error('Не удалось сохранить прогресс, ставим в очередь:', err);
    queueProgress(bookId, p.currentPage, p.totalPages);
  }
}

window.addEventListener('beforeunload', () => {
  if (!progressPendingBookId) return;
  const bookId = progressPendingBookId;
  const p = state.readingProgress[bookId];
  if (!p) return;
  try {
    fetch(api.baseUrl + '/books/' + bookId + '/progress', {
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
async function saveBookOffline(bookId, silent) {
  const book = state.books.find(b => b.id === bookId);
  if (!book) { if (!silent) showToast('Книга не найдена'); return; }
  if (!book.has_file) { if (!silent) showToast('У книги нет файла для скачивания'); return; }

  if (!silent) showToast('Скачиваем книгу...');

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
    if (!silent) showToast(`Сохранено оффлайн (${sizeMB} МБ)`);

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
  // Запоминаем откуда пришли (для умного возврата)
  state._readerReturnTo = state.currentScreen === 'reader' ? 'home' : state.currentScreen;
  navigateTo('reader');
  const btnSearch = document.getElementById('btnReaderSearch');
  if (btnSearch && !btnSearch.innerHTML.trim()) btnSearch.innerHTML = ICONS.search;
  // Заполняем SVG-иконки в кнопках шапки читалки
  const btnPom = document.getElementById('btnPomodoro');
  const btnExp = document.getElementById('btnExportNotes');
  if (btnPom && !btnPom.innerHTML.trim()) btnPom.innerHTML = ICONS.timer;
  if (btnExp && !btnExp.innerHTML.trim()) btnExp.innerHTML = ICONS.export;
  // Также заполняем SVG в toolbar выделения текста PDF
  const btnHighlight = document.getElementById('btnPdfHighlight');
  const btnNote = document.getElementById('btnPdfNote');
  if (btnHighlight && !btnHighlight.querySelector('svg')) {
    btnHighlight.innerHTML = ICONS.marker + '<span>Маркер</span>';
  }
  if (btnNote && !btnNote.querySelector('svg')) {
    btnNote.innerHTML = ICONS.note + '<span>Заметка</span>';
  }
  // Применяем сохранённую тему чтения
  applyReaderTheme(getReaderTheme());
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
    <button id="epubBtnHighlight" style="background:transparent;border:none;color:#fbbf24;font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;padding:6px 10px;border-radius:6px;display:inline-flex;align-items:center;gap:5px;">
      ${ICONS.marker}<span>Маркер</span>
    </button>
    <button id="epubBtnNote" style="background:transparent;border:none;color:var(--accent);font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;padding:6px 10px;border-radius:6px;display:inline-flex;align-items:center;gap:5px;">
      ${ICONS.note}<span>Заметка</span>
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
    const sel = selectedText, cfi = cfiRange, ctx = contents;
    showPromptModal({
      title: 'Заметка к выделению',
      placeholder: 'Введите текст заметки…',
      confirmText: 'Сохранить',
      onConfirm: async (noteText) => {
        await saveEpubAnnotation('note', sel, cfi, noteText || '');
        if (ctx && ctx.window) ctx.window.getSelection().removeAllRanges();
      },
    });
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
  // Если пользователь выделяет текст — не листаем (иначе выделение срывается)
  const sel = window.getSelection();
  if (sel && sel.toString().trim().length > 0) {
    return;
  }
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
  if (typeof updateBookmarkIcon === 'function') updateBookmarkIcon();

  const overlayCurrent = document.getElementById('pageCurrent');
  const overlayTotal = document.getElementById('pageTotal');
  if (overlayCurrent) overlayCurrent.textContent = current;
  if (overlayTotal) overlayTotal.textContent = total;

  flashPageIndicator();
}

// ===== D: Закладки страниц (быстрый переход, отдельно от аннотаций) =====
const PAGE_BOOKMARKS_KEY = 'aegis_page_bookmarks';
function getPageBookmarks() {
  try { return JSON.parse(localStorage.getItem(PAGE_BOOKMARKS_KEY) || '{}'); } catch (_) { return {}; }
}
function savePageBookmarks(obj) { localStorage.setItem(PAGE_BOOKMARKS_KEY, JSON.stringify(obj)); }
function getBookBookmarks(bookId) {
  const all = getPageBookmarks();
  return all[bookId] || [];
}
function currentReaderPage() {
  return isEpubMode ? epubCurrentPage : pdfCurrentPage;
}
function togglePageBookmark() {
  if (!currentBookId) return;
  const all = getPageBookmarks();
  const page = currentReaderPage();
  const list = all[currentBookId] || [];
  const idx = list.indexOf(page);
  if (idx >= 0) { list.splice(idx, 1); showToast('Закладка убрана'); }
  else { list.push(page); list.sort((a, b) => a - b); showToast('Страница в закладках'); }
  all[currentBookId] = list;
  savePageBookmarks(all);
  if (navigator.vibrate) navigator.vibrate(12);
  updateBookmarkIcon();
}
function updateBookmarkIcon() {
  const icon = document.getElementById('bookmarkIcon');
  if (!icon || !currentBookId) return;
  const has = getBookBookmarks(currentBookId).includes(currentReaderPage());
  icon.setAttribute('fill', has ? 'var(--accent)' : 'none');
  icon.setAttribute('stroke', has ? 'var(--accent)' : 'currentColor');
}
function openBookmarksList() {
  if (!currentBookId) return;
  const list = getBookBookmarks(currentBookId);
  const ex = document.getElementById('bookmarksListModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'bookmarksListModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  const rows = list.length
    ? list.map(p => `<button onclick="jumpToBookmark(${p})" style="display:flex;justify-content:space-between;align-items:center;width:100%;padding:12px 14px;margin-bottom:6px;border-radius:10px;border:1px solid var(--border);background:var(--bg-primary);color:var(--text-primary);cursor:pointer;font-family:inherit;font-size:13px;">
        <span>${ICONS.bookmark} Страница ${p}</span>
        <span onclick="event.stopPropagation();removeBookmark(${p})" style="color:#ef4444;font-size:16px;padding:0 6px;">✕</span>
      </button>`).join('')
    : '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:20px;">Закладок пока нет. Нажмите на флажок в панели, чтобы добавить.</div>';
  m.innerHTML = `<div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:380px;width:100%;max-height:75vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <h3 style="font-size:15px;font-weight:700;color:var(--accent);">Закладки</h3>
      <button onclick="document.getElementById('bookmarksListModal').remove()" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;">✕</button>
    </div>
    <div id="bookmarksListRows">${rows}</div>
  </div>`;
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  document.body.appendChild(m);
}
function jumpToBookmark(page) {
  const m = document.getElementById('bookmarksListModal');
  if (m) m.remove();
  goToPage(page);
}
function removeBookmark(page) {
  const all = getPageBookmarks();
  all[currentBookId] = (all[currentBookId] || []).filter(p => p !== page);
  savePageBookmarks(all);
  updateBookmarkIcon();
  openBookmarksList();
}

// ===== E2: Оглавление (TOC) с прогрессом по главам =====
let _currentTOC = null;

// ===== E3: Режим повторения (flashcards из заметок, spaced-repetition) =====
const SRS_KEY = 'aegis_srs';            // {cardId: {box, due}}
const SRS_BOXES = [1, 2, 4, 7, 14, 30]; // интервалы в днях по «коробкам» Лейтнера

function getSRS() { try { return JSON.parse(localStorage.getItem(SRS_KEY) || '{}'); } catch (_) { return {}; } }
function saveSRS(o) { localStorage.setItem(SRS_KEY, JSON.stringify(o)); }

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
  m.innerHTML = `<div style="max-width:460px;width:100%;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <h3 style="font-size:16px;font-weight:800;color:#fff;">Повторение</h3>
      <button onclick="document.getElementById('reviewModal').remove()" style="background:rgba(255,255,255,0.1);border:none;color:#fff;cursor:pointer;font-size:18px;width:34px;height:34px;border-radius:50%;">✕</button>
    </div>
    <div id="reviewBody" style="color:#fff;text-align:center;padding:30px;">Готовлю карточки…</div>
  </div>`;
  document.body.appendChild(m);

  const all = await buildFlashcards();
  if (!all.length) {
    document.getElementById('reviewBody').innerHTML = '<div style="padding:30px;color:rgba(255,255,255,0.7);">Нет карточек. Делайте выделения и заметки в книгах — они станут карточками для повторения.</div>';
    return;
  }
  _reviewQueue = dueCards(all);
  if (!_reviewQueue.length) {
    document.getElementById('reviewBody').innerHTML = `<div style="padding:30px;color:rgba(255,255,255,0.7);">На сегодня всё повторено! 🎉<br><br>Всего карточек: ${all.length}. Возвращайтесь завтра.</div>`;
    return;
  }
  _reviewIdx = 0;
  renderReviewCard();
}

function renderReviewCard() {
  const body = document.getElementById('reviewBody');
  if (!body) return;
  if (_reviewIdx >= _reviewQueue.length) {
    body.innerHTML = `<div style="padding:30px;color:#fff;">Сессия завершена! 🎉<br><br>Повторено карточек: ${_reviewQueue.length}</div>`;
    return;
  }
  const c = _reviewQueue[_reviewIdx];
  body.innerHTML = `
    <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:10px;">${_reviewIdx + 1} из ${_reviewQueue.length} · ${eh(c.bookTitle)}</div>
    <div id="flashcard" onclick="flipFlashcard()" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:16px;padding:30px 22px;min-height:160px;display:flex;align-items:center;justify-content:center;cursor:pointer;margin-bottom:16px;">
      <div id="flashFront" style="font-size:15px;line-height:1.5;color:var(--text-primary);">${eh(c.front)}</div>
      <div id="flashBack" style="display:none;font-size:14px;line-height:1.5;color:var(--accent);">${eh(c.back)}</div>
    </div>
    <div id="flashHint" style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:14px;">Нажмите на карточку, чтобы увидеть ответ</div>
    <div id="flashRating" style="display:none;gap:8px;">
      <button onclick="rateCard(false)" style="flex:1;padding:14px;background:#ef444425;border:1px solid #ef444466;border-radius:10px;color:#ef4444;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;">Повторить ещё</button>
      <button onclick="rateCard(true)" style="flex:1;padding:14px;background:#10b98125;border:1px solid #10b98166;border-radius:10px;color:#10b981;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;">Помню</button>
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

async function buildTOC() {
  // Возвращает [{title, page}] из PDF outline или EPUB navigation
  const items = [];
  try {
    if (isEpubMode && epubBook) {
      const nav = await epubBook.loaded.navigation;
      (nav.toc || []).forEach((it, i) => {
        items.push({ title: it.label.trim(), page: i + 1, href: it.href });
      });
    } else if (pdfDoc) {
      const outline = await pdfDoc.getOutline();
      if (outline) {
        for (const it of outline) {
          let page = null;
          try {
            if (it.dest) {
              const dest = typeof it.dest === 'string' ? await pdfDoc.getDestination(it.dest) : it.dest;
              if (dest && dest[0]) {
                const idx = await pdfDoc.getPageIndex(dest[0]);
                page = idx + 1;
              }
            }
          } catch (_) {}
          items.push({ title: it.title.trim(), page: page });
        }
      }
    }
  } catch (_) {}
  return items;
}

const TOC_READ_KEY = 'aegis_toc_read';
function getTocRead(bookId) {
  try { return JSON.parse(localStorage.getItem(TOC_READ_KEY) || '{}')[bookId] || []; } catch (_) { return []; }
}
function toggleTocRead(bookId, idx) {
  let all = {};
  try { all = JSON.parse(localStorage.getItem(TOC_READ_KEY) || '{}'); } catch (_) {}
  const list = all[bookId] || [];
  const i = list.indexOf(idx);
  if (i >= 0) list.splice(i, 1); else list.push(idx);
  all[bookId] = list;
  localStorage.setItem(TOC_READ_KEY, JSON.stringify(all));
  if (navigator.vibrate) navigator.vibrate(8);
  renderTocPanel();
}

async function openTOC() {
  if (!currentBookId) return;
  const ex = document.getElementById('tocModal');
  if (ex) ex.remove();
  const m = document.createElement('div');
  m.id = 'tocModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  m.innerHTML = `<div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:440px;width:100%;max-height:80vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <h3 style="font-size:15px;font-weight:700;color:var(--accent);">Оглавление</h3>
      <button onclick="document.getElementById('tocModal').remove()" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;">✕</button>
    </div>
    <div id="tocPanelBody" style="font-size:13px;color:var(--text-muted);text-align:center;padding:16px;">Загружаю оглавление…</div>
  </div>`;
  m.onclick = (e) => { if (e.target === m) m.remove(); };
  document.body.appendChild(m);
  _currentTOC = await buildTOC();
  renderTocPanel();
}

function renderTocPanel() {
  const body = document.getElementById('tocPanelBody');
  if (!body) return;
  if (!_currentTOC || !_currentTOC.length) {
    body.style.textAlign = 'center';
    body.innerHTML = '<div style="padding:16px;color:var(--text-muted);">В этой книге нет встроенного оглавления.</div>';
    return;
  }
  const read = getTocRead(currentBookId);
  const total = _currentTOC.length;
  const doneCount = read.length;
  const pct = Math.round(doneCount / total * 100);
  body.style.textAlign = 'left';
  body.style.padding = '0';
  body.innerHTML = `
    <div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px;"><span>Прогресс по главам</span><span>${doneCount}/${total} · ${pct}%</span></div>
      <div style="height:6px;background:var(--bg-primary);border-radius:3px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:var(--accent-gradient);"></div></div>
    </div>
    ${_currentTOC.map((it, i) => {
      const isRead = read.includes(i);
      return `<div style="display:flex;align-items:center;gap:8px;padding:9px 6px;border-bottom:1px solid var(--border);">
        <button onclick="toggleTocRead(${currentBookId},${i})" title="Отметить прочитанным" style="width:22px;height:22px;flex-shrink:0;border-radius:6px;border:2px solid ${isRead ? 'var(--accent)' : 'var(--border-light)'};background:${isRead ? 'var(--accent)' : 'transparent'};color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;">${isRead ? '✓' : ''}</button>
        <div onclick="${it.page ? `tocGoTo(${it.page})` : ''}" style="flex:1;cursor:${it.page ? 'pointer' : 'default'};font-size:13px;color:${isRead ? 'var(--text-muted)' : 'var(--text-primary)'};${isRead ? 'text-decoration:line-through;' : ''}">
          ${eh(it.title)}${it.page ? `<span style="color:var(--text-muted);font-size:11px;"> · стр. ${it.page}</span>` : ''}
        </div>
      </div>`;
    }).join('')}`;
}

function tocGoTo(page) {
  const m = document.getElementById('tocModal');
  if (m) m.remove();
  goToPage(page);
}

function goToPage(pn) {
  const total = isEpubMode ? (epubTotalPages || 1) : pdfTotalPages;
  const target = Math.max(1, Math.min(pn, total));
  if (navigator.vibrate) navigator.vibrate(8);

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
    if (typeof ePub === 'undefined') {
      showToast('EPUB-движок не загрузился. Проверьте интернет/доступ к CDN.');
      closeReader();
      return;
    }
    epubBook = ePub(epubData);
    epubRendition = epubBook.renderTo(container, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
    });
    // Применяем тему после создания rendition
  setTimeout(() => applyReaderTheme(getReaderTheme()), 100);

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

  // Сначала пробуем IndexedDB (оффлайн-книги — читаем из байтов)
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

  if (typeof pdfjsLib === 'undefined') {
    showToast('PDF-движок не загрузился. Проверьте интернет/доступ к CDN.');
    return;
  }

  // Если не оффлайн — грузим ПРОГРЕССИВНО по URL (pdf.js тянет страницы по частям,
  // первая страница появляется почти сразу, не дожидаясь всего файла).
  try {
    let loadingTask;
    if (fromOffline && bytes) {
      loadingTask = pdfjsLib.getDocument({ data: bytes });
    } else {
      if (!b.has_file) {
        pl.classList.remove('hidden');
        c.classList.add('hidden');
        generateDemoPdf(b);
        return;
      }
      const cfg = api.books.pdfStreamConfig(b.id);
      loadingTask = pdfjsLib.getDocument({
        url: cfg.url,
        httpHeaders: cfg.httpHeaders,
        withCredentials: cfg.withCredentials,
        rangeChunkSize: 262144,       // 256 КБ на чанк
        disableAutoFetch: true,        // не докачивать весь файл в фоне
        disableStream: false,
      });
    }
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
  // При перерисовке страницы — снимаем подсветку поиска
  clearReaderSearchHighlights();

  const page = await pdfDoc.getPage(pn);
  const viewport1 = page.getViewport({ scale: 1 });

  const container = document.getElementById('pdfViewport');
  if (!container) return;

  // Иногда clientWidth ещё 0/крошечный (рендер до раскладки) — подстраховываемся
  // шириной окна, иначе страница выходит микроскопической в углу.
  let containerWidth = container.clientWidth;
  if (!containerWidth || containerWidth < 200) {
    containerWidth = Math.min(window.innerWidth - 32, 1100);
  }
  const isMobile = window.innerWidth < 700;
  // На ПК страница ~в 2 раза меньше прежнего (масштаб браузера 100%).
  let maxWidth;
  if (isMobile) {
    maxWidth = containerWidth;
  } else if (window.innerWidth >= 1600) {
    maxWidth = 650;
  } else if (window.innerWidth >= 1024) {
    maxWidth = 550;
  } else {
    maxWidth = 600;
  }
  let targetWidth = Math.min(containerWidth - (isMobile ? 0 : 24), maxWidth);
  // Множитель размера шрифта из настроек (90–130%)
  const fontScale = (parseInt(localStorage.getItem('aegis_reader_font') || '100', 10)) / 100;
  targetWidth = Math.min(targetWidth * fontScale, containerWidth - (isMobile ? 0 : 12));

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
  // Первая страница (обложка) не инвертируется в тёмной теме
  if (pn === 1) canvas.classList.add('no-invert');
  else canvas.classList.remove('no-invert');

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
    const cssHeight = viewport.height;
    // Читаем offsetLeft/Top ПОСЛЕ применения стилей canvas (через rAF),
    // иначе margin:0 auto ещё не применён и слой уезжает.
    await new Promise(r => requestAnimationFrame(r));
    textLayerDiv.style.position = 'absolute';
    textLayerDiv.style.left = canvas.offsetLeft + 'px';
    textLayerDiv.style.top = canvas.offsetTop + 'px';
    textLayerDiv.style.transform = 'none';
    textLayerDiv.style.width = targetWidth + 'px';
    textLayerDiv.style.height = cssHeight + 'px';
    textLayerDiv.style.pointerEvents = 'auto';
    textLayerDiv.style.setProperty('--scale-factor', String(viewport.scale));

    try {
      const textContent = await page.getTextContent();
      // Сохраняем плоский текст страницы — ассистент сможет отвечать по нему
      try {
        readerCurrentPageText = (textContent.items || []).map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
      } catch (_) { readerCurrentPageText = ''; }
      pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport: viewport,
        textDivs: [],
      });
    } catch (e) {
      console.warn('Text layer error:', e);
    }
  }

  // Восстанавливаем аннотации
  if (typeof renderAnnotations === 'function') {
    await renderAnnotations();
  }
  // Если активен поиск — подсвечиваем совпадения на этой странице
  if (readerSearchActive && readerSearchResults.length > 0) {
    const currentResult = readerSearchResults[readerSearchIndex];
    if (currentResult && currentResult.page === pdfCurrentPage) {
      setTimeout(() => highlightPdfMatchOnPage(currentResult), 100);
    }
  }
}

// ========== ЧИТАЛКА: ТЁМНАЯ ТЕМА ==========

const READER_THEME_KEY = 'aegis_reader_theme';

function getReaderTheme() {
  return localStorage.getItem(READER_THEME_KEY) || 'light';
}

function applyReaderTheme(theme) {
  const screen = document.getElementById('readerScreen');
  if (theme === 'dark') {
    screen.classList.add('reader-theme-dark');
  } else {
    screen.classList.remove('reader-theme-dark');
  }

  // Обновляем иконку на кнопке
  const btn = document.getElementById('btnReaderTheme');
  if (btn) {
    btn.innerHTML = ICONS.theme;
    btn.title = theme === 'dark' ? 'Светлая тема' : 'Тёмная тема';
  }

  // Для EPUB — применяем тему через epubjs
  if (typeof epubRendition !== 'undefined' && epubRendition) {
    try {
      epubRendition.themes.register('aegis-dark', {
        'body': {
          'background': '#1a1a1a !important',
          'color': '#e0e0e0 !important',
        },
        'p, div, span, h1, h2, h3, h4, h5, h6, li, td, th, blockquote': {
          'color': '#e0e0e0 !important',
        },
        'a': {
          'color': '#00d4ff !important',
        },
      });
      epubRendition.themes.register('aegis-light', {
        'body': {
          'background': '#fff !important',
          'color': '#000 !important',
        },
      });
      epubRendition.themes.select(theme === 'dark' ? 'aegis-dark' : 'aegis-light');
    } catch (e) {
      console.warn('Не удалось применить тему EPUB:', e);
    }
  }
}

function toggleReaderTheme() {
  const current = getReaderTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(READER_THEME_KEY, next);
  applyReaderTheme(next);
  showToast(next === 'dark' ? 'Тёмная тема' : 'Светлая тема');
}

// ========== ПОИСК ПО КНИГЕ ==========

let readerSearchResults = [];   // массив совпадений
let readerSearchIndex = -1;     // текущий индекс
let readerSearchActive = false;
let readerSearchDebounce = null;

function toggleReaderSearch() {
  const panel = document.getElementById('readerSearchPanel');
  if (!panel) return;
  const willOpen = panel.style.display === 'none' || !panel.style.display;
  panel.style.display = willOpen ? 'flex' : 'none';
  if (willOpen) {
    // Заполняем SVG-иконки на кнопках (один раз)
    const prev = document.getElementById('readerSearchPrev');
    const next = document.getElementById('readerSearchNext');
    const close = document.getElementById('readerSearchClose');
    if (prev && !prev.innerHTML.trim()) prev.innerHTML = ICONS.chevronUp;
    if (next && !next.innerHTML.trim()) next.innerHTML = ICONS.chevronDown;
    if (close && !close.innerHTML.trim()) close.innerHTML = ICONS.closeX;

    readerSearchActive = true;
    const input = document.getElementById('readerSearchInput');
    input.value = '';
    setReaderSearchStatus('—');
    setTimeout(() => input.focus(), 50);
  } else {
    closeReaderSearch();
  }
}

function closeReaderSearch() {
  const panel = document.getElementById('readerSearchPanel');
  if (panel) panel.style.display = 'none';
  readerSearchActive = false;
  readerSearchResults = [];
  readerSearchIndex = -1;
  clearReaderSearchHighlights();
}

function setReaderSearchStatus(text) {
  const el = document.getElementById('readerSearchStatus');
  if (el) el.textContent = text;
}

async function runReaderSearch(query) {
  query = (query || '').trim();
  if (!query || query.length < 2) {
    readerSearchResults = [];
    readerSearchIndex = -1;
    setReaderSearchStatus('—');
    clearReaderSearchHighlights();
    return;
  }
  setReaderSearchStatus('Идёт поиск…');
  try {
    if (isEpubMode) {
      readerSearchResults = await searchInEpub(query);
    } else {
      readerSearchResults = await searchInPdf(query);
    }
    if (readerSearchResults.length === 0) {
      readerSearchIndex = -1;
      setReaderSearchStatus('0 / 0');
      return;
    }
    readerSearchIndex = 0;
    setReaderSearchStatus(`1 / ${readerSearchResults.length}`);
    await jumpToSearchResult(0);
  } catch (e) {
    console.error('Search error:', e);
    setReaderSearchStatus('Ошибка');
  }
}

async function readerSearchNext() {
  if (readerSearchResults.length === 0) return;
  readerSearchIndex = (readerSearchIndex + 1) % readerSearchResults.length;
  setReaderSearchStatus(`${readerSearchIndex + 1} / ${readerSearchResults.length}`);
  await jumpToSearchResult(readerSearchIndex);
}

async function readerSearchPrev() {
  if (readerSearchResults.length === 0) return;
  readerSearchIndex = (readerSearchIndex - 1 + readerSearchResults.length) % readerSearchResults.length;
  setReaderSearchStatus(`${readerSearchIndex + 1} / ${readerSearchResults.length}`);
  await jumpToSearchResult(readerSearchIndex);
}

async function jumpToSearchResult(idx) {
  const r = readerSearchResults[idx];
  if (!r) return;
  if (isEpubMode) {
    if (epubRendition && r.cfi) {
      try {
        // Снимаем предыдущую подсветку поиска
        if (window._lastEpubSearchCfi) {
          try { epubRendition.annotations.remove(window._lastEpubSearchCfi, 'highlight'); } catch (_) {}
        }
        await epubRendition.display(r.cfi);
        // Подсвечиваем найденное место
        try {
          epubRendition.annotations.highlight(
            r.cfi,
            {},
            () => {},
            'epub-search-match',
            { fill: 'rgba(251, 191, 36, 0.5)', 'fill-opacity': 1 }
          );
          window._lastEpubSearchCfi = r.cfi;
        } catch (_) {}
      } catch (e) { console.warn(e); }
    }
  }else {
    if (r.page && r.page !== pdfCurrentPage) {
      pdfCurrentPage = r.page;
      await renderPdfPage(pdfCurrentPage);
      updateReaderUI();
    }
    // подсветка совпадения (после рендера text layer)
    setTimeout(() => highlightPdfMatchOnPage(r), 200);
  }
}

function clearReaderSearchHighlights() {
  document.querySelectorAll('.search-match-highlight').forEach(el => el.classList.remove('search-match-highlight'));
}

// Будут реализованы в следующих итерациях
async function searchInPdf(query) {
  if (!pdfDoc) return [];
  const lowerQuery = query.toLowerCase();
  const results = [];

  // Кэш текста страниц — чтобы при повторном поиске не парсить заново
  if (!window._pdfTextCache) window._pdfTextCache = {};

  for (let pageNum = 1; pageNum <= pdfTotalPages; pageNum++) {
    let pageText = window._pdfTextCache[`${currentBookId}_${pageNum}`];
    if (!pageText) {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const content = await page.getTextContent();
        pageText = content.items.map(it => it.str).join(' ');
        window._pdfTextCache[`${currentBookId}_${pageNum}`] = pageText;
      } catch (e) {
        continue; // пропустить битую страницу
      }
    }

    const lowerText = pageText.toLowerCase();
    let pos = 0;
    while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
      // Контекст ±40 символов вокруг совпадения
      const start = Math.max(0, pos - 40);
      const end = Math.min(pageText.length, pos + lowerQuery.length + 40);
      const snippet = (start > 0 ? '…' : '') + pageText.substring(start, end) + (end < pageText.length ? '…' : '');
      results.push({
        page: pageNum,
        snippet,
        matchStart: pos,
        matchEnd: pos + lowerQuery.length,
        query: query,
      });
      pos += lowerQuery.length;
      // Защита от слишком большого количества совпадений
      if (results.length > 500) return results;
    }

    // Прогресс в статусе каждые 20 страниц (для больших PDF)
    if (pageNum % 20 === 0) {
      setReaderSearchStatus(`Идёт поиск… ${pageNum}/${pdfTotalPages}`);
    }
  }
  return results;
}

async function searchInEpub(query) {
  if (!epubBook) return [];
  const lowerQuery = query.toLowerCase();
  const results = [];

  // epub.js: book.spine.spineItems — массив всех глав/разделов
  const spineItems = epubBook.spine.spineItems || [];
  const total = spineItems.length;

  for (let i = 0; i < total; i++) {
    const item = spineItems[i];
    try {
      // Загружаем главу
      await item.load(epubBook.load.bind(epubBook));
      const doc = item.document;
      if (!doc) {
        item.unload();
        continue;
      }

      // Достаём весь текст главы
      const text = doc.body ? (doc.body.innerText || doc.body.textContent || '') : '';
      const lowerText = text.toLowerCase();

      let pos = 0;
      while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
        // Контекст ±40 символов
        const start = Math.max(0, pos - 40);
        const end = Math.min(text.length, pos + lowerQuery.length + 40);
        const snippet = (start > 0 ? '…' : '') + text.substring(start, end) + (end < text.length ? '…' : '');

        // Получаем CFI для этого места
        // Используем cfiFromRange на временном Range
        let cfi = null;
        try {
          cfi = makeEpubCfiForOffset(doc, item, pos, pos + lowerQuery.length);
        } catch (e) {
          // Если не получилось — fallback: CFI на начало главы
          cfi = item.cfiBase ? item.cfiBase : null;
        }

        results.push({
          cfi: cfi,
          snippet: snippet,
          chapterIndex: i,
          query: query,
        });

        pos += lowerQuery.length;
        if (results.length > 500) {
          item.unload();
          return results;
        }
      }

      // Освобождаем главу
      item.unload();
    } catch (e) {
      console.warn('Search chapter error:', e);
      try { item.unload(); } catch (_) {}
    }

    // Прогресс в статусе
    if ((i + 1) % 5 === 0) {
      setReaderSearchStatus(`Идёт поиск… ${i + 1}/${total}`);
    }
  }
  return results;
}

// Вспомогательная: построить CFI для смещения в тексте главы
function makeEpubCfiForOffset(doc, spineItem, startOffset, endOffset) {
  if (!doc || !doc.body) return null;

  // Обходим текстовые ноды и считаем символы, пока не дойдём до startOffset
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
  let accumulated = 0;
  let startNode = null, startNodeOffset = 0;
  let endNode = null, endNodeOffset = 0;

  let node;
  while ((node = walker.nextNode())) {
    const len = node.textContent.length;
    if (!startNode && accumulated + len > startOffset) {
      startNode = node;
      startNodeOffset = startOffset - accumulated;
    }
    if (!endNode && accumulated + len >= endOffset) {
      endNode = node;
      endNodeOffset = endOffset - accumulated;
      break;
    }
    accumulated += len;
  }
  if (!startNode || !endNode) return null;

  const range = doc.createRange();
  range.setStart(startNode, startNodeOffset);
  range.setEnd(endNode, endNodeOffset);

  // epub.js: spineItem.cfiFromRange(range)
  if (typeof spineItem.cfiFromRange === 'function') {
    return spineItem.cfiFromRange(range);
  }
  return null;
}

function highlightPdfMatchOnPage(result) {
  clearReaderSearchHighlights();
  const textLayer = document.getElementById('pdfTextLayer');
  if (!textLayer || !result || !result.query) return;

  const query = result.query.toLowerCase();
  // Обходим все спаны text layer'а и подсвечиваем те, что содержат query
  const spans = textLayer.querySelectorAll('span');
  let firstMatch = null;
  spans.forEach(span => {
    const text = (span.textContent || '').toLowerCase();
    if (text.includes(query)) {
      span.classList.add('search-match-highlight');
      if (!firstMatch) firstMatch = span;
    }
  });
  // Скроллим к первому совпадению на странице
  if (firstMatch) {
    firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Привязываем обработчики ввода и горячих клавиш
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('readerSearchInput');
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(readerSearchDebounce);
    readerSearchDebounce = setTimeout(() => runReaderSearch(input.value), 350);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) readerSearchPrev();
      else readerSearchNext();
    } else if (e.key === 'Escape') {
      closeReaderSearch();
    }
  });

  initPullToRefresh();
  initReaderBrightnessGesture();
});

// ===== A2: Pull-to-refresh на главной =====
function initPullToRefresh() {
  let startY = 0, pulling = false, indicator = null;
  const THRESHOLD = 70;

  function getScroller() {
    // Тянем только когда на главной и страница вверху
    if (state.currentScreen !== 'home') return null;
    return document.scrollingElement || document.documentElement;
  }

  document.addEventListener('touchstart', (e) => {
    const sc = getScroller();
    if (!sc || sc.scrollTop > 5) { pulling = false; return; }
    startY = e.touches[0].clientY;
    pulling = true;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 10) {
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:4000;background:var(--bg-elevated);border:1px solid var(--border);border-radius:0 0 14px 14px;padding:8px 18px;font-size:12px;color:var(--accent);box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:opacity 0.2s;';
        document.body.appendChild(indicator);
      }
      const ready = dy >= THRESHOLD;
      indicator.textContent = ready ? '↓ Отпустите для обновления' : '↓ Потяните вниз';
      indicator.style.opacity = Math.min(1, dy / THRESHOLD);
    }
  }, { passive: true });

  document.addEventListener('touchend', async (e) => {
    if (!pulling || !indicator) { pulling = false; return; }
    const dy = (e.changedTouches[0]?.clientY || 0) - startY;
    const ind = indicator;
    indicator = null; pulling = false;
    if (dy >= THRESHOLD) {
      ind.textContent = '⟳ Обновляю…';
      if (navigator.vibrate) navigator.vibrate(15);
      try {
        await Promise.allSettled([
          loadBooksFromApi?.(),
          loadMyListFromApi?.(),
          loadProgressFromApi?.(),
        ]);
        if (typeof renderHome === 'function') renderHome();
        showToast('Обновлено');
      } catch (_) {}
    }
    ind.style.opacity = '0';
    setTimeout(() => ind.remove(), 250);
  });
}

// ===== A2: Gesture-zone яркости (вертикальный свайп слева в читалке) =====
let readerBrightness = parseFloat(localStorage.getItem('aegis_reader_brightness') || '1');
function applyReaderBrightness() {
  const vp = document.getElementById('pdfViewport');
  const ep = document.getElementById('epubViewport');
  [vp, ep].forEach(el => { if (el) el.style.filter = `brightness(${readerBrightness})`; });
}
function initReaderBrightnessGesture() {
  const zone = document.getElementById('tapZoneLeft');
  if (!zone) return;
  let startY = 0, startB = 1, active = false;
  zone.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY; startB = readerBrightness; active = true;
  }, { passive: true });
  zone.addEventListener('touchmove', (e) => {
    if (!active) return;
    const dy = startY - e.touches[0].clientY;       // вверх = ярче
    const delta = dy / 300;                          // чувствительность
    readerBrightness = Math.max(0.4, Math.min(1.6, startB + delta));
    applyReaderBrightness();
    if (Math.abs(dy) > 12) e.stopPropagation();      // чтобы не сработал тап-переход
  }, { passive: true });
  zone.addEventListener('touchend', () => {
    if (active) localStorage.setItem('aegis_reader_brightness', String(readerBrightness));
    active = false;
  });
  applyReaderBrightness();
}

// Ctrl+F / Cmd+F в читалке открывает панель
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f' && state.currentScreen === 'reader') {
    e.preventDefault();
    if (!readerSearchActive) toggleReaderSearch();
    else document.getElementById('readerSearchInput').focus();
  }
});

function closeReader() {
  hideEpubSelectionPopup();
  closeReaderSearch();
  if (window._pdfTextCache) window._pdfTextCache = {};
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

  const returnTo = state._readerReturnTo || 'home';
  state._readerReturnTo = null;
  navigateTo(returnTo);

  // Если возвращаемся на детальную — она уже отрендерена (currentBookId сохранён)
  // Иначе на home — он сам перерисуется

  // Снимаем подсветку поиска EPUB
  if (isEpubMode && epubRendition && window._lastEpubSearchCfi) {
    try { epubRendition.annotations.remove(window._lastEpubSearchCfi, 'highlight'); } catch (_) {}
  }
  window._lastEpubSearchCfi = null;
}

// ========== TEXT SELECTION ==========
function showSelectionToolbar() {
  if (state.currentScreen !== 'reader' || isEpubMode) return false;
  const s = window.getSelection();
  const selectedText = s ? s.toString().trim() : '';
  if (selectedText && selectedText.length > 0 && s.rangeCount > 0) {
    lastSelection = { text: selectedText, range: s.getRangeAt(0) };
    const toolbar = document.getElementById('selectionToolbar');
    const r = s.getRangeAt(0).getBoundingClientRect();
    const v = document.getElementById('pdfViewport').getBoundingClientRect();
    toolbar.style.display = 'flex';
    toolbar.style.left = Math.min(Math.max(r.left - v.left + r.width / 2 - 70, 10), v.width - 150) + 'px';
    toolbar.style.top = Math.max(r.top - v.top - 45, 5) + 'px';
    return true;
  }
  return false;
}

function hideSelectionToolbarSoon() {
  setTimeout(() => {
    if (!document.querySelector('.note-tooltip:hover') &&
        !document.querySelector('.selection-toolbar:hover')) {
      const tb = document.getElementById('selectionToolbar');
      if (tb) tb.style.display = 'none';
      lastSelection = null;
    }
  }, 200);
}

document.addEventListener('mouseup', function (e) {
  if (state.currentScreen !== 'reader' || isEpubMode) return;
  if (e.target.closest('.selection-toolbar')) return;
  if (!showSelectionToolbar()) hideSelectionToolbarSoon();
});

// Мобильные устройства: выделение пальцем завершается touchend.
// Задержка — чтобы браузер успел сформировать выделение (range).
document.addEventListener('touchend', function (e) {
  if (state.currentScreen !== 'reader' || isEpubMode) return;
  if (e.target.closest('.selection-toolbar')) return;
  setTimeout(() => {
    if (!showSelectionToolbar()) {
      // не скрываем агрессивно — на мобиле выделение может появиться чуть позже
    }
  }, 350);
}, { passive: true });

// Подстраховка: реагируем на изменение выделения (особенно на мобиле через ручки выделения)
document.addEventListener('selectionchange', function () {
  if (state.currentScreen !== 'reader' || isEpubMode) return;
  const s = window.getSelection();
  if (s && s.toString().trim().length > 0) {
    // дебаунс, чтобы не дёргать на каждое микродвижение
    clearTimeout(window._selToolbarTimer);
    window._selToolbarTimer = setTimeout(showSelectionToolbar, 400);
  }
});

// ===== A1: ИИ-функции читалки (словарь / объяснение / конспект) =====
function showReaderAiPopup(title, loadingText) {
  const ex = document.getElementById('readerAiPopup');
  if (ex) ex.remove();
  const p = document.createElement('div');
  p.id = 'readerAiPopup';
  p.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:6000;display:flex;align-items:center;justify-content:center;padding:16px;';
  p.innerHTML = `<div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:16px;padding:20px;max-width:460px;width:100%;max-height:80vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <h3 style="font-size:15px;font-weight:700;color:var(--accent);display:flex;align-items:center;gap:6px;">${ICONS.sparkles || ''}<span>${eh(title)}</span></h3>
      <button onclick="document.getElementById('readerAiPopup').remove()" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;width:30px;height:30px;border-radius:50%;">✕</button>
    </div>
    <div id="readerAiContent" style="font-size:13px;line-height:1.6;color:var(--text-primary);">
      <div style="display:flex;align-items:center;gap:8px;color:var(--text-muted);"><span class="ai-spinner" style="width:14px;height:14px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;display:inline-block;animation:spin 0.7s linear infinite;"></span>${eh(loadingText)}</div>
    </div>
  </div>`;
  p.onclick = (e) => { if (e.target === p) p.remove(); };
  document.body.appendChild(p);
}

async function runReaderAi(prompt, title, loading) {
  if (navigator.vibrate) navigator.vibrate(10);
  const tb = document.getElementById('selectionToolbar');
  if (tb) tb.style.display = 'none';
  showReaderAiPopup(title, loading);
  try {
    const ctx = buildAssistantContext(prompt);
    const data = await api.assistantChat([{ role: 'user', content: prompt }], ctx);
    const text = (data && (data.reply || data.content || data.message)) || (typeof data === 'string' ? data : '');
    const el = document.getElementById('readerAiContent');
    if (el) el.innerHTML = (typeof mdAssistant === 'function') ? mdAssistant(text) : eh(text).replace(/\n/g, '<br>');
  } catch (err) {
    const el = document.getElementById('readerAiContent');
    if (el) el.innerHTML = `<div style="color:#ef4444;">Не удалось получить ответ. ${err && err.status ? '(' + err.status + ')' : ''}</div>`;
  }
}

function lookupSelectionWord() {
  const word = (lastSelection?.text || '').trim();
  if (!word) return;
  runReaderAi(
    `Дай краткое определение и перевод термина «${word}» в контексте информационной безопасности. Коротко: 1) определение одним-двумя предложениями, 2) перевод на английский если термин русский (или на русский если английский).`,
    'Словарь: ' + (word.length > 30 ? word.slice(0, 30) + '…' : word),
    'Ищу определение…'
  );
}

function explainSelectionTerm() {
  const term = (lastSelection?.text || '').trim();
  if (!term) return;
  runReaderAi(
    `Объясни простыми словами, что означает «${term}» в контексте этой книги по кибербезопасности. Приведи короткий пример. Не более 4 предложений.`,
    'Объяснение',
    'Объясняю…'
  );
}

function summarizeCurrentChapter() {
  const pageText = (readerCurrentPageText || '').trim();
  if (!pageText) { showToast('Нет текста страницы для конспекта'); return; }
  runReaderAi(
    `Сделай краткое содержание этого фрагмента одним абзацем (3-4 предложения), выделив главную мысль:\n\n${pageText.slice(0, 4000)}`,
    'Краткое содержание',
    'Составляю конспект…'
  );
}

function highlightSelection(color) {
  if (!lastSelection || !currentBookId || isEpubMode) return;
  const v = document.getElementById('pdfViewport');
  const vr = v.getBoundingClientRect();
  const r = lastSelection.range.getBoundingClientRect();
  addHighlight(currentBookId, lastSelection.text, pdfCurrentPage, {
    x: (r.left - vr.left) / v.scrollWidth * 100,
    y: (r.top - vr.top) / v.scrollHeight * 100,
    w: r.width / v.scrollWidth * 100,
    h: r.height / v.scrollHeight * 100,
    color: color || '#fbbf24',
  });
  document.getElementById('selectionToolbar').style.display = 'none';
  window.getSelection().removeAllRanges();
  if (navigator.vibrate) navigator.vibrate(15);
  showToast('Выделено!');
}

function addNoteToSelection() {
  if (!lastSelection || !currentBookId || isEpubMode) return;
  const sel = lastSelection;  // фиксируем выделение, т.к. модалка асинхронная
  const v = document.getElementById('pdfViewport');
  const page = pdfCurrentPage;
  document.getElementById('selectionToolbar').style.display = 'none';
  showPromptModal({
    title: 'Заметка к выделенному тексту',
    placeholder: 'Введите текст заметки…',
    confirmText: 'Сохранить',
    onConfirm: (n) => {
      if (!n) return;
      const vr = v.getBoundingClientRect();
      const r = sel.range.getBoundingClientRect();
      addNote(currentBookId, sel.text, n, page, {
        x: (r.left - vr.left) / v.scrollWidth * 100,
        y: (r.top - vr.top) / v.scrollHeight * 100,
        w: r.width / v.scrollWidth * 100,
        h: r.height / v.scrollHeight * 100,
      });
      window.getSelection().removeAllRanges();
      showToast('Заметка сохранена');
    },
  });
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
  sel.innerHTML = categories.map(c => `<option value="${eh(c)}">${eh(c)}</option>`).join('');
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

  renderRecommendDepts(book);

  document.getElementById('adminBookModal').classList.remove('hidden');
}

// Вычисляет, каким подразделениям релевантна книга (по совпадению категорий/названия с темами)
function renderRecommendDepts(book) {
  const el = document.getElementById('adminRecommendDepts');
  if (!el) return;
  const hay = ((book.categories || []).join(' ') + ' ' + (book.title || '') + ' ' + (book.description || '')).toLowerCase();
  const matches = [];
  for (const [code, keywords] of Object.entries(DEPARTMENT_TOPICS)) {
    const hits = keywords.filter(k => hay.includes(k.toLowerCase())).length;
    if (hits > 0) matches.push({ code, hits });
  }
  matches.sort((a, b) => b.hits - a.hits);

  if (!matches.length) {
    el.innerHTML = '<div style="color:var(--text-muted);">Нет явных совпадений по темам. Книга подходит для общего доступа.</div>';
    return;
  }
  el.innerHTML = '<div style="margin-bottom:8px;">Книга релевантна подразделениям:</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
    matches.map(m => `
      <span style="display:inline-flex;align-items:center;gap:6px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:5px 10px;">
        <span style="font-weight:600;color:var(--text-primary);">${m.code}</span>
        <span style="font-size:10px;color:var(--text-muted);">${m.hits}</span>
        <button onclick="markRequiredForDept(${book.id}, '${m.code}', this)" title="Сделать обязательной для ${m.code}" style="background:rgba(0,212,255,0.15);border:none;color:var(--accent);border-radius:5px;padding:2px 7px;cursor:pointer;font-size:10px;font-family:inherit;">★ обязательная</button>
      </span>`).join('') +
    '</div>';
}

async function markRequiredForDept(bookId, deptCode, btn) {
  try {
    await api.library.setRequiredBook(bookId, deptCode);
    if (btn) { btn.textContent = '✓ отмечена'; btn.disabled = true; btn.style.opacity = '0.6'; }
    showToast(`Книга обязательна для ${deptCode}`);
  } catch (e) {
    showToast(e && e.detail ? e.detail : 'Не удалось отметить');
  }
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
  
  sel.innerHTML = categories.map(c => `<option value="${eh(c)}">${eh(c)}</option>`).join('');
  
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

// ========== УНИВЕРСАЛЬНОЕ МОДАЛЬНОЕ ПОДТВЕРЖДЕНИЕ ==========
function showConfirmModal({ title, message, confirmText = 'OK', cancelText = 'Отмена', danger = false, onConfirm }) {
  // Удаляем предыдущую модалку, если есть
  const ex = document.getElementById('confirmModal');
  if (ex) ex.remove();

  const modal = document.createElement('div');
  modal.id = 'confirmModal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px;animation:fadeIn 0.15s ease;';

  const confirmBtnColor = danger ? '#ef4444' : 'var(--accent)';
  const confirmBtnText = danger ? '#fff' : '#000';

  modal.innerHTML = `
    <div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:14px;padding:20px;max-width:360px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,0.5);">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:8px;color:var(--text-primary);">${eh(title)}</h3>
      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:18px;line-height:1.5;">${eh(message)}</p>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="confirmCancelBtn" style="background:transparent;border:1px solid var(--border);color:var(--text-secondary);padding:8px 16px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;">${eh(cancelText)}</button>
        <button id="confirmOkBtn" style="background:${confirmBtnColor};border:none;color:${confirmBtnText};padding:8px 16px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;">${eh(confirmText)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  document.getElementById('confirmCancelBtn').onclick = close;
  document.getElementById('confirmOkBtn').onclick = () => {
    close();
    if (typeof onConfirm === 'function') onConfirm();
  };
  // Клик по затемнённому фону тоже закрывает
  modal.onclick = (e) => { if (e.target === modal) close(); };
  // Escape — отмена
  const escHandler = (e) => {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);
}

// In-app аналог prompt() — чтобы не выскакивало нативное окно браузера
function showPromptModal({ title, placeholder = '', value = '', confirmText = 'Сохранить', cancelText = 'Отмена', multiline = true, onConfirm }) {
  const ex = document.getElementById('promptModal');
  if (ex) ex.remove();

  const modal = document.createElement('div');
  modal.id = 'promptModal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px;animation:fadeIn 0.15s ease;';

  const field = multiline
    ? `<textarea id="promptInput" rows="3" placeholder="${eh(placeholder)}" style="width:100%;resize:vertical;min-height:70px;">${eh(value)}</textarea>`
    : `<input id="promptInput" type="text" placeholder="${eh(placeholder)}" value="${eh(value)}" style="width:100%;">`;

  modal.innerHTML = `
    <div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:14px;padding:20px;max-width:400px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,0.5);">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:12px;color:var(--text-primary);">${eh(title)}</h3>
      ${field}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
        <button id="promptCancelBtn" style="background:transparent;border:1px solid var(--border);color:var(--text-secondary);padding:8px 16px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;">${eh(cancelText)}</button>
        <button id="promptOkBtn" style="background:var(--accent-gradient);border:none;color:#fff;padding:8px 16px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;">${eh(confirmText)}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const input = document.getElementById('promptInput');
  setTimeout(() => input?.focus(), 50);
  const close = () => modal.remove();
  document.getElementById('promptCancelBtn').onclick = close;
  document.getElementById('promptOkBtn').onclick = () => {
    const val = (input.value || '').trim();
    close();
    if (typeof onConfirm === 'function') onConfirm(val);
  };
  modal.onclick = (e) => { if (e.target === modal) close(); };
  const escHandler = (e) => {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
    if (e.key === 'Enter' && !multiline) { document.getElementById('promptOkBtn').click(); }
  };
  document.addEventListener('keydown', escHandler);
}

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
    } else if (bookFile && format !== 'epub') {
      // Обложка не задана вручную — генерируем из первой страницы PDF
      btn.textContent = 'Создание обложки...';
      try {
        const coverBlob = await generateCoverFromPdf(bookFile);
        if (coverBlob) {
          const coverGenFile = new File([coverBlob], 'cover.jpg', { type: 'image/jpeg' });
          await api.books.uploadCover(newId, coverGenFile);
        }
      } catch (err) {
        console.warn('Не удалось создать обложку из PDF:', err);
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

// ========== AI PANEL (читалка) — на общем бэкенд-движке ==========
let readerAiMessages = [];
let readerAiBusy = false;

function toggleAIPanel() {
  state.aiOpen = !state.aiOpen;
  document.getElementById('aiPanel').classList.toggle('show', state.aiOpen);
  document.getElementById('aiOverlay').classList.toggle('show', state.aiOpen);
  if (state.aiOpen) {
    const surface = assistantSurface('reader');
    if (surface.messages.length === 0) {
      surface.messages.push({
        role: 'assistant',
        content: 'Привет! Я AI-ассистент Aegis. Спроси про книгу, попроси саммари, тест или рекомендации.'
      });
    }
    assistantRender(surface);
    setTimeout(() => document.getElementById('aiInput')?.focus(), 100);
  }
}

function closeAIPanel() {
  state.aiOpen = false;
  document.getElementById('aiPanel').classList.remove('show');
  document.getElementById('aiOverlay').classList.remove('show');
  state.pendingAiAction = null;
}

function sendAIMessage() {
  const surface = assistantSurface('reader');
  const input = surface.inputEl();
  const text = input ? input.value : '';
  if (input) input.value = '';
  assistantSend(surface, text);
}

function aiQuick(action) {
  assistantHandleQuick(assistantSurface('reader'), action);
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
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding:12px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;gap:10px;">
      <div style="display:flex;align-items:baseline;gap:8px;">
        <div style="font-size:12px;color:var(--text-secondary);">Всего книг:</div>
        <div style="font-size:20px;font-weight:700;color:var(--accent);font-family:'JetBrains Mono',monospace;">${state.books.length}</div>
      </div>
      <button onclick="openBulkUploadModal()" style="background:var(--accent-gradient);border:none;color:#000;padding:8px 14px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/><path d="M12 5v8"/><path d="M8 9l4-4 4 4"/></svg>
        Массовая загрузка
      </button>
      <button onclick="reindexAllBooksUI()" title="Переиндексировать текст всех книг для поиска" style="background:rgba(0,212,255,0.12);border:1px solid rgba(0,212,255,0.4);color:var(--accent);padding:8px 14px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;margin-left:8px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
        Индексировать поиск
      </button>
      <button onclick="openAdminLogs()" title="Журнал действий администраторов" style="background:var(--bg-card);border:1px solid var(--border);color:var(--text-secondary);padding:8px 14px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;margin-left:8px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        Журнал
      </button>
      <button onclick="generateMissingCoversUI()" title="Создать обложки для книг без обложки" style="background:var(--bg-card);border:1px solid var(--border);color:var(--text-secondary);padding:8px 14px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;margin-left:8px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>
        Обложки
      </button>
      <button onclick="aiMatchArBooksUI()" title="ИИ подберёт книги к темам AR-схем" style="background:rgba(123,97,255,0.12);border:1px solid rgba(123,97,255,0.4);color:#7b61ff;padding:8px 14px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;margin-left:8px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/><circle cx="12" cy="12" r="3"/></svg>
        Подобрать книги для AR
      </button>
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
// ========== МАССОВАЯ ЗАГРУЗКА КНИГ ==========

let bulkUploadQueue = []; // [{file, status: 'pending'|'uploading'|'done'|'error', message}]
let bulkUploadInProgress = false;

// Рендер первой страницы PDF в JPEG-обложку (клиентская генерация)
async function generateCoverFromPdf(file) {
  if (typeof pdfjsLib === 'undefined') return null;
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    // Масштаб под обложку ~800px по ширине
    const baseViewport = page.getViewport({ scale: 1 });
    const targetWidth = 800;
    const scale = targetWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    // белый фон (PDF может быть с прозрачностью)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    try { pdf.destroy(); } catch (_) {}
    return blob;
  } catch (e) {
    console.warn('generateCoverFromPdf error:', e);
    return null;
  }
}

function openBulkUploadModal() {
  document.getElementById('bulkUploadModal').classList.remove('hidden');
  bulkUploadQueue = [];
  renderBulkUploadList();

  // Привязываем обработчики (один раз)
  const zone = document.getElementById('bulkUploadDropZone');
  const input = document.getElementById('bulkUploadInput');

  if (!zone._handlersAttached) {
    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.style.borderColor = 'var(--accent)';
      zone.style.background = 'rgba(0,212,255,0.08)';
    });
    zone.addEventListener('dragleave', () => {
      zone.style.borderColor = 'var(--border)';
      zone.style.background = 'var(--bg-primary)';
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.style.borderColor = 'var(--border)';
      zone.style.background = 'var(--bg-primary)';
      addFilesToBulkQueue(e.dataTransfer.files);
    });

    input.addEventListener('change', (e) => {
      addFilesToBulkQueue(e.target.files);
      input.value = ''; // чтобы можно было выбрать те же файлы снова
    });

    zone._handlersAttached = true;
  }
}

function closeBulkUploadModal() {
  if (bulkUploadInProgress) {
    if (!confirm('Загрузка ещё идёт. Точно закрыть? Незавершённые книги останутся в БД.')) return;
  }
  document.getElementById('bulkUploadModal').classList.add('hidden');
  bulkUploadQueue = [];
  bulkUploadInProgress = false;
}

function addFilesToBulkQueue(fileList) {
  const allowed = ['pdf', 'epub'];
  const MAX_SIZE = 150 * 1024 * 1024;
  let skipped = 0;
  for (const file of fileList) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) { skipped++; continue; }
    if (file.size > MAX_SIZE) { skipped++; continue; }
    bulkUploadQueue.push({ file, status: 'pending', message: 'В очереди' });
  }
  if (skipped > 0) showToast(`Пропущено файлов: ${skipped} (неверный формат или > 150 МБ)`);
  renderBulkUploadList();
}

function renderBulkUploadList() {
  const listEl = document.getElementById('bulkUploadList');
  const actionsEl = document.getElementById('bulkUploadActions');
  const catPanel = document.getElementById('bulkUploadCategoryPanel');
  if (!listEl) return;

  if (bulkUploadQueue.length === 0) {
    listEl.innerHTML = '';
    actionsEl.style.display = 'none';
    catPanel.style.display = 'none';
    return;
  }

  catPanel.style.display = 'block';
  actionsEl.style.display = 'flex';

  const statusIcon = {
    pending: '⏸',
    uploading: '⏳',
    done: '✓',
    error: '✕',
  };
  const statusColor = {
    pending: 'var(--text-muted)',
    uploading: 'var(--accent)',
    done: '#22c55e',
    error: '#ef4444',
  };

  listEl.innerHTML = bulkUploadQueue.map((item, idx) => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;font-size:11px;">
      <div style="width:20px;text-align:center;color:${statusColor[item.status]};font-weight:700;flex-shrink:0;">${statusIcon[item.status]}</div>
      <div style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${eh(item.file.name)}">${eh(item.file.name)}</div>
      <div style="color:${statusColor[item.status]};font-size:10px;flex-shrink:0;">${eh(item.message)}</div>
    </div>
  `).join('');

  // Прогресс
  const done = bulkUploadQueue.filter(i => i.status === 'done').length;
  const errors = bulkUploadQueue.filter(i => i.status === 'error').length;
  const progressEl = document.getElementById('bulkUploadProgress');
  if (progressEl) {
    progressEl.textContent = `${done} / ${bulkUploadQueue.length}` + (errors ? ` (ошибок: ${errors})` : '');
  }
}

function clearBulkUploadList() {
  if (bulkUploadInProgress) { showToast('Идёт загрузка, нельзя очистить'); return; }
  bulkUploadQueue = [];
  renderBulkUploadList();
}

async function startBulkUpload() {
  if (bulkUploadInProgress) return;
  const pending = bulkUploadQueue.filter(i => i.status === 'pending');
  if (pending.length === 0) { showToast('Нет файлов для загрузки'); return; }

  bulkUploadInProgress = true;
  document.getElementById('bulkUploadStartBtn').disabled = true;
  document.getElementById('bulkUploadStartBtn').textContent = 'Загрузка...';

  const defaultCategory = (document.getElementById('bulkUploadCategory').value || '').trim();
  const categories = defaultCategory ? [defaultCategory] : ['Без категории'];

  for (let i = 0; i < bulkUploadQueue.length; i++) {
    const item = bulkUploadQueue[i];
    if (item.status !== 'pending') continue;

    item.status = 'uploading';
    item.message = 'Создаётся...';
    renderBulkUploadList();

    try {
      const ext = item.file.name.split('.').pop().toLowerCase();
      const format = (ext === 'epub') ? 'epub' : 'pdf';
      const title = item.file.name.replace(/\.(pdf|epub)$/i, '').replace(/[_-]/g, ' ').trim() || 'Без названия';

      // 1. Создаём книгу
      const created = await api.books.create({
        title: title,
        author: '—',
        categories: categories,
        description: '',
        icon: ICONS.bookCover,
        file_format: format,
      });

      // 2. Загружаем файл
      item.message = 'Загрузка файла...';
      renderBulkUploadList();

      if (format === 'epub' && typeof api.books.uploadEpub === 'function') {
        await api.books.uploadEpub(created.id, item.file);
      } else {
        await api.books.uploadPdf(created.id, item.file);
        // Автообложка из первой страницы PDF
        item.message = 'Создание обложки...';
        renderBulkUploadList();
        try {
          const coverBlob = await generateCoverFromPdf(item.file);
          if (coverBlob) {
            const coverGenFile = new File([coverBlob], 'cover.jpg', { type: 'image/jpeg' });
            await api.books.uploadCover(created.id, coverGenFile);
          }
        } catch (coverErr) {
          console.warn('Автообложка не создана для', item.file.name, coverErr);
        }
      }

      item.status = 'done';
      item.message = 'Создана';
    } catch (e) {
      item.status = 'error';
      item.message = 'Ошибка: ' + ((e.detail || e.message || '').substring(0, 40));
      console.error('Bulk upload error:', e);
    }
    renderBulkUploadList();
  }

  bulkUploadInProgress = false;
  document.getElementById('bulkUploadStartBtn').disabled = false;
  document.getElementById('bulkUploadStartBtn').textContent = 'Загрузить';

  const done = bulkUploadQueue.filter(i => i.status === 'done').length;
  const errors = bulkUploadQueue.filter(i => i.status === 'error').length;
  showToast(`Создано книг: ${done}` + (errors ? ` · Ошибок: ${errors}` : ''));

  // Обновляем каталог
  await loadBooksFromApi();
  if (state.currentScreen === 'admin') renderAdminPanel();
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

    // Сохраняем в state, чтобы фильтр работал без повторного запроса
    state._adminUsers = users;

    renderAdminUsersWithFilter();
  } catch (err) {
    container.innerHTML = '<div style="padding:20px;color:#ef4444;">Не удалось загрузить пользователей</div>';
  }
}

function renderAdminUsersWithFilter() {
  const container = document.getElementById('adUsers');
  const users = state._adminUsers || [];
  if (!users.length) {
    container.innerHTML = '<div style="padding:20px;color:var(--text-muted);">Нет пользователей</div>';
    return;
  }

  const filter = state._adminUsersFilter || 'all';
  const limit = state._adminUsersLimit || 10;

  let sorted = [...users];
  let title = '';
  if (filter === 'top_books') {
    sorted.sort((a, b) => (b.completed_books || 0) - (a.completed_books || 0));
    title = `ТОП-${limit} по прочитанным книгам`;
  } else if (filter === 'top_xp') {
    sorted.sort((a, b) => (b.xp || 0) - (a.xp || 0));
    title = `ТОП-${limit} по XP (активности)`;
  } else if (filter === 'top_perfect') {
    sorted.sort((a, b) => (b.perfect_quizzes || 0) - (a.perfect_quizzes || 0));
    title = `ТОП-${limit} по тестам на 100%`;
  }

  const displayed = filter === 'all' ? sorted : sorted.slice(0, limit);

  // Сводная статистика — по всем юзерам
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.is_active).length;
  const totalCompleted = users.reduce((s, u) => s + (u.completed_books || 0), 0);
  const totalAttempts = users.reduce((s, u) => s + (u.quiz_attempts || 0), 0);

  const miniDash = `
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px;">
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:18px;font-weight:700;color:var(--accent);">${totalUsers}</div>
        <div style="font-size:11px;color:var(--text-muted);">Всего пользователей</div>
      </div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:18px;font-weight:700;color:#22c55e;">${activeUsers}</div>
        <div style="font-size:11px;color:var(--text-muted);">Активных</div>
      </div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:18px;font-weight:700;color:#fbbf24;">${totalCompleted}</div>
        <div style="font-size:11px;color:var(--text-muted);">Книг прочитано (всеми)</div>
      </div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:18px;font-weight:700;color:#a855f7;">${totalAttempts}</div>
        <div style="font-size:11px;color:var(--text-muted);">Попыток тестов</div>
      </div>
    </div>
  `;

  const filterPanel = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
      <label style="font-size:11px;color:var(--text-muted);">Показать:</label>
      <select id="adminUsersFilter" onchange="onAdminUsersFilterChange()" style="background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);padding:6px 10px;border-radius:6px;font-family:inherit;font-size:12px;">
        <option value="all"${filter==='all'?' selected':''}>Все</option>
        <option value="top_books"${filter==='top_books'?' selected':''}>ТОП по прочитанным книгам</option>
        <option value="top_xp"${filter==='top_xp'?' selected':''}>ТОП по XP (активности)</option>
        <option value="top_perfect"${filter==='top_perfect'?' selected':''}>ТОП по тестам на 100%</option>
      </select>
      ${filter !== 'all' ? `
        <label style="font-size:11px;color:var(--text-muted);margin-left:8px;">Размер ТОП:</label>
        <select id="adminUsersLimit" onchange="onAdminUsersLimitChange()" style="background:var(--bg-primary);border:1px solid var(--border);color:var(--text-primary);padding:6px 10px;border-radius:6px;font-family:inherit;font-size:12px;">
          <option value="5"${limit===5?' selected':''}>5</option>
          <option value="10"${limit===10?' selected':''}>10</option>
          <option value="25"${limit===25?' selected':''}>25</option>
          <option value="50"${limit===50?' selected':''}>50</option>
        </select>
      ` : ''}
    </div>
    ${title ? `<div style="font-size:12px;color:var(--accent);font-weight:600;margin-bottom:10px;">${title}</div>` : ''}
  `;

  const tableHtml = `
    <div class="table-wrap"><table>
      <thead><tr>
        ${filter !== 'all' ? '<th>#</th>' : ''}
        <th>ID</th>
        <th>Логин</th>
        <th>ФИО</th>
        <th>Подразделение</th>
        <th>Email</th>
        <th>Роль</th>
        <th>Уровень</th>
        <th>XP</th>
        <th>Стрик</th>
        <th>Книг прочит.</th>
        <th>Тестов</th>
        <th>На 100%</th>
        <th>Страниц</th>
        <th>Активен</th>
        <th>Действия</th>
      </tr></thead>
      <tbody>
        ${displayed.map((u, idx) => {
          const levelInfo = u.cyber_level ? getCyberLevelInfo(u.cyber_level) : null;
          return `<tr>
            ${filter !== 'all' ? `<td style="font-weight:700;color:var(--accent);">${idx + 1}</td>` : ''}
            <td>${u.id}</td>
            <td>${eh(u.username)}</td>
            <td>${eh(u.full_name || '—')}</td>
            <td>${eh(u.department || '—')}</td>
            <td>${eh(u.email || '—')}</td>
            <td>${u.role}</td>
            <td>${levelInfo ? eh(levelInfo.name) : '—'}</td>
            <td>${u.xp}</td>
            <td>${u.streak_count}</td>
            <td>${u.completed_books}</td>
            <td>${u.quiz_attempts}</td>
            <td>${u.perfect_quizzes}</td>
            <td>${u.total_pages_read}</td>
            <td>${u.is_active ? ICONS.check : ICONS.x}</td>
            <td>${u.role !== 'admin'
              ? `<button class="btn-sm danger" onclick="deleteAdminUser(${u.id}, '${eh(u.username).replace(/'/g, "\\'")}')">${ICONS.trash}</button>`
              : '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
  `;

  const actionsBar = `
    <div class="admin-actions-bar" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
      <button onclick="openCreateUserModal()" title="Создать пользователя" style="background:rgba(0,212,255,0.12);border:1px solid rgba(0,212,255,0.4);color:#00d4ff;padding:8px 14px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="11" x2="19" y2="17"/><line x1="16" y1="14" x2="22" y2="14"/></svg>
        Создать пользователя
      </button>
      <button onclick="openPendingUsersModal()" title="Заявки на регистрацию" style="position:relative;background:rgba(123,97,255,0.12);border:1px solid rgba(123,97,255,0.4);color:#7b61ff;padding:8px 14px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        Заявки
        <span id="pendingUsersBadge" style="display:none;background:#ef4444;color:#fff;border-radius:10px;font-size:10px;padding:1px 6px;font-weight:700;"></span>
      </button>
      <button onclick="openExportModal()" title="Выгрузка прочитанного в Excel" style="background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.4);color:#22c55e;padding:8px 14px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Excel
      </button>
    </div>`;

  container.innerHTML = actionsBar + miniDash + filterPanel + tableHtml;
  refreshPendingBadge();
}

function onAdminUsersFilterChange() {
  const sel = document.getElementById('adminUsersFilter');
  state._adminUsersFilter = sel.value;
  renderAdminUsersWithFilter();
}

function onAdminUsersLimitChange() {
  const sel = document.getElementById('adminUsersLimit');
  state._adminUsersLimit = parseInt(sel.value, 10) || 10;
  renderAdminUsersWithFilter();
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
  // Если аккаунт не одобрен админом — нельзя попасть в библиотеку
  if (state.currentUser && state.currentUser.is_approved === false) {
    showPendingApprovalScreen();
    return;
  }
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
    <button class="btn-onboarding-finish-result" onclick="finishOnboardingNav()">Начать обучение</button>
  `;
}

function finishOnboardingNav() {
  // Если пользователь ещё не одобрен — возвращаем на экран ожидания, не пускаем в библиотеку
  if (state.currentUser && state.currentUser.is_approved === false) {
    showPendingApprovalScreen();
  } else {
    navigateTo('home');
  }
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