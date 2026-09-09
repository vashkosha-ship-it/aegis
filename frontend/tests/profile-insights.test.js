'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'profile-insights.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM(`
  <div id="adLeaderboard"></div>
  <div id="heatmapContainer"></div>
  <canvas id="skillsRadarCanvas"></canvas>
  <div id="skillsRadarEmpty"></div>
`);
dom.window.HTMLCanvasElement.prototype.getContext = () => ({});

const charts = [];
class ChartStub {
  constructor(_canvas, config) { this.config = config; charts.push(this); }
  destroy() { this.destroyed = true; }
}

const state = {
  currentUser: { username: 'alice' },
  books: [
    { id: 1, title: 'OWASP для web', categories: ['AppSec'] },
    { id: 2, title: 'SOC', categories: ['Defense'] },
  ],
  mylist: { 1: 'completed', 2: 'reading' },
  readingProgress: { 2: { started: true } },
  heatmapData: null,
};
const context = {
  document: dom.window.document,
  dynamicStyleToken: () => 'test-style',
  Chart: ChartStub,
  getComputedStyle: dom.window.getComputedStyle,
  state,
  api: { library: {
    leaderboard: async () => [{ place: 1, full_name: '<Alice>', xp: 100, streak_count: 3 }],
    heatmap: async () => ({ days: [{ date: '2026-09-07', pages: 32 }] }),
    dayStats: async () => ({
      pages_read: 5, quiz_attempts: 0, annotations_count: 1,
      highlights_count: 1, notes_count: 0,
      books: [{ title: '<Book>', pages_at_end: 5 }], quizzes: [],
    }),
  } },
  ICONS: { fire: 'FIRE' },
  eh: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  await context.loadAndRenderLeaderboard();
  const leaderboard = dom.window.document.getElementById('adLeaderboard').innerHTML;
  assert.match(leaderboard, /&lt;Alice&gt;/);
  assert.doesNotMatch(leaderboard, /<Alice>/);

  const scores = context.computeSkillScores();
  assert.equal(scores.raw['AppSec / Web'], 2);
  assert.equal(scores.raw['Defense / SOC'], 1);

  await context.renderHeatmap();
  const cell = dom.window.document.querySelector('.heatmap-cell');
  assert.ok(cell.classList.contains('level-3'));
  assert.equal(cell.dataset.pages, '32');

  await context.renderSkillsRadar();
  assert.equal(charts.length, 1);
  assert.equal(charts[0].config.type, 'radar');

  assert.match(context.renderHeatmapDayContent({
    pages_read: 1, quiz_attempts: 0, annotations_count: 0,
    highlights_count: 0, notes_count: 0,
    books: [{ title: '<Unsafe>', pages_at_end: 1 }], quizzes: [],
  }), /&lt;Unsafe&gt;/);

  assert.doesNotMatch(appSource, /function loadAndRenderLeaderboard|function renderHeatmap|function computeSkillScores/);
  assert.ok(indexSource.indexOf('profile-insights.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /['"]\/profile-insights\.js['"]/);
  assert.match(workerSource, /const CACHE_NAME = 'aegis-cache-v\d+'/);
  console.log('Profile insights tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
