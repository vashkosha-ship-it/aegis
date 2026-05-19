// ============================================================================
// OFFLINE STORAGE — IndexedDB-обёртка для хранения скачанных книг.
// Хранит PDF/EPUB-файлы (Blob), обложки (Blob), метаданные (плоский объект).
// Использование: offlineStorage.save(book), offlineStorage.has(id), offlineStorage.get(id).
// ============================================================================
(function () {
  const DB_NAME = 'aegis_offline';
  const DB_VERSION = 1;
  const STORE_BOOKS = 'books';      // {id, title, author, file_format, has_cover, total_pages, savedAt}
  const STORE_FILES = 'files';      // {id, type: 'pdf'|'epub'|'cover', blob}

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_BOOKS)) {
          db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_FILES)) {
          // Композитный ключ: bookId + тип файла
          db.createObjectStore(STORE_FILES, { keyPath: ['bookId', 'type'] });
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

  // Сохранить книгу: метаданные + файл книги + (опционально) обложка
  async function save(meta, fileBlob, fileType, coverBlob = null) {
    const t = await tx([STORE_BOOKS, STORE_FILES], 'readwrite');
    const booksStore = t.objectStore(STORE_BOOKS);
    const filesStore = t.objectStore(STORE_FILES);

    booksStore.put({
      id: meta.id,
      title: meta.title,
      author: meta.author,
      file_format: fileType,                  // 'pdf' | 'epub'
      has_cover: !!coverBlob,
      total_pages: meta.total_pages || 0,
      icon: meta.icon || null,
      savedAt: new Date().toISOString(),
    });

    filesStore.put({ bookId: meta.id, type: fileType, blob: fileBlob });
    if (coverBlob) {
      filesStore.put({ bookId: meta.id, type: 'cover', blob: coverBlob });
    }

    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve(true);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  // Проверить, есть ли книга в оффлайн-хранилище
  async function has(bookId) {
    const t = await tx([STORE_BOOKS]);
    const result = await reqToPromise(t.objectStore(STORE_BOOKS).get(bookId));
    return !!result;
  }

  // Получить метаданные книги
  async function getMeta(bookId) {
    const t = await tx([STORE_BOOKS]);
    return reqToPromise(t.objectStore(STORE_BOOKS).get(bookId));
  }

  // Получить файл (PDF/EPUB) как Blob
  async function getFile(bookId, type) {
    const t = await tx([STORE_FILES]);
    const result = await reqToPromise(t.objectStore(STORE_FILES).get([bookId, type]));
    return result?.blob || null;
  }

  // Получить обложку как ObjectURL (для img.src)
  async function getCoverUrl(bookId) {
    const blob = await getFile(bookId, 'cover');
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }

  // Список всех id сохранённых книг
  async function listIds() {
    const t = await tx([STORE_BOOKS]);
    return reqToPromise(t.objectStore(STORE_BOOKS).getAllKeys());
  }

  // Список всех сохранённых книг с метаданными
  async function listAll() {
    const t = await tx([STORE_BOOKS]);
    return reqToPromise(t.objectStore(STORE_BOOKS).getAll());
  }

  // Удалить книгу: метаданные + все её файлы
  async function remove(bookId) {
    const t = await tx([STORE_BOOKS, STORE_FILES], 'readwrite');
    t.objectStore(STORE_BOOKS).delete(bookId);
    // Удаляем все файлы этой книги (pdf, epub, cover)
    ['pdf', 'epub', 'cover'].forEach(type => {
      t.objectStore(STORE_FILES).delete([bookId, type]);
    });
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve(true);
      t.onerror = () => reject(t.error);
    });
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
    getQuotaEstimate,
  };
})();
