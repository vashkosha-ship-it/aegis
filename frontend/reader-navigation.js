// Переходы между страницами PDF и EPUB.
function goToPage(pn) {
  const total = isEpubMode ? (epubTotalPages || 1) : pdfTotalPages;
  const target = Math.max(1, Math.min(pn, total));
  if (navigator.vibrate) navigator.vibrate(8);

  if (isEpubMode) {
    epubCurrentPage = target;
    if (epubRendition) {
      const cfi = epubBook?.locations?.cfiFromLocation(target - 1);
      epubRendition.display(cfi || undefined);
    }
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
