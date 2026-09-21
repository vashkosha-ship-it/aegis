// ============================================================================
// OFFLINE STORAGE — IndexedDB-обёртка для хранения скачанных книг.
// Хранит PDF/EPUB-файлы (Blob), обложки (Blob), метаданные (плоский объект).
// Все операции требуют userId: файлы разных аккаунтов на одном устройстве
// никогда не используют общие ключи.
// ============================================================================
(function () {
  const DB_NAME = 'aegis_offline';
  const DB_VERSION = 2;
  const STORE_BOOKS = 'books';
  const STORE_FILES = 'files';
  const INDEX_USER = 'by_user';

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        // Записи v1 не содержат владельца. Назначить их текущему аккаунту
        // небезопасно: на общем устройстве последним мог войти другой человек.
        // Поэтому однократно удаляем неоднозначный legacy-кэш; книги можно
        // скачать заново уже в изолированное хранилище.
        if (e.oldVersion < 2) {
          if (db.objectStoreNames.contains(STORE_BOOKS)) db.deleteObjectStore(STORE_BOOKS);
          if (db.objectStoreNames.contains(STORE_FILES)) db.deleteObjectStore(STORE_FILES);

          const books = db.createObjectStore(STORE_BOOKS, { keyPath: ['userId', 'id'] });
          books.createIndex(INDEX_USER, 'userId', { unique: false });

          const files = db.createObjectStore(
            STORE_FILES,
            { keyPath: ['userId', 'bookId', 'type'] },
          );
          files.createIndex(INDEX_USER, 'userId', { unique: false });
        }
      };
    });
    return dbPromise;
  }

  // Универсальный helper для одной транзакции
  async function tx(stores, mode = 'readonly') {
    const db = await openDB();
    return db.transaction(stores, mode);
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function normalizeUserId(userId) {
    const normalized = Number(userId);
    if (!Number.isInteger(normalized) || normalized <= 0) {
      throw new TypeError('Для офлайн-хранилища требуется корректный userId');
    }
    return normalized;
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  // Сохранить книгу: метаданные + файл книги + (опционально) обложка
  async function save(userId, meta, fileBlob, fileType, coverBlob = null) {
    const ownerId = normalizeUserId(userId);
    const t = await tx([STORE_BOOKS, STORE_FILES], 'readwrite');
    const booksStore = t.objectStore(STORE_BOOKS);
    const filesStore = t.objectStore(STORE_FILES);

    booksStore.put({
      userId: ownerId,
      id: meta.id,
      title: meta.title,
      author: meta.author,
      file_format: fileType,                  // 'pdf' | 'epub'
      has_cover: !!coverBlob,
      total_pages: meta.total_pages || 0,
      icon: meta.icon || null,
      savedAt: new Date().toISOString(),
    });

    filesStore.put({ userId: ownerId, bookId: meta.id, type: fileType, blob: fileBlob });
    if (coverBlob) {
      filesStore.put({ userId: ownerId, bookId: meta.id, type: 'cover', blob: coverBlob });
    }

    return transactionDone(t);
  }

  // Проверить, есть ли книга в оффлайн-хранилище
  async function has(userId, bookId) {
    const ownerId = normalizeUserId(userId);
    const t = await tx([STORE_BOOKS]);
    const result = await reqToPromise(t.objectStore(STORE_BOOKS).get([ownerId, bookId]));
    return !!result;
  }

  // Получить метаданные книги
  async function getMeta(userId, bookId) {
    const ownerId = normalizeUserId(userId);
    const t = await tx([STORE_BOOKS]);
    return reqToPromise(t.objectStore(STORE_BOOKS).get([ownerId, bookId]));
  }

  // Получить файл (PDF/EPUB) как Blob
  async function getFile(userId, bookId, type) {
    const ownerId = normalizeUserId(userId);
    const t = await tx([STORE_FILES]);
    const result = await reqToPromise(
      t.objectStore(STORE_FILES).get([ownerId, bookId, type]),
    );
    return result?.blob || null;
  }

  // Получить обложку как ObjectURL (для img.src)
  async function getCoverUrl(userId, bookId) {
    const blob = await getFile(userId, bookId, 'cover');
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }

  // Список всех id сохранённых книг
  async function listIds(userId) {
    const ownerId = normalizeUserId(userId);
    const t = await tx([STORE_BOOKS]);
    const keys = await reqToPromise(
      t.objectStore(STORE_BOOKS).index(INDEX_USER).getAllKeys(ownerId),
    );
    return keys.map(key => key[1]);
  }

  // Список всех сохранённых книг с метаданными
  async function listAll(userId) {
    const ownerId = normalizeUserId(userId);
    const t = await tx([STORE_BOOKS]);
    return reqToPromise(t.objectStore(STORE_BOOKS).index(INDEX_USER).getAll(ownerId));
  }

  // Удалить книгу: метаданные + все её файлы
  async function remove(userId, bookId) {
    const ownerId = normalizeUserId(userId);
    const t = await tx([STORE_BOOKS, STORE_FILES], 'readwrite');
    t.objectStore(STORE_BOOKS).delete([ownerId, bookId]);
    // Удаляем все файлы этой книги (pdf, epub, cover)
    ['pdf', 'epub', 'cover'].forEach(type => {
      t.objectStore(STORE_FILES).delete([ownerId, bookId, type]);
    });
    return transactionDone(t);
  }

  // Удалить данные только одного аккаунта, не затрагивая остальных
  // пользователей этого браузера.
  async function clearUser(userId) {
    const ownerId = normalizeUserId(userId);
    const t = await tx([STORE_BOOKS, STORE_FILES], 'readwrite');

    for (const storeName of [STORE_BOOKS, STORE_FILES]) {
      const store = t.objectStore(storeName);
      const request = store.index(INDEX_USER).getAllKeys(ownerId);
      request.onsuccess = () => {
        for (const key of request.result) store.delete(key);
      };
    }

    return transactionDone(t);
  }

  // Оценить, сколько места занято и сколько доступно. Возвращает {usage, quota} в байтах.
  async function getQuotaEstimate() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    try {
      const est = await navigator.storage.estimate();
      return { usage: est.usage || 0, quota: est.quota || 0 };
    } catch (e) {
      return null;
    }
  }

  window.offlineStorage = {
    save,
    has,
    getMeta,
    getFile,
    getCoverUrl,
    listIds,
    listAll,
    remove,
    clearUser,
    getQuotaEstimate,
  };
})();
