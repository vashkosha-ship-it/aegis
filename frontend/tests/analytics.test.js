'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const FRONTEND = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(FRONTEND, 'analytics.js'), 'utf8');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

const dom = new JSDOM(`
  <select id="analyticsBookSelector"></select>
  <canvas id="chartReadingActivity"></canvas>
  <canvas id="chartTopBooks"></canvas>
  <canvas id="chartFunnel"></canvas>
  <canvas id="chartRetention"></canvas>
  <div id="bookAnalyticsModal" class="hidden"></div>
  <div id="bookAnalyticsContent"></div>
`);
dom.window.HTMLCanvasElement.prototype.getContext = () => ({});

const charts = [];
const chartLoads = [];
const toasts = [];
class ChartStub {
  constructor(_context, config) {
    this.config = config;
    this.destroyed = false;
    charts.push(this);
  }
  destroy() { this.destroyed = true; }
}

const bookAnalytics = {
  title: '<Книга>', author: '<Автор>', categories: ['Web'],
  views: 10, downloads: 2, rating: 4.5, reviews_count: 1,
  mylist: { total: 1, reading: 1, planned: 0, completed: 0, dropped: 0, liked: 0 },
  readers_started: 1, readers_completed: 0, avg_progress_pct: 25,
  readers: [], quiz_attempts: 0, quiz_passed: 0, quiz_avg_percentage: 0,
};
const libraryAnalytics = {
  activity: ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']
    .map((date, index) => ({ date, pages: index === 6 ? 15 : 0 })),
  top_books: [{ book_id: 7, title: '<Книга>', readers: 2 }],
  funnel: { views: 12, opened: 3, reading: 2, completed: 1 },
  retention: [
    { day: 1, eligible: 4, retained: 3 },
    { day: 7, eligible: 2, retained: 1 },
    { day: 30, eligible: 0, retained: 0 },
  ],
};
const context = {
  accentRgba: (alpha = 1) => `rgba(255, 92, 31, ${alpha})`,
  replaceWithAppMarkup(target, markup) { target.innerHTML = markup; },
  document: dom.window.document,
  replaceWithStaticText: (container, text, style, tag = 'div') => {
    const node = dom.window.document.createElement(tag);
    node.textContent = text;
    node.setAttribute('data-static-style', style);
    container.replaceChildren(node);
  },
  replaceSelectOptions: (select, items) => {
    select.replaceChildren(...items.map(item => {
      const option = dom.window.document.createElement('option');
      option.value = String(item.value ?? item);
      option.textContent = String(item.label ?? item);
      return option;
    }));
  },
  dynamicStyleToken: () => 'test-style',
  Chart: ChartStub,
  ensureChartLoaded: async () => { chartLoads.push(1); },
  showToast: message => toasts.push(message),
  api: { library: {
    adminBookAnalytics: async () => bookAnalytics,
    adminAnalytics: async () => libraryAnalytics,
  } },
  state: {
    books: [{ id: 7, title: '<Книга>', views: 10 }],
    heatmapData: [], readingProgress: {}, mylist: {},
  },
  eh: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

(async () => {
  await context.renderAnalytics();
  // Chart.js грузится лениво: без ожидания графики падали «Chart is not defined».
  assert.equal(chartLoads.length, 1);
  assert.equal(charts.length, 4);
  // Графики строятся из серверной сводки по всем читателям.
  assert.deepEqual([...charts[0].config.data.datasets[0].data], [0, 0, 0, 0, 0, 0, 15]);
  assert.deepEqual([...charts[1].config.data.datasets[0].data], [2]);
  // Воронка — без «Просмотров»: шаги в парах «читатель — книга».
  assert.deepEqual([...charts[2].config.data.datasets[0].data], [3, 2, 1]);
  assert.match(dom.window.document.querySelector('.analytics-caption').textContent, /Просмотров карточек книг: 12/);
  // Шкалы счётчиков целочисленные.
  assert.equal(charts[1].config.options.scales.x.ticks.precision, 0);
  assert.equal(charts[2].config.options.scales.y.ticks.precision, 0);
  // Удержание: сроки без подходящих читателей не показываются.
  assert.deepEqual([...charts[3].config.data.labels], ['Через 1 день', 'Через 7 дней']);
  assert.deepEqual([...charts[3].config.data.datasets[0].data], [75, 50]);
  assert.equal(dom.window.document.getElementById('chartRetention').hidden, false);
  assert.doesNotMatch(source, /state\.heatmapData|state\.readingProgress/);
  assert.doesNotMatch(source, /\[100, 65, 48/);
  assert.equal(dom.window.document.querySelectorAll('#analyticsBookSelector option').length, 2);
  assert.match(dom.window.document.getElementById('analyticsBookSelector').innerHTML, /&lt;Книга&gt;/);

  context.destroyAnalyticsCharts();
  assert.ok(charts.every(chart => chart.destroyed));

  // Если библиотеку графиков загрузить не удалось — сообщение, а не исключение.
  context.ensureChartLoaded = async () => { throw new Error('offline'); };
  const before = charts.length;
  await context.renderAnalytics();
  assert.equal(charts.length, before);
  assert.match(toasts.at(-1), /библиотеку графиков/);

  await context.openBookAnalyticsModal(7);
  const content = dom.window.document.getElementById('bookAnalyticsContent').innerHTML;
  assert.match(content, /&lt;Книга&gt;/);
  assert.match(content, /&lt;Автор&gt;/);
  assert.doesNotMatch(content, /<Книга>/);

  assert.doesNotMatch(appSource, /function renderAnalytics|function openBookAnalyticsModal|let analyticsCharts/);
  assert.ok(indexSource.indexOf('analytics.js') < indexSource.indexOf('app.js'));
  assert.match(workerSource, /['"]\/analytics\.js['"]/);
  assert.match(workerSource, /const CACHE_NAME = 'aegis-cache-v\d+'/);
  console.log('Analytics tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
