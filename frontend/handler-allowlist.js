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
    'addNoteToSelection', 'aiMatchArBooksUI', 'aiQuick',
    'answerCertQuestion', 'answerQuiz', 'applyFilters',
    'approvePendingUser', 'askAiAboutSnippet', 'assistantCopy',
    'assistantGotoQuiz', 'assistantPickBook', 'assistantQuick',
    'biometricGateFallback', 'cancelReply', 'certNav',
    'clearAssistantChat', 'clearBulkUploadList', 'clearFullTextSearch',
    'clickElement', 'closeAIPanel', 'closeAR',
    'closeARSchemeMenu', 'closeAddModal', 'closeAdminBookModal',
    'closeBookAnalyticsModal', 'closeBulkUploadModal', 'closeCatalogPanel',
    'closeCertModal', 'closeEditProfileModal', 'closeFinishReviewModal',
    'closeModal', 'closeReader', 'closeReaderSearch',
    'closeShortcutsModal', 'confirmClearCache', 'confirmDeleteAccount',
    'confirmEmailChangeUI', 'convertToNote', 'createCollectionFromModal',
    'deleteAdminUser', 'deleteAnnotation', 'deleteAnnotationFromTooltip',
    'deleteBook', 'deleteChatFromHistory', 'deleteComment',
    'deleteCurrentAvatar', 'deleteReview', 'deleteReviewAndRefresh',
    'doDeleteAccount', 'doExportNotes', 'downloadCertificate',
    'explainSelectionTerm', 'exportAllUserData', 'exportNotes',
    'filterByCategory', 'finishOnboarding', 'finishOnboardingNav',
    'finishQuiz', 'flipFlashcard', 'forgotPasswordReset',
    'forgotPasswordSendCode', 'generateMissingCoversUI', 'goToBooksPage',
    'hideFromResume', 'highlightSelection', 'jumpToBookmark',
    'loadChatFromHistory', 'logout', 'lookupSelectionWord',
    'markRequiredForDept', 'navigateTo', 'nextKillChainStage',
    'nextOnboardingQuestion', 'nextQuestion', 'openARSchemeMenu',
    'openARWithScheme', 'openAddModal', 'openAddToCollection',
    'openAdminBookModal', 'openAdminLogs', 'openBookAnalyticsModal',
    'openBookDetail', 'openBookFromAR', 'openBookmarksList',
    'openBulkUploadModal', 'openCertificationModal', 'openChatHistory',
    'openCreateUserModal', 'openCyberLevelModal', 'openExportModal',
    'openFavCatsPicker', 'openForgotPassword', 'openPendingUsersModal',
    'openPrivacyPolicy', 'openReader', 'openReviewMode',
    'openSettingsTab', 'openShortcutsModal', 'openTOC',
    'openUserAgreement', 'pausePomodoro', 'prevKillChainStage',
    'prevOnboardingQuestion', 'prevQuestion', 'rateCard',
    'readerSearchNext', 'readerSearchPrev', 'regenerateAllQuizzesUI',
    'regenerateBookQuiz', 'reindexAllBooksUI', 'rejectPendingUser',
    'removeBookOffline', 'removeBookmark', 'renderSettingsSecurityTab',
    'replayOnboardingTour', 'requestEmailChangeUI', 'resetARSchemeZoom',
    'resetFilters', 'resetPomodoro', 'restartOnboarding',
    'restartOnboardingFromTraining', 'retakeQuiz', 'runBiometricUnlock',
    'runFullTextSearch', 'saveBookOffline', 'saveBooksGoalFromUI',
    'saveProfileEdits', 'saveSettingsInfo', 'saveSettingsPassword',
    'selectBooksGoalCount', 'selectBooksGoalPeriod', 'selectKillChainStage',
    'selectLevelSelf', 'selectOnboardingAnswer', 'sendAIMessage',
    'sendAssistantMessage', 'setAppTheme', 'setBooksGoal',
    'setFinishReviewStar', 'setGridSize', 'setHomeBooksTab',
    'setKillChainViewMode', 'setPrivacyVisibility', 'setReaderFontScale',
    'setReadingGoal', 'setReviewStar', 'showAnnotationDetail',
    'showHeatmapDayDetails', 'showMyStatsModal', 'showNoteTooltip',
    'skipOnboarding', 'startBulkUpload', 'startNewChat',
    'startOnboardingQuiz', 'startPomodoro', 'startQuiz',
    'startQuizFromTraining', 'startReply', 'stopReindexPolling',
    'submitCertExam', 'submitComment', 'submitFinishReview',
    'submitReview', 'summarizeCurrentChapter', 'switchARCamera',
    'switchKillChainTab', 'tocGoTo', 'toggleAIPanel',
    'toggleBiometricFromSettings', 'toggleBookInCollection', 'toggleCatalogPanel',
    'toggleCategoryFilter', 'toggleFavCategory', 'togglePageBookmark',
    'togglePasswordVisibility', 'togglePomodoro', 'toggleReaderSearch',
    'toggleReaderTheme', 'toggleStageDetailsPanel', 'toggleTocRead',
    'triggerInstall', 'zoomARScheme',
  ],
  change: [
    'onAdminUsersFilterChange', 'onAdminUsersLimitChange', 'onAnalyticsBookSelected',
    'onAutoPreloadToggle', 'onBookStatusChange', 'onWifiOnlyToggle',
    'uploadAvatar',
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
    'approvePendingUser', 'confirmDeleteAccount', 'deleteAdminUser',
    'deleteAnnotation', 'deleteAnnotationFromTooltip', 'deleteBook',
    'deleteChatFromHistory', 'deleteComment', 'deleteCurrentAvatar',
    'deleteReview', 'deleteReviewAndRefresh', 'doDeleteAccount',
    'exportAllUserData', 'regenerateAllQuizzesUI', 'regenerateBookQuiz',
    'rejectPendingUser',
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
