const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'reader-navigation.js'), 'utf8');
const calls = [];
const context = {
  isEpubMode: false,
  epubTotalPages: 8,
  epubCurrentPage: 1,
  epubRendition: { display: page => calls.push(['epub', page]) },
  pdfTotalPages: 10,
  pdfCurrentPage: 1,
  pdfDoc: {},
  navigator: { vibrate: n => calls.push(['vibrate', n]) },
  state: { currentBook: { id: 9 }, readingProgress: { 9: { currentPage: 1 } } },
  scheduleProgressSave: id => calls.push(['save', id]),
  updatePageIndicator: () => calls.push(['indicator']),
  renderAnnotations: () => calls.push(['annotations']),
  renderPdfPage: page => calls.push(['pdf', page]),
  generateDemoPdf: () => calls.push(['demo']),
};
vm.createContext(context);
vm.runInContext(source, context);

context.goToPage(99);
assert.strictEqual(context.pdfCurrentPage, 10);
assert.strictEqual(context.state.readingProgress[9].currentPage, 10);
assert.ok(calls.some(call => call[0] === 'pdf' && call[1] === 10));

context.isEpubMode = true;
context.goToPage(3);
assert.strictEqual(context.epubCurrentPage, 3);
assert.ok(calls.some(call => call[0] === 'epub' && call[1] === 2));
const before = calls.filter(call => call[0] === 'indicator').length;
context.updateSlider();
assert.strictEqual(calls.filter(call => call[0] === 'indicator').length, before + 1);

const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert.ok(!app.includes('function goToPage(pn)'));
assert.ok(!app.includes('function updateSlider()'));
console.log('reader-navigation: ok');
