// Reader and catalog personalization settings.

const READER_FONT_KEY = 'aegis_reader_font';
function getReaderFontScale() { return parseInt(localStorage.getItem(READER_FONT_KEY) || '100', 10); }
function setReaderFontScale(pct) {
  localStorage.setItem(READER_FONT_KEY, String(pct));
  renderSettingsPersonalizationTab(document.getElementById('settingsContent'));
  showToast(`Шрифт читалки: ${pct}%`);
}

function _accountChoiceButton(label, selected, styleText, onClick, className) {
  const button = document.createElement('button');
  button.type = 'button';
  if (className) button.className = className;
  if (selected) button.classList.add('active');
  button.setAttribute('data-dynamic-style', dynamicStyleToken(styleText));
  button.addEventListener('click', onClick);
  if (label instanceof Node) button.appendChild(label);
  else button.textContent = String(label);
  return button;
}

function renderSettingsPersonalizationTab(c) {
  const currentTheme = getAppTheme();
  const currentGrid = getGridSize();
  const goal = getReadingGoal();
  const fontScale = getReaderFontScale();
  const booksGoal = getBooksGoal();

  const createRow = (labelText, content, hint) => {
    const row = document.createElement('div');
    row.className = 'set-row';
    row.append(_accountNode('label', null, labelText), content);
    if (hint) row.appendChild(_accountNode('div', 'a410', hint));
    return row;
  };
  const choiceStyle = (selected, extra = '') =>
    `flex:1;padding:10px;background:${selected ? 'var(--accent-gradient)' : 'transparent'};border:none;color:${selected ? '#fff' : 'var(--text-secondary)'};border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;${extra}`;

  const themeChoices = _accountNode('div', 'a407');
  [
    ['dark', 'themeMoon', 'Тёмная'],
    ['light', 'themeSun', 'Светлая'],
  ].forEach(([theme, iconName, label]) => {
    const selected = currentTheme === theme;
    const button = _accountChoiceButton(
      document.createDocumentFragment(),
      selected,
      choiceStyle(selected, 'display:inline-flex;align-items:center;justify-content:center;gap:6px;font-size:12px;font-weight:600;'),
      () => {
        setAppTheme(theme);
        renderSettingsPersonalizationTab(document.getElementById('settingsContent'));
      },
      'app-theme-btn',
    );
    appendTrustedIcon(button, ICONS[iconName]);
    button.appendChild(_accountNode('span', null, label));
    themeChoices.appendChild(button);
  });

  const gridChoices = _accountNode('div', 'a407');
  [2, 3, 4].forEach(count => {
    gridChoices.appendChild(
      _accountChoiceButton(
        count,
        currentGrid === count,
        choiceStyle(currentGrid === count, "font-family:'JetBrains Mono',monospace;"),
        () => setGridSize(count),
      ),
    );
  });

  const preview = _accountNode('div', 'a408');
  const previewGrid = document.createElement('div');
  previewGrid.id = 'gridPreview';
  previewGrid.setAttribute(
    'data-dynamic-style',
    dynamicStyleToken`display:grid;grid-template-columns:repeat(${currentGrid},1fr);gap:6px;`,
  );
  for (let index = 0; index < currentGrid * 2; index += 1) {
    previewGrid.appendChild(_accountNode('div', 'a409'));
  }
  preview.appendChild(previewGrid);

  const readingGoalChoices = _accountNode('div', 'a407');
  [10, 20, 30, 50].forEach(pageCount => {
    readingGoalChoices.appendChild(
      _accountChoiceButton(
        pageCount,
        goal === pageCount,
        choiceStyle(goal === pageCount, "font-family:'JetBrains Mono',monospace;"),
        () => setReadingGoal(pageCount),
      ),
    );
  });

  const booksGoalContent = document.createDocumentFragment();
  booksGoalContent.appendChild(_accountNode('div', 'a411', 'Выберите количество книг и период'));
  booksGoalContent.appendChild(_accountNode('div', 'a412', 'Количество книг'));
  const countChoices = _accountNode('div', 'a413');
  [5, 10, 15, 20, 30].forEach(count => {
    const selected = booksGoal?.count === count;
    countChoices.appendChild(
      _accountChoiceButton(
        count,
        selected,
        `min-width:52px;padding:12px 10px;border-radius:10px;border:1px solid ${selected ? 'transparent' : 'var(--border)'};background:${selected ? 'var(--accent-gradient)' : 'var(--bg-primary)'};color:${selected ? '#fff' : 'var(--text-secondary)'};cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:700;`,
        event => selectBooksGoalCount(count, event.currentTarget),
        'bg-count-btn',
      ),
    );
  });
  booksGoalContent.appendChild(countChoices);
  booksGoalContent.appendChild(_accountNode('div', 'a412', 'Или своё число'));
  const customCount = _accountNode('input', 'a414');
  customCount.id = 'booksGoalCount';
  customCount.type = 'number';
  customCount.inputMode = 'numeric';
  customCount.min = '1';
  customCount.max = '200';
  customCount.value = booksGoal?.count || '';
  customCount.placeholder = 'например, 12';
  booksGoalContent.appendChild(customCount);

  booksGoalContent.appendChild(_accountNode('div', 'a412', 'За какой период'));
  const periodChoices = _accountNode('div', 'a415');
  const currentPeriod = booksGoal?.period || 'quarter';
  [
    ['month', 'Месяц'],
    ['quarter', 'Квартал'],
    ['year', 'Год'],
  ].forEach(([period, label]) => {
    const selected = currentPeriod === period;
    periodChoices.appendChild(
      _accountChoiceButton(
        label,
        selected,
        `flex:1;padding:13px 8px;border-radius:10px;border:1px solid ${selected ? 'transparent' : 'var(--border)'};background:${selected ? 'var(--accent-gradient)' : 'var(--bg-primary)'};color:${selected ? '#fff' : 'var(--text-secondary)'};cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;`,
        event => selectBooksGoalPeriod(period, event.currentTarget),
        'bg-period-btn',
      ),
    );
  });
  booksGoalContent.appendChild(periodChoices);
  booksGoalContent.appendChild(
    _accountSaveButton('Сохранить цель', saveBooksGoalFromUI, 'a416'),
  );
  if (booksGoal) {
    booksGoalContent.appendChild(
      _accountSaveButton('Снять цель', () => setBooksGoal(0), 'a417'),
    );
  }
  booksGoalContent.appendChild(
    _accountNode('div', 'a418', 'Прогресс-бар появится на главной странице'),
  );
  const booksGoalRow = document.createElement('div');
  booksGoalRow.className = 'set-row';
  booksGoalRow.append(_accountNode('label', null, 'Цель: сколько книг прочитать'), booksGoalContent);

  const fontChoices = _accountNode('div', 'a407');
  [
    [90, 'А-'],
    [100, 'А'],
    [115, 'А+'],
    [130, 'А++'],
  ].forEach(([scale, label]) => {
    fontChoices.appendChild(
      _accountChoiceButton(
        label,
        fontScale === scale,
        choiceStyle(fontScale === scale),
        () => setReaderFontScale(scale),
      ),
    );
  });

  c.replaceChildren(
    _accountNode('h3', 'a350', 'Персонализация'),
    createRow('Тема приложения', themeChoices),
    createRow('Карточек книг в ряд', gridChoices),
    createRow('Предпросмотр', preview, 'Изменения применяются ко всему каталогу'),
    createRow('Цель чтения (страниц в день)', readingGoalChoices, 'Цель отображается в профиле и тепловой карте'),
    booksGoalRow,
    createRow('Размер шрифта в читалке', fontChoices, 'Масштаб страницы при открытии книги'),
  );
}

function setGridSize(n) {
  applyGridSize(n);
  // Перерисуем экран настроек чтобы обновить активную кнопку и предпросмотр
  renderSettingsPersonalizationTab(document.getElementById('settingsContent'));
  // Если открыта главная — перерисуем каталог
  if (state.currentScreen === 'home') renderHome();
  showToast(`Карточек в ряд: ${n}`);
}

function _accountLabeledInput(labelText, input) {
  const row = document.createElement('div');
  row.className = 'set-row';
  row.append(_accountNode('label', null, labelText), input);
  return row;
}

function _accountFormInput(type, id, placeholder, autocomplete, maxLength) {
  const input = document.createElement('input');
  input.type = type;
  input.id = id;
  input.placeholder = placeholder;
  if (autocomplete) input.autocomplete = autocomplete;
  if (maxLength) input.maxLength = maxLength;
  return input;
}

function _accountSaveButton(text, onClick, staticStyle) {
  const button = _accountNode('button', staticStyle);
  button.className = 'set-save-btn';
  button.type = 'button';
  button.appendChild(document.createElement('span')).textContent = text;
  button.addEventListener('click', onClick);
  return button;
}
