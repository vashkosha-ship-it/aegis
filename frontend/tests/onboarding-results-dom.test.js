'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(frontend, 'onboarding.js'), 'utf8');
const dom = new JSDOM('<div id="onboardingResultContent"></div>');
const icon = '<svg width="22" height="20"></svg>';
const calls = [];
const context = {
  document: dom.window.document,
  state: { currentUser: { is_approved: true } },
  ICONS: {
    target: icon,
    warningTriangle: icon,
    levelGateGuardian: icon,
    levelScout: icon,
    levelStronghold: icon,
    levelShadowArchitect: icon,
    levelAbyssWarden: icon,
  },
  appendTrustedIcon: (container, markup) => {
    const parsed = new dom.window.DOMParser().parseFromString(markup, 'image/svg+xml');
    container.appendChild(dom.window.document.importNode(parsed.documentElement, true));
  },
  dynamicStyleToken: css => 'test:' + css,
  navigateTo: screen => calls.push(screen),
  console,
};
vm.createContext(context);
vm.runInContext(source, context);

const result = {
  cyber_level: 'scout',
  level_name: '<img src=x onerror=alert(1)>',
  level_description: '<script>alert(1)</script>',
  overall_percentage: 72,
  assessed_at: '2026-09-10T00:00:00Z',
  topic_scores: [
    { topic: 'network', topic_name: '<svg onload=alert(1)>', percentage: 150 },
    { topic: 'web', topic_name: 'Web', percentage: 55 },
  ],
  weak_topics: ['network'],
};

context.renderOnboardingResult(result);
let content = dom.window.document.getElementById('onboardingResultContent');
assert.equal(content.querySelector('.onboarding-result-level').textContent, result.level_name);
assert.equal(content.querySelector('.onboarding-result-description').textContent, result.level_description);
assert.equal(content.querySelector('.onboarding-topic-fill').getAttribute('data-dynamic-style'), 'test:width:100%;');
assert.match(content.querySelector('.onboarding-weak-list').textContent, /<svg onload=alert\(1\)>/);
assert.equal(content.querySelector('img, script, svg[onload]'), null);
assert.equal(content.querySelectorAll('[data-onclick]').length, 0);
assert.equal(content.querySelector('[data-static-style="a574"] svg').getAttribute('width'), '40');

context.renderCyberLevelDetail(result);
content = dom.window.document.getElementById('onboardingResultContent');
assert.match(content.textContent, /Тест пройден:/);
assert.equal(content.querySelectorAll('button').length, 2);
content.querySelector('.btn-onboarding-skip').click();
assert.deepEqual(calls, ['profile']);

const resultFragment = source.slice(
  source.indexOf('function renderOnboardingResult'),
  source.indexOf('function finishOnboardingNav'),
);
const detailFragment = source.slice(
  source.indexOf('function renderCyberLevelDetail'),
  source.indexOf('function restartOnboarding'),
);
assert.doesNotMatch(resultFragment, /innerHTML/);
assert.doesNotMatch(detailFragment, /innerHTML/);
console.log('Onboarding result DOM tests passed');
