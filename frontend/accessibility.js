'use strict';

/* Общие правила клавиатурной доступности для модальных окон. */
const _focusTraps = new WeakMap();

function accessibleFocusableElements(container) {
  if (!container) return [];
  const selector = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  return [...container.querySelectorAll(selector)].filter(element => (
    !element.hidden && !element.closest('[hidden]') && element.getAttribute('aria-hidden') !== 'true'
  ));
}

function releaseFocusTrap(container, { restoreFocus = true } = {}) {
  const state = _focusTraps.get(container);
  if (!state) return;
  document.removeEventListener('keydown', state.onKeydown, true);
  _focusTraps.delete(container);
  if (restoreFocus && state.returnFocus?.isConnected) state.returnFocus.focus();
}

function activateFocusTrap(container, { initialFocus, onEscape } = {}) {
  if (!container) return () => {};
  releaseFocusTrap(container, { restoreFocus: false });
  const returnFocus = document.activeElement;
  const onKeydown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (typeof onEscape === 'function') onEscape();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = accessibleFocusableElements(container);
    if (focusable.length === 0) {
      event.preventDefault();
      container.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  _focusTraps.set(container, { onKeydown, returnFocus });
  document.addEventListener('keydown', onKeydown, true);
  const target = initialFocus || accessibleFocusableElements(container)[0] || container;
  if (!container.hasAttribute('tabindex') && target === container) container.tabIndex = -1;
  setTimeout(() => target?.focus(), 0);
  return () => releaseFocusTrap(container);
}

function preferredScrollBehavior() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function prepareStaticDialog(dialog) {
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const heading = dialog.querySelector('h1, h2, h3');
  if (heading) {
    if (!heading.id) heading.id = `${dialog.id || 'appDialog'}Title`;
    dialog.setAttribute('aria-labelledby', heading.id);
  }
  const closeControl = dialog.querySelector('[data-onclick^="close"], [aria-label^="Закрыть"]');
  activateFocusTrap(dialog, {
    initialFocus: closeControl || accessibleFocusableElements(dialog)[0],
    onEscape: () => {
      if (closeControl) closeControl.click();
      else {
        releaseFocusTrap(dialog);
        dialog.classList.add('hidden');
      }
    },
  });
}

function syncStaticDialog(dialog) {
  const visible = !dialog.classList.contains('hidden') && dialog.getAttribute('aria-hidden') !== 'true';
  if (visible) prepareStaticDialog(dialog);
  else releaseFocusTrap(dialog);
}

function initializeStaticDialogAccessibility() {
  const dialogs = [...document.querySelectorAll('.modal-overlay')];
  dialogs.forEach(syncStaticDialog);
  if (!window.MutationObserver) return;
  const observer = new window.MutationObserver(records => {
    records.forEach(record => {
      if (record.target.matches?.('.modal-overlay')) syncStaticDialog(record.target);
    });
  });
  dialogs.forEach(dialog => observer.observe(dialog, {
    attributes: true,
    attributeFilter: ['class', 'aria-hidden'],
  }));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeStaticDialogAccessibility, { once: true });
} else {
  initializeStaticDialogAccessibility();
}
