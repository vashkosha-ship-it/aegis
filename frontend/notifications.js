'use strict';

/* Сетевой статус и короткие уведомления интерфейса. */

function ensureOfflineBanner() {
  let banner = document.getElementById('offlineBanner');
  if (banner) return banner;

  banner = document.createElement('div');
  banner.id = 'offlineBanner';
  banner.className = 'offline-banner';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.textContent = 'Нет интернета — работаете в офлайн-режиме';
  document.body.appendChild(banner);
  return banner;
}

function updateOnlineStatus() {
  ensureOfflineBanner().classList.toggle('is-visible', !navigator.onLine);
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

function showToast(message) {
  document.querySelector('.toast')?.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = String(message ?? '');
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('is-hiding');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function showActionToast(message, actionLabel, action) {
  document.querySelector('.toast')?.remove();

  const toast = document.createElement('div');
  toast.className = 'toast toast-action';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  const text = document.createElement('span');
  text.textContent = String(message ?? '');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'toast-action-button';
  button.textContent = String(actionLabel || 'Открыть');
  button.addEventListener('click', () => {
    toast.remove();
    action?.();
  }, { once: true });

  toast.append(text, button);
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('is-hiding');
    setTimeout(() => toast.remove(), 300);
  }, 6000);
}
