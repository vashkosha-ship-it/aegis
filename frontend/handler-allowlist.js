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
  ${event}: [\n${lines.join("\n")}\n  ],
  ${event}: [\n${lines.join("\n")}\n  ],
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
