// Панель AI-ассистента внутри читалки.
let readerAiMessages = [];
let readerAiBusy = false;

function toggleAIPanel() {
  state.aiOpen = !state.aiOpen;
  document.getElementById('aiPanel').classList.toggle('show', state.aiOpen);
  document.getElementById('aiOverlay').classList.toggle('show', state.aiOpen);
  if (state.aiOpen) {
    const surface = assistantSurface('reader');
    if (surface.messages.length === 0) {
      surface.messages.push({
        role: 'assistant',
        content: 'Привет! Я AI-ассистент Aegis. Спроси про книгу, попроси саммари, тест или рекомендации.'
      });
    }
    assistantRender(surface);
    setTimeout(() => document.getElementById('aiInput')?.focus(), 100);
  }
}

function closeAIPanel() {
  state.aiOpen = false;
  document.getElementById('aiPanel').classList.remove('show');
  document.getElementById('aiOverlay').classList.remove('show');
  state.pendingAiAction = null;
}

function sendAIMessage() {
  const surface = assistantSurface('reader');
  const input = surface.inputEl();
  const text = input ? input.value : '';
  if (input) input.value = '';
  assistantSend(surface, text);
}

function aiQuick(action) {
  assistantHandleQuick(assistantSurface('reader'), action);
}
