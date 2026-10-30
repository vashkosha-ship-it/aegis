'use strict';

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

// ============ ПЕРЕШИФРОВКА ПРИ СМЕНЕ ПАРОЛЯ ============
// Ключ заметок выводится из пароля. Если просто сменить пароль, старые
// заметки уже нельзя расшифровать. Поэтому перед сменой устройство
// расшифровывает их ключом от старого пароля, шифрует ключом от нового и
// отправляет вместе со сменой пароля — сервер меняет всё одной транзакцией.

async function _deriveKeyFor(password, username) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('aegis-notes-salt:' + (username || '')), iterations: 150000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function _encryptWithKey(key, plain) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  const combined = new Uint8Array(iv.length + ct.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ct), iv.length);
  let bin = '';
  combined.forEach(b => { bin += String.fromCharCode(b); });
  return NOTE_ENC_PREFIX + btoa(bin);
}

// null — расшифровать не удалось (заметка зашифрована другим, давно
// забытым паролем: её уже не спасти, оставляем как есть).
async function _decryptWithKey(key, value) {
  try {
    const bin = atob(value.slice(NOTE_ENC_PREFIX.length));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
    return new TextDecoder().decode(pt);
  } catch (_) {
    return null;
  }
}

async function reencryptNotesForNewPassword(oldPassword, newPassword, username) {
  // Без WebCrypto (небезопасное соединение, старый браузер) заметки и не
  // шифровались — перешифровывать нечего.
  if (typeof crypto === 'undefined' || !crypto.subtle) return { items: [], lost: 0, newKey: null };
  const list = await api.myEncryptedAnnotations();
  const [oldKey, newKey] = await Promise.all([
    _deriveKeyFor(oldPassword, username),
    _deriveKeyFor(newPassword, username),
  ]);
  const items = [];
  let lost = 0;
  for (const annotation of list) {
    const result = { id: annotation.id };
    let ok = true;
    for (const field of ['selected_text', 'note_text']) {
      const value = annotation[field];
      if (!value) { result[field] = value ?? null; continue; }
      const plain = value.startsWith(NOTE_ENC_PREFIX) ? await _decryptWithKey(oldKey, value) : value;
      if (plain === null) { ok = false; break; }
      result[field] = await _encryptWithKey(newKey, plain);
    }
    if (ok) items.push(result); else lost += 1;
  }
  return { items, lost, newKey };
}

function setNoteKey(key) { _noteKey = key || null; }
