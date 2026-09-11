/* Реестр функций, которые разрешено вызывать из разметки.
 *
 * Зачем он нужен. Диспетчер раньше брал функцию по имени прямо из window —
 * то есть любая разметка, попавшая в DOM, могла позвать ЛЮБУЮ глобальную
 * функцию приложения. Строка вида
 *
 *     <img src=x data-onerror="deleteAdminUser(1)">
 *
 * выполнилась бы сама, без единого клика: событие error возникает при
 * неудачной загрузке картинки. CSP тут не помогает — инлайнового скрипта нет,
 * есть атрибут.
 *
 * Файл собирается автоматически: tools/gen_allowlist.py
 * Править руками не нужно — правки затрутся при следующей пересборке.
 */
window.AEGIS_ALLOWED_HANDLERS = Object.freeze({
  click: [
    'addNoteToSelection', 'aiQuick', 'answerCertQuestion',
    'answerQuiz', 'applyFilters', 'assistantCopy',
    'assistantGotoQuiz', 'assistantPickBook', 'assistantQuick',
    'cancelReply', 'certNav', 'clearAssistantChat',
    'clearBulkUploadList', 'clickElement', 'closeAIPanel',
    'closeAR', 'closeARSchemeMenu', 'closeAddModal',
    'closeAdminBookModal', 'closeBookAnalyticsModal', 'closeBulkUploadModal',
    'closeCatalogPanel', 'closeCertModal', 'closeEditProfileModal',
    'closeModal', 'closeReader', 'closeReaderSearch',
    'closeShortcutsModal', 'convertToNote', 'createCollectionFromModal',
    'deleteAnnotationFromTooltip', 'deleteComment', 'deleteCurrentAvatar',
    'deleteReview', 'downloadCertificate', 'explainSelectionTerm',
    'exportNotes', 'finishOnboarding', 'finishQuiz',
    'goToBooksPage', 'hideFromResume', 'highlightSelection',
    'logout', 'lookupSelectionWord', 'navigateTo',
    'nextOnboardingQuestion', 'nextQuestion', 'openARSchemeMenu',
    'openARWithScheme', 'openAddModal', 'openBookDetail',
    'openBookmarksList', 'openCertificationModal', 'openChatHistory',
    'openCyberLevelModal', 'openForgotPassword', 'openReviewMode',
    'openSettingsTab', 'openShortcutsModal', 'openTOC',
    'pausePomodoro', 'prevOnboardingQuestion', 'prevQuestion',
    'readerSearchNext', 'readerSearchPrev', 'removeBookOffline',
    'resetARSchemeZoom', 'resetFilters', 'resetPomodoro',
    'restartOnboardingFromTraining', 'retakeQuiz', 'runFullTextSearch',
    'saveProfileEdits', 'selectKillChainStage', 'sendAIMessage',
    'sendAssistantMessage', 'setHomeBooksTab', 'setKillChainViewMode',
    'setReviewStar', 'showAnnotationDetail', 'showMyStatsModal',
    'showNoteTooltip', 'skipOnboarding', 'startBulkUpload',
    'startNewChat', 'startPomodoro', 'startQuizFromTraining',
    'startReply', 'stopReindexPolling', 'submitCertExam',
    'submitComment', 'submitReview', 'summarizeCurrentChapter',
    'switchARCamera', 'tocGoTo', 'toggleAIPanel',
    'toggleBookInCollection', 'toggleCatalogPanel', 'togglePageBookmark',
    'togglePasswordVisibility', 'togglePomodoro', 'toggleReaderSearch',
    'toggleReaderTheme', 'toggleStageDetailsPanel', 'toggleTocRead',
    'zoomARScheme',
  ],
  change: [
    'onAnalyticsBookSelected', 'uploadAvatar',
  ],
  input: [
    'onSearchInput',
  ],
  keydown: [
    'onAiInputKeydown', 'onSearchKeydown',
  ],

  /* Разрушительные обработчики. Они перечислены и в списке своего события —
   * реестр их пропускает, — но диспетчер дополнительно требует data-nonce.
   * Одного реестра мало: он не даёт позвать произвольную функцию, но не мешает
   * позвать опасную, ведь удаление книги нужно настоящей кнопке в интерфейсе.
   */
  sensitive: [
    'aiMatchArBooksUI', 'confirmDeleteAccount', 'deleteAdminUser',
    'deleteAnnotation', 'deleteAnnotationFromTooltip', 'deleteBook',
    'deleteComment', 'deleteCurrentAvatar', 'deleteReview',
    'deleteReviewAndRefresh', 'doDeleteAccount', 'exportAllUserData',
    'generateMissingCoversUI', 'markRequiredForDept', 'regenerateAllQuizzesUI',
    'regenerateBookQuiz', 'reindexAllBooksUI', 'startBulkUpload',
  ],

  /* События, возникающие БЕЗ действия пользователя, — отдельный, куда более
   * узкий список. error срабатывает сам, стоит браузеру не загрузить
   * картинку, поэтому здесь допустима ровно одна функция: подстановка
   * запасной обложки. Каждая добавленная сюда запись исполняется
   * автоматически, так что расширять список без крайней нужды не следует.
   */
  error: [
    'replaceWithFallback',
  ],
});
