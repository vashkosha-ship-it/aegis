'use strict';

/* Аватар из готового набора (15 картинок) или первая буква имени.
   Загрузка своих фото отключена. Картинки лежат в /avatars/ — они же
   на сервере, поэтому чужие аватары в рейтинге и отзывах тоже видны. */

const AVATAR_PRESETS = Object.freeze([
  { id: 'a01', label: 'Щит' },
  { id: 'a02', label: 'Замок' },
  { id: 'a03', label: 'Ключ' },
  { id: 'a04', label: 'Отпечаток' },
  { id: 'a05', label: 'Терминал' },
  { id: 'a06', label: 'Робот' },
  { id: 'a07', label: 'Кот' },
  { id: 'a08', label: 'Лиса' },
  { id: 'a09', label: 'Сова' },
  { id: 'a10', label: 'Ракета' },
  { id: 'a11', label: 'Планета' },
  { id: 'a12', label: 'Молния' },
  { id: 'a13', label: 'Радар' },
  { id: 'a14', label: 'Призрак' },
  { id: 'a15', label: 'Книга' },
]);

function avatarPresetUrl(presetId) {
  return AVATAR_PRESETS.some(item => item.id === presetId) ? `/avatars/${presetId}.svg` : '';
}

// Показать аватар пользователя в <img>. Возвращает false, если показывать
// нечего (тогда вызывающий код рисует букву).
function applyUserAvatarImage(img, user) {
  if (!img || !user) return false;
  const presetUrl = avatarPresetUrl(user.avatar_preset);
  if (presetUrl) {
    img.src = presetUrl;
    return true;
  }
  if (!user.has_avatar) return false;
  // Фото, загруженное до отключения загрузки: показываем, пока пользователь
  // не выберет картинку из набора или букву.
  if (api.users.loadAvatar) {
    api.users.loadAvatar(img, user.id).catch(() => img.onerror && img.onerror());
  } else {
    img.src = api.users.avatarUrl(user.id) + '?t=' + Date.now();
  }
  return true;
}

function refreshAvatarsEverywhere() {
  if (typeof renderProfile === 'function' && state.currentScreen === 'profile') renderProfile();
  ['avatarHome', 'avatarMylist', 'avatarTraining'].forEach(id => {
    if (typeof updateAvatar === 'function') updateAvatar(id);
  });
  if (typeof renderSettingsAvatarPreview === 'function') renderSettingsAvatarPreview();
}

async function chooseAvatar(presetId) {
  const user = state.currentUser;
  if (!user) return;
  try {
    const updated = presetId
      ? await api.updateMe({ avatar_preset: presetId })
      : await api.deleteAvatar();
    user.avatar_preset = updated.avatar_preset || null;
    user.has_avatar = Boolean(updated.has_avatar);
    if (typeof cacheUserForOffline === 'function') cacheUserForOffline(user);
    refreshAvatarsEverywhere();
    showToast(presetId ? 'Аватар обновлён' : 'Теперь показывается буква');
    return true;
  } catch (err) {
    showToast(err && err.detail ? 'Ошибка: ' + err.detail : 'Не удалось сохранить аватар');
    return false;
  }
}

function openAvatarPicker() {
  const user = state.currentUser;
  if (!user) return;
  document.getElementById('avatarPickerModal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'avatarPickerModal';
  overlay.className = 'avatar-picker-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'avatarPickerTitle');

  const panel = document.createElement('div');
  panel.className = 'avatar-picker';
  const header = document.createElement('div');
  header.className = 'avatar-picker-header';
  const title = document.createElement('h3');
  title.id = 'avatarPickerTitle';
  title.textContent = 'Выберите аватар';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'avatar-picker-close';
  close.setAttribute('aria-label', 'Закрыть');
  close.textContent = '✕';
  header.append(title, close);

  const grid = document.createElement('div');
  grid.className = 'avatar-picker-grid';
  grid.setAttribute('role', 'radiogroup');
  grid.setAttribute('aria-label', 'Аватары');

  const current = user.avatar_preset || (user.has_avatar ? '__photo__' : '');
  const letter = ((user.full_name || user.name || 'U').charAt(0) || 'U').toUpperCase();

  const letterOption = document.createElement('button');
  letterOption.type = 'button';
  letterOption.className = 'avatar-picker-option avatar-picker-letter';
  letterOption.dataset.preset = '';
  letterOption.setAttribute('role', 'radio');
  letterOption.setAttribute('aria-checked', String(current === ''));
  letterOption.setAttribute('aria-label', 'Буква имени');
  letterOption.textContent = letter;
  grid.appendChild(letterOption);

  AVATAR_PRESETS.forEach(item => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'avatar-picker-option';
    option.dataset.preset = item.id;
    option.setAttribute('role', 'radio');
    option.setAttribute('aria-checked', String(current === item.id));
    option.setAttribute('aria-label', item.label);
    option.title = item.label;
    const img = document.createElement('img');
    img.src = avatarPresetUrl(item.id);
    img.alt = '';
    img.loading = 'lazy';
    option.appendChild(img);
    grid.appendChild(option);
  });

  const hint = document.createElement('p');
  hint.className = 'avatar-picker-hint';
  hint.textContent = 'Аватар видят другие читатели в рейтинге и отзывах.';

  panel.append(header, grid, hint);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const dismiss = () => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  };
  const onKey = event => { if (event.key === 'Escape') dismiss(); };
  document.addEventListener('keydown', onKey);
  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', event => { if (event.target === overlay) dismiss(); });
  grid.addEventListener('click', async event => {
    const option = event.target.closest('.avatar-picker-option');
    if (!option) return;
    grid.querySelectorAll('.avatar-picker-option').forEach(item => {
      item.setAttribute('aria-checked', String(item === option));
    });
    if (await chooseAvatar(option.dataset.preset || null)) dismiss();
  });
  (grid.querySelector('[aria-checked="true"]') || letterOption).focus({ preventScroll: true });
}
