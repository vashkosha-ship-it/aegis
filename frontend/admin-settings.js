// ========== НАСТРОЙКИ СЕРВИСА НА ДАШБОРДЕ АДМИНКИ ==========
// Выключатель ИИ-ассистента и выбор ИИ-сервисов по видам работы. Вызывается
// из renderDashboard (admin-screens.js).

// Выключатель ИИ-ассистента для читателей. В ИИ-сервис уходит то, что пишут
// сами пользователи, поэтому администратор должен иметь возможность это
// прекратить одним действием, не трогая сервер.
async function renderAssistantSetting(container) {
  const card = document.createElement('div');
  card.className = 'admin-setting-card';
  const text = document.createElement('div');
  text.className = 'admin-setting-text';
  const title = document.createElement('div');
  title.className = 'admin-setting-title';
  title.textContent = 'ИИ-ассистент для читателей';
  const hint = document.createElement('div');
  hint.className = 'admin-setting-hint';
  hint.textContent = 'Чат и «Объяснить» в читалке. Сообщения читателей передаются в выбранный ниже ИИ-сервис. Тесты и описания книг от настройки не зависят.';
  text.append(title, hint);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'admin-tool';
  button.disabled = true;
  button.textContent = 'Загрузка…';
  card.append(text, button);
  container.appendChild(card);

  let enabled = null;
  const show = () => {
    button.disabled = enabled === null;
    button.textContent = enabled ? 'Выключить' : 'Включить';
    button.classList.toggle('admin-tool--danger', enabled === true);
    title.textContent = `ИИ-ассистент для читателей: ${enabled ? 'включён' : 'выключен'}`;
  };
  try {
    enabled = (await api.settings()).assistant_enabled === true;
    show();
  } catch (err) {
    console.error('Не удалось загрузить настройки:', err);
    button.textContent = 'Недоступно';
    return;
  }
  button.addEventListener('click', async () => {
    const next = !enabled;
    if (!next && !(await appConfirm('Чат и «Объяснить» в читалке перестанут работать у всех читателей.', { title: 'Выключить ИИ-ассистента?', confirmText: 'Выключить', danger: true }))) return;
    button.disabled = true;
    try {
      enabled = (await api.updateSettings({ assistant_enabled: next })).assistant_enabled === true;
      // Администратор видит изменение сразу, как и все читатели.
      if (typeof applyAssistantAvailability === 'function') applyAssistantAvailability(enabled);
      showToast(enabled ? 'ИИ-ассистент включён' : 'ИИ-ассистент выключен');
    } catch (err) {
      console.error('Не удалось изменить настройку:', err);
      showToast('Не удалось изменить настройку');
    }
    show();
  });
}

// Какой ИИ-сервис какую работу делает: DeepSeek или GigaChat. Две строки:
// общение с пользователями и тесты; обработка книг (описания, карточки, темы).
// Сервис без ключа на сервере выбрать нельзя — кнопка неактивна и подписана.
const AI_TASK_FIELDS = { assistant: 'ai_provider_assistant', books: 'ai_provider_books' };

async function renderAiProviderSetting(container) {
  const card = document.createElement('div');
  card.className = 'admin-setting-card ai-provider-card';
  const text = document.createElement('div');
  text.className = 'admin-setting-text';
  const title = document.createElement('div');
  title.className = 'admin-setting-title';
  title.textContent = 'ИИ-сервисы';
  const hint = document.createElement('div');
  hint.className = 'admin-setting-hint';
  hint.textContent = 'Кто какую работу делает. Переключение действует для всех сразу.';
  text.append(title, hint);
  const rows = document.createElement('div');
  rows.className = 'ai-provider-rows';
  card.append(text, rows);
  container.appendChild(card);

  let data;
  try {
    data = await api.aiSettings();
  } catch (err) {
    console.error('Не удалось загрузить выбор ИИ:', err);
    hint.textContent = 'Не удалось загрузить настройку.';
    return;
  }
  const label = id => (data.options.find(option => option.id === id) || {}).label || id;

  const draw = () => {
    rows.replaceChildren();
    data.tasks.forEach(task => {
      const row = document.createElement('div');
      row.className = 'ai-provider-row';
      const head = document.createElement('div');
      head.className = 'ai-provider-task';
      const name = document.createElement('span');
      name.className = 'ai-provider-task-name';
      name.textContent = task.label;
      head.appendChild(name);
      if (task.effective !== task.selected) {
        const note = document.createElement('span');
        note.className = 'ai-provider-fallback';
        note.textContent = `${label(task.selected)} не подключён — сейчас работает ${label(task.effective)}`;
        head.appendChild(note);
      }
      const choices = document.createElement('div');
      choices.className = 'ai-provider-choices';
      choices.setAttribute('role', 'radiogroup');
      choices.setAttribute('aria-label', task.label);
      data.options.forEach(option => {
        const active = option.id === task.selected;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'admin-tool ai-provider-choice';
        button.classList.toggle('admin-tool--primary', active);
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-checked', String(active));
        button.disabled = active || !option.configured;
        if (!option.configured) button.title = 'На сервере не задан ключ этого сервиса';
        const optionName = document.createElement('span');
        optionName.className = 'ai-provider-name';
        optionName.textContent = option.label;
        const meta = document.createElement('span');
        meta.className = 'ai-provider-meta';
        meta.textContent = option.configured ? option.model : 'не подключён';
        button.append(optionName, meta);
        button.addEventListener('click', async () => {
          if (!(await appConfirm(`«${task.label}» будет выполнять ${option.label}.`, { title: 'Переключить ИИ-сервис?', confirmText: 'Переключить' }))) return;
          rows.querySelectorAll('button').forEach(item => { item.disabled = true; });
          try {
            await api.updateSettings({ [AI_TASK_FIELDS[task.task]]: option.id });
            data = await api.aiSettings();
            showToast(`${task.label}: ${option.label}`);
          } catch (err) {
            console.error('Не удалось переключить ИИ:', err);
            showToast(err && err.detail ? err.detail : 'Не удалось переключить');
          }
          draw();
        });
        choices.appendChild(button);
      });
      row.append(head, choices);
      rows.appendChild(row);
    });
  };
  draw();
}
