'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(frontend, name), 'utf8');

const app = read('app.js');
const state = read('app-state.js');
const user = read('user-features.js');
const library = read('library-home.js');
const reader = read('reader-core.js');
const onboarding = read('onboarding.js');
const index = read('index.html');
const worker = read('sw.js');

assert.match(state, /const state\s*=\s*\{/);
assert.match(state, /let pdfDoc\s*=/);
assert.match(state, /let currentQuiz\s*=/);

const boundaries = [
  [user, ['loadGamificationFromApi', 'runFullTextSearch', 'startCertExam', 'exportAllUserData', 'renderDetailNotes']],
  [library, ['adaptBookFromApi', 'loadBooksFromApi', 'renderHome', 'openBookDetail']],
  [reader, ['loadEpub', 'loadPdf', 'renderPdfPage']],
  [onboarding, ['renderLevelChoices', 'startOnboarding', 'renderOnboardingResult', 'restartOnboarding']],
];

for (const [source, symbols] of boundaries) {
  for (const symbol of symbols) {
    const declaration = new RegExp(`(?:async\\s+)?function ${symbol}\\s*\\(`);
    assert.match(source, declaration, `${symbol} must live in its feature module`);
    assert.doesNotMatch(app, declaration, `${symbol} must not drift back into app.js`);
  }
}

const modules = ['app-state.js', 'user-features.js', 'library-home.js', 'reader-core.js', 'onboarding.js'];
for (const name of modules) {
  assert(index.indexOf(`src="${name}"`) < index.indexOf('src="app.js"'), `${name} must load before app.js`);
  assert(worker.includes(`'/${name}'`), `${name} must be in the PWA precache`);
}
assert(index.indexOf('src="app-state.js"') < index.indexOf('src="reader-core.js"'));
assert(app.split('\n').length < 200, 'app.js must remain a small bootstrap');
assert.match(worker, /aegis-cache-v276/);

console.log('application module extraction tests passed');
