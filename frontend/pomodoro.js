'use strict';

/* Таймер Pomodoro для режима чтения. */

let pomodoroInterval = null;
let pomodoroSeconds = 25 * 60;
let pomodoroRunning = false;
let pomodoroMode = 'work';

function pomodoroElement(id) {
  return document.getElementById(id);
}

function setPomodoroRunningUi(running) {
  pomodoroElement('pomodoroStart')?.classList.toggle('is-hidden', running);
  pomodoroElement('pomodoroPause')?.classList.toggle('is-hidden', !running);
}

function togglePomodoro() {
  pomodoroElement('pomodoroContainer')?.classList.toggle('show');
}

function updatePomodoroDisplay() {
  const minutes = Math.floor(pomodoroSeconds / 60);
  const seconds = pomodoroSeconds % 60;
  const timer = pomodoroElement('pomodoroTimer');
  if (timer) {
    timer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
}

function startPomodoro() {
  if (pomodoroRunning) return;

  pomodoroRunning = true;
  setPomodoroRunningUi(true);
  const status = pomodoroElement('pomodoroStatus');
  if (status) status.textContent = pomodoroMode === 'work' ? 'Фокус' : 'Перерыв';

  pomodoroInterval = setInterval(() => {
    pomodoroSeconds = Math.max(0, pomodoroSeconds - 1);
    updatePomodoroDisplay();
    if (pomodoroSeconds > 0) return;

    clearInterval(pomodoroInterval);
    pomodoroInterval = null;
    pomodoroRunning = false;

    if (pomodoroMode === 'work') {
      pomodoroMode = 'break';
      pomodoroSeconds = 5 * 60;
      showToast('Перерыв!');
    } else {
      pomodoroMode = 'work';
      pomodoroSeconds = 25 * 60;
      showToast('Работаем!');
    }

    setPomodoroRunningUi(false);
    updatePomodoroDisplay();
  }, 1000);
}

function pausePomodoro() {
  clearInterval(pomodoroInterval);
  pomodoroInterval = null;
  pomodoroRunning = false;
  setPomodoroRunningUi(false);
}

function resetPomodoro() {
  clearInterval(pomodoroInterval);
  pomodoroInterval = null;
  pomodoroRunning = false;
  pomodoroMode = 'work';
  pomodoroSeconds = 25 * 60;
  setPomodoroRunningUi(false);
  updatePomodoroDisplay();

  const status = pomodoroElement('pomodoroStatus');
  if (status) status.textContent = 'Готов к работе';
}
