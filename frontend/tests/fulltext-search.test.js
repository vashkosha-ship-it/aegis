'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const frontend = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(frontend, 'user-features.js'), 'utf8');

function replaceWithStaticText(document, container, text, style) {
  const node = document.createElement('div');
  node.setAttribute('data-static-style', style);
  node.textContent = text;
  container.replaceChildren(node);
}

(async () => {
  const dom = new JSDOM(`
    <div id="searchArea">
      <input id="searchInput" value="  threat model  ">
      <div id="booksContainer"></div>
    </div>
  `);
  const opened = [];
  const asked = [];
  const malicious = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  const result = {
    query: '<svg onload=alert(3)>',
    total: 1,
    hits: [{
      book_id: 17,
      title: `Book ${malicious}`,
      author: `Author ${malicious}`,
      matched_in: 'both',
      has_cover: false,
      pages: [{ page: 42, snippet: `<b>important</b> ${malicious}` }],
    }],
  };
  const context = {
    document: dom.window.document,
    api: {
      library: { searchBooks: async (query, limit) => {
        assert.equal(query, 'threat model');
        assert.equal(limit, 20);
        return result;
      } },
      books: { coverUrl: id => `/covers/${id}` },
    },
    replaceWithStaticText: (container, text, style) => replaceWithStaticText(dom.window.document, container, text, style),
    showToast: () => {},
    console,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  context.openBookDetail = id => opened.push(id);
  context.askAiAboutSnippet = (...args) => asked.push(args);

  await context.runFullTextSearch();
  const panel = dom.window.document.getElementById('fullTextResults');
  assert.ok(panel);
  assert.match(panel.textContent, /Book <img src=x/);
  assert.match(panel.textContent, /important <img src=x/);
  assert.equal(panel.querySelector('script, svg, img'), null);
  assert.equal(panel.querySelector('[data-onclick]'), null);

  const card = panel.querySelector('[data-static-style="a116"]');
  const askButton = panel.querySelector('[data-static-style="a124"]');
  card.click();
  askButton.click();
  assert.deepEqual(opened, [17]);
  assert.deepEqual(asked, [[17, 42, `important ${malicious}`, `Book ${malicious}`]]);

  context.renderFullTextResults({ query: malicious, total: 0, hits: [] });
  assert.match(panel.textContent, /Поиск: «<img src=x/);
  assert.equal(panel.querySelector('script, img'), null);
  context.renderHome = () => {};
  panel.querySelector('button').click();
  assert.equal(dom.window.document.getElementById('fullTextResults'), null);
  assert.equal(dom.window.document.getElementById('searchInput').value, '');

  assert.doesNotMatch(source, /panel\.innerHTML/);
  console.log('Full-text search DOM tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
