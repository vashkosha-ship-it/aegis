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
const context = {
  document: dom.window.document,
  dynamicStyleToken: () => 'test-style',
  Chart: ChartStub,
  api: { library: { adminBookAnalytics: async () => bookAnalytics } },
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
  context.renderAnalytics();
  assert.equal(charts.length, 4);
  assert.equal(dom.window.document.querySelectorAll('#analyticsBookSelector option').length, 2);
  assert.match(dom.window.document.getElementById('analyticsBookSelector').innerHTML, /&lt;Книга&gt;/);

  context.destroyAnalyticsCharts();
  assert.ok(charts.every(chart => chart.destroyed));

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
