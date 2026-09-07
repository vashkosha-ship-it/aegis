'use strict';

/* Одноразовый onboarding-тур по основным разделам приложения. */

const ONBOARDING_TOUR_STEPS = [
  {
    selector: '.nav-item[data-screen="home"], .sidebar-item[data-screen="home"]',
    title: 'Библиотека',
    text: 'Здесь вся библиотека по кибербезопасности. Ищите книги, читайте онлайн и сохраняйте прогресс — он не потеряется.',
    emoji: '📚',
  },
  {
    selector: '.nav-item[data-screen="training"], .sidebar-item[data-screen="training"]',
    title: 'Тестирование',
    text: 'Проверяйте знания тестами по книгам и получайте сертификаты. Вопросы генерирует ИИ под каждую тему.',
    emoji: '🎓',
  },
  {
    selector: '#btnOpenAssistant, .sidebar-item[data-screen="assistant"]',
    title: 'AI-ассистент',
    text: 'Личный помощник по кибербезопасности: объяснит сложное простыми словами, сделает саммари книги, посоветует материалы.',
    emoji: '✨',
  },
  {
    selector: '.nav-item[data-screen="profile"], .sidebar-item[data-screen="profile"]',
    title: 'Профиль и AR-схемы',
    text: 'В профиле — ваш прогресс и достижения. В приложении также есть интерактивные AR-схемы атак.',
    emoji: '🛡️',
  },
];

function tourPixel(value) {
  const number = Number(value);
  return `${Number.isFinite(number) ? Math.round(number) : 0}px`;
}

function replayOnboardingTour() {
  navigateTo('home');
  try {
    localStorage.removeItem('aegis_tour_done');
  } catch (_) {
    return;
  }
  setTimeout(startOnboardingTour, 600);
}

function maybeStartOnboardingTour() {
  try {
    if (localStorage.getItem('aegis_tour_done') === '1') return;
  } catch (_) {
    return;
  }
  if (state.currentScreen !== 'home') return;
  setTimeout(startOnboardingTour, 700);
}

function startOnboardingTour() {
  document.getElementById('tourOverlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'tourOverlay';
  overlay.className = 'tour-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  document.body.appendChild(overlay);

  let index = 0;
  let escapeHandler;

  const finish = () => {
    try {
      localStorage.setItem('aegis_tour_done', '1');
    } catch (_) {
      // Тур всё равно должен закрываться, даже если storage недоступен.
    }
    document.removeEventListener('keydown', escapeHandler);
    overlay.remove();
  };

  const showStep = () => {
    const step = ONBOARDING_TOUR_STEPS[index];
    const target = document.querySelector(step.selector);
    if (!target) {
      index += 1;
      if (index >= ONBOARDING_TOUR_STEPS.length) finish();
      else showStep();
      return;
    }

    const rect = target.getBoundingClientRect();
    const padding = 6;
    overlay.replaceChildren();

    const spotlight = document.createElement('div');
    spotlight.className = 'tour-spotlight';
    spotlight.style.top = tourPixel(rect.top - padding);
    spotlight.style.left = tourPixel(rect.left - padding);
    spotlight.style.width = tourPixel(rect.width + padding * 2);
    spotlight.style.height = tourPixel(rect.height + padding * 2);

    const card = document.createElement('div');
    card.className = 'tour-card';
    if (rect.top > window.innerHeight / 2) {
      card.style.bottom = tourPixel(window.innerHeight - rect.top + 16);
    } else {
      card.style.top = tourPixel(rect.bottom + 16);
    }

    const emoji = document.createElement('div');
    emoji.className = 'tour-emoji';
    emoji.textContent = step.emoji;

    const title = document.createElement('div');
    title.className = 'tour-title';
    title.textContent = step.title;

    const text = document.createElement('div');
    text.className = 'tour-text';
    text.textContent = step.text;

    const footer = document.createElement('div');
    footer.className = 'tour-footer';

    const dots = document.createElement('div');
    dots.className = 'tour-dots';
    ONBOARDING_TOUR_STEPS.forEach((_, dotIndex) => {
      const dot = document.createElement('span');
      dot.className = dotIndex === index ? 'tour-dot is-active' : 'tour-dot';
      dots.appendChild(dot);
    });

    const actions = document.createElement('div');
    actions.className = 'tour-actions';

    const skipButton = document.createElement('button');
    skipButton.type = 'button';
    skipButton.className = 'tour-button tour-button--skip';
    skipButton.textContent = 'Пропустить';
    skipButton.addEventListener('click', finish);

    const nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.className = 'tour-button tour-button--next';
    nextButton.textContent = index === ONBOARDING_TOUR_STEPS.length - 1 ? 'Понятно!' : 'Далее';
    nextButton.addEventListener('click', () => {
      index += 1;
      if (index >= ONBOARDING_TOUR_STEPS.length) finish();
      else showStep();
    });

    actions.append(skipButton, nextButton);
    footer.append(dots, actions);
    card.append(emoji, title, text, footer);
    overlay.append(spotlight, card);
    nextButton.focus();
  };

  escapeHandler = event => {
    if (event.key === 'Escape') finish();
  };
  document.addEventListener('keydown', escapeHandler);
  showStep();
}
