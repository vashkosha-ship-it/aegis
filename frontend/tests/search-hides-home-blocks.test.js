'use strict';

// Во время поиска на главной только результаты: рекомендации, цель по книгам
// и любимые темы не показываются, даже если перерисовываются отдельно.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8').replace(/^'use strict';/m, '');
const dom = new JSDOM(`<!doctype html><body>
  <input id="searchInput">
  <div id="sectionRecommendations" style="display:block"><div class="section-title"></div><div id="recommendationsList"></div></div>
  <div id="sectionBooksGoal" style="display:block"><div id="booksGoalWidget"></div></div>
  <div id="sectionFavCategories" style="display:block"><div id="favCategoriesChips"></div></div>
</body>`, { runScripts: 'outside-only' });
const { window } = dom;
window.eval(`
  function isHomeSearching() { return (document.getElementById('searchInput')?.value || '').trim().length > 0; }
  function getRecommendations() { throw new Error('при поиске рекомендации не считаются'); }
  function getBooksGoal() { throw new Error('при поиске цель не рисуется'); }
  function getFavCategories() { throw new Error('при поиске темы не рисуются'); }
`);
window.eval(read('home-recommendations.js'));
window.eval(read('home-books-goal.js'));
window.eval(read('favorite-categories.js'));

window.document.getElementById('searchInput').value = 'сети';
window.renderRecommendations();
window.renderBooksGoalWidget();
window.renderFavCategories();
for (const id of ['sectionRecommendations', 'sectionBooksGoal', 'sectionFavCategories']) {
  assert.equal(window.document.getElementById(id).style.display, 'none', id);
}
assert.match(read('library-home.js'), /function isHomeSearching\(\)/);
console.log('search hides home blocks: ok');
