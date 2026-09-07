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
