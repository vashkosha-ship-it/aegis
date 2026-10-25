'use strict';

// Вход без сети, аватары из набора, схемы без камеры, чтение PDF на телефоне.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontend = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');
const api = read('api.js');
const auth = read('auth-ui.js');
const index = read('index.html');
const worker = read('sw.js');
const schemes = read('ar-schemes.js');
const reader = read('reader-core.js');
const gestures = read('reader-gestures.js');
const touch = read('css/components/touch-targets.css');

// --- Офлайн-вход -----------------------------------------------------------
// Сетевая ошибка при продлении сессии запоминается отдельно от «сессия
// недействительна», и тогда приложение открывается по сохранённому профилю.
assert.match(api, /_lastRefreshOffline = e instanceof ApiError && e\.isNetworkError/);
assert.match(api, /lastRefreshWasOffline: \(\) => _lastRefreshOffline/);
assert.match(auth, /api\.lastRefreshWasOffline\(\) && cached\) return enterOfflineSession\(cached\)/);
assert.match(auth, /async function resumeOnlineSession\(\)/);
// Без сети форма входа пускает только аккаунт, уже входивший на устройстве.
assert.match(auth, /cached\.name\.toLowerCase\(\) === typed/);
// Случайный жест «потянуть вниз» не перезагружает приложение.
assert.match(touch, /overscroll-behavior-y: none/);

// --- Аватары ---------------------------------------------------------------
const pickerSource = read('avatar-picker.js');
const context = { state: { currentUser: null }, api: { users: {} }, console };
vm.createContext(context);
vm.runInContext(pickerSource, context);
const presets = vm.runInContext('AVATAR_PRESETS', context);
assert.equal(presets.length, 15);
presets.forEach(({ id }) => {
  assert.ok(fs.existsSync(path.join(frontend, 'avatars', `${id}.svg`)), id);
  assert.ok(worker.includes(`'/avatars/${id}.svg'`), `${id} в офлайн-кэше`);
});
assert.equal(vm.runInContext("avatarPresetUrl('a03')", context), '/avatars/a03.svg');
assert.equal(vm.runInContext("avatarPresetUrl('../x')", context), '');
const img = {};
assert.equal(context.applyUserAvatarImage(img, { avatar_preset: 'a05', has_avatar: true }), true);
assert.equal(img.src, '/avatars/a05.svg');
assert.equal(context.applyUserAvatarImage({}, { has_avatar: false }), false);
// Загрузки своих фото больше нет.
assert.doesNotMatch(index, /type="file" id="avatarUpload"/);
assert.doesNotMatch(api, /uploadAvatar/);
assert.match(index, /data-onclick="openAvatarPicker\(\)"/);

// --- Удаление аккаунта видно в настройках -----------------------------------
assert.match(index, /class="btn-delete-account"[^>]*data-onclick="confirmDeleteAccount\(\)"/);

// --- Схемы без камеры ------------------------------------------------------
assert.doesNotMatch(schemes, /getUserMedia/);
assert.doesNotMatch(index, /id="arVideo"|id="arCameraBtn"/);
assert.match(index, /class="static-style-016">Схемы</);

// --- PDF на телефоне ---------------------------------------------------------
// Страница рисуется во внеэкранный холст (без белого листа) и по ширине экрана
// на сенсорных устройствах; щипок увеличивает страницу.
assert.match(reader, /async function renderPdfPageOffscreen/);
assert.match(reader, /schedulePdfNeighbourPrerender/);
assert.match(reader, /matchMedia\('\(pointer: coarse\)'\)/);
assert.match(gestures, /function initPdfPinchZoom\(\)/);

// --- Горячие клавиши только с клавиатурой ----------------------------------
assert.match(touch, /@media \(hover: none\) and \(pointer: coarse\)[\s\S]*btn-shortcuts-icon \{ display: none; \}/);

console.log('Offline session, avatars, schemes and reader tests passed');
