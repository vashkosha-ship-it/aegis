'use strict';

/* Глобальные сочетания клавиш приложения. */

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

