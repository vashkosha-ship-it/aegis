'use strict';

/* Общие правила доступности для статических и динамически созданных окон. */

const A11Y_DIALOG_SELECTOR = [
  '[role="dialog"][aria-modal="true"]',
  '.modal-overlay',
  '.shortcuts-modal',
  '.fav-categories-modal',
  '.app-dialog-overlay',
  '[id$="Modal"]',
].join(',');

const A11Y_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const a11yDialogs = [];

function a11yIsVisible(element) {
  if (!element?.isConnected || element.hidden || element.classList.contains('hidden')) return false;
  if (element.classList.contains('shortcuts-modal') && !element.classList.contains('show')) return false;
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function a11yFocusable(dialog) {
  return [...dialog.querySelectorAll(A11Y_FOCUSABLE_SELECTOR)].filter(a11yIsVisible);
}

function a11yDialogName(dialog) {
  if (dialog.hasAttribute('aria-label') || dialog.hasAttribute('aria-labelledby')) return;
  const heading = dialog.querySelector('h1, h2, h3, [role="heading"]');
  if (!heading) {
    dialog.setAttribute('aria-label', 'Диалоговое окно');
    return;
  }
  if (!heading.id) heading.id = `${dialog.id || 'appDialog'}A11yTitle`;
  dialog.setAttribute('aria-labelledby', heading.id);
}

function a11yActivateDialog(dialog) {
  if (!dialog || a11yDialogs.some(item => item.dialog === dialog) || !a11yIsVisible(dialog)) return;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  a11yDialogName(dialog);
  a11yDialogs.push({ dialog, returnFocus: document.activeElement });
  const target = a11yFocusable(dialog)[0];
  if (target) target.focus();
  else {
    dialog.setAttribute('tabindex', '-1');
    dialog.focus();
  }
}

function a11yDeactivateClosedDialogs() {
  for (let index = a11yDialogs.length - 1; index >= 0; index -= 1) {
    const entry = a11yDialogs[index];
    if (a11yIsVisible(entry.dialog)) continue;
    a11yDialogs.splice(index, 1);
    if (entry.returnFocus?.isConnected) entry.returnFocus.focus();
  }
}

function a11ySyncDialogs() {
  a11yDeactivateClosedDialogs();
  document.querySelectorAll(A11Y_DIALOG_SELECTOR).forEach(a11yActivateDialog);
}

function a11yCloseButton(dialog) {
  const controls = a11yFocusable(dialog);
  return controls.find(element => {
    const label = `${element.getAttribute('aria-label') || ''} ${element.title || ''} ${element.textContent || ''}`.trim();
    return /закрыть|отмена|✕|×/iu.test(label)
      || /(?:close|cancel)/iu.test(element.id || '');
  });
}

function a11yHandleDialogKeydown(event) {
  a11yDeactivateClosedDialogs();
  const entry = a11yDialogs.at(-1);
  if (!entry) return;
  const { dialog } = entry;

  if (event.key === 'Escape') {
    const closeButton = a11yCloseButton(dialog);
    if (closeButton) closeButton.click();
    else dialog.click();
    event.preventDefault();
    event.stopImmediatePropagation();
    queueMicrotask(a11yDeactivateClosedDialogs);
    return;
  }

  if (event.key !== 'Tab') return;
  const controls = a11yFocusable(dialog);
  if (!controls.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function a11yButtonLabel(button) {
  if (button.hasAttribute('aria-label') || button.hasAttribute('aria-labelledby')) return;
  const text = (button.textContent || '').replace(/[←→✕×+−⋮]/gu, '').trim();
  if (text) return;
  if (button.title) {
    button.setAttribute('aria-label', button.title);
    return;
  }
  const labels = {
    togglePassBtn: 'Показать или скрыть пароль',
    btnAdminGo: 'Открыть панель администратора',
    btnReaderMore: 'Дополнительные действия',
    assistantSendBtn: 'Отправить сообщение',
  };
  let label = labels[button.id];
  const action = button.dataset.onclick || '';
  if (!label && /openARSchemeMenu/.test(action)) label = 'Открыть схемы атак';
  if (!label && /runFullTextSearch/.test(action)) label = 'Искать по содержимому книг';
  if (!label && /toggleCatalogPanel/.test(action)) label = 'Открыть каталог';
  if (!label && /openAddModal/.test(action)) label = 'Добавить книгу';
  if (!label && button.classList.contains('btn-back')) label = 'Назад';
  if (!label && /close/i.test(action)) label = 'Закрыть';
  const settingsSection = action.match(/openSettingsTab\('([^']+)'\)/)?.[1];
  const settingsLabels = {
    info: 'Основные настройки',
    security: 'Безопасность',
    privacy: 'Приватность',
    storage: 'Хранилище',
    personalization: 'Персонализация',
    help: 'Помощь',
  };
  if (!label && settingsSection) label = settingsLabels[settingsSection];
  if (label) button.setAttribute('aria-label', label);
}

function a11yEnhance(root = document) {
  if (root.matches?.('button')) a11yButtonLabel(root);
  root.querySelectorAll?.('button').forEach(a11yButtonLabel);
  a11ySyncDialogs();
}

window.aegisAccessibility = {
  enhance: a11yEnhance,
  syncDialogs: a11ySyncDialogs,
};

document.addEventListener('keydown', a11yHandleDialogKeydown, true);
document.addEventListener('DOMContentLoaded', () => {
  a11yEnhance();
  const observer = new MutationObserver(records => {
    records.forEach(record => {
      if (record.type === 'childList') {
        record.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) a11yEnhance(node);
        });
      }
    });
    a11ySyncDialogs();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'style'],
  });
});
