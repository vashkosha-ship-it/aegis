'use strict';

/* Универсальные confirm/prompt окна без HTML-строк и нативного prompt(). */

function createDialogShell(id, title) {
  document.getElementById(id)?.remove();

  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.className = 'app-dialog-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const panel = document.createElement('div');
  panel.className = 'app-dialog-panel';

  const heading = document.createElement('h3');
  heading.className = 'app-dialog-title';
  heading.textContent = String(title ?? '');
  const titleId = `${id}Title`;
  heading.id = titleId;
  overlay.setAttribute('aria-labelledby', titleId);

  panel.appendChild(heading);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  return { overlay, panel };
}

function createDialogButton(id, text, className) {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.className = className;
  button.textContent = String(text ?? '');
  return button;
}

function bindDialogClose(overlay, close) {
  overlay.addEventListener('click', event => {
    if (event.target === overlay) close();
  });
}

function showConfirmModal({
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Отмена',
  danger = false,
  onConfirm,
}) {
  const { overlay, panel } = createDialogShell('confirmModal', title);

  const description = document.createElement('p');
  description.className = 'app-dialog-message';
  description.textContent = String(message ?? '');

  const actions = document.createElement('div');
  actions.className = 'app-dialog-actions';
  const cancelButton = createDialogButton(
    'confirmCancelBtn',
    cancelText,
    'app-dialog-button app-dialog-button--cancel',
  );
  const confirmButton = createDialogButton(
    'confirmOkBtn',
    confirmText,
    danger
      ? 'app-dialog-button app-dialog-button--confirm is-danger'
      : 'app-dialog-button app-dialog-button--confirm',
  );
  actions.append(cancelButton, confirmButton);
  panel.append(description, actions);

  let escapeHandler;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', escapeHandler);
  };
  escapeHandler = event => {
    if (event.key === 'Escape') close();
  };

  cancelButton.addEventListener('click', close);
  confirmButton.addEventListener('click', () => {
    close();
    if (typeof onConfirm === 'function') onConfirm();
  });
  bindDialogClose(overlay, close);
  document.addEventListener('keydown', escapeHandler);
  confirmButton.focus();
}

function showPromptModal({
  title,
  placeholder = '',
  value = '',
  confirmText = 'Сохранить',
  cancelText = 'Отмена',
  multiline = true,
  onConfirm,
}) {
  const { overlay, panel } = createDialogShell('promptModal', title);

  const input = document.createElement(multiline ? 'textarea' : 'input');
  input.id = 'promptInput';
  input.className = 'app-dialog-input';
  input.placeholder = String(placeholder ?? '');
  input.value = String(value ?? '');
  if (multiline) input.rows = 3;
  else input.type = 'text';

  const actions = document.createElement('div');
  actions.className = 'app-dialog-actions';
  const cancelButton = createDialogButton(
    'promptCancelBtn',
    cancelText,
    'app-dialog-button app-dialog-button--cancel',
  );
  const confirmButton = createDialogButton(
    'promptOkBtn',
    confirmText,
    'app-dialog-button app-dialog-button--confirm',
  );
  actions.append(cancelButton, confirmButton);
  panel.append(input, actions);

  let keyHandler;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', keyHandler);
  };
  const submit = () => {
    const result = input.value.trim();
    close();
    if (typeof onConfirm === 'function') onConfirm(result);
  };
  keyHandler = event => {
    if (event.key === 'Escape') close();
    if (event.key === 'Enter' && !multiline) {
      event.preventDefault();
      submit();
    }
  };

  cancelButton.addEventListener('click', close);
  confirmButton.addEventListener('click', submit);
  bindDialogClose(overlay, close);
  document.addEventListener('keydown', keyHandler);
  setTimeout(() => input.focus(), 50);
}
