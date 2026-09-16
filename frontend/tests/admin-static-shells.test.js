'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.resolve(__dirname, '..', 'admin-screens.js'), 'utf8');
const apiSource = fs.readFileSync(path.resolve(__dirname, '..', 'api.js'), 'utf8');
const dom = new JSDOM('<div id="target"><b>old</b></div><button id="adminSaveFieldsBtn"></button><button id="adminUploadFileBtn"></button><button id="adminReindexBookBtn"></button><button id="adminDeleteFileBtn"></button><button id="adminUploadCoverBtn"></button><button id="adminDeleteCoverBtn"></button><button id="adminDeleteBookBtn"></button><button id="saveBookBtn"></button>');
const context = { document: dom.window.document, DOMParser: dom.window.DOMParser, console };
vm.createContext(context);
vm.runInContext(source, context);
const target = dom.window.document.getElementById('target');
context.replaceAdminStaticMarkup(target, '<section><button data-onclick="closeModal()">Закрыть</button></section>');
assert.equal(target.querySelectorAll('section button').length, 1);
assert.equal(target.textContent, 'Закрыть');
assert.equal(target.querySelector('b'), null);
assert.equal((source.match(/\.innerHTML\s*=/g) || []).length, 0);
assert.match(source, /replaceAdminStaticMarkup\(m,/);
assert.match(source, /replaceAdminStaticMarkup\(modal,/);
assert.match(source, /id="adminStorageAuditBtn"/);
assert.match(source, /function auditStorageUI\(\)/);
assert.match(source, /id="adminDescriptionsBtn"/);
assert.match(source, /function generateMissingDescriptionsUI\(\)/);
assert.match(source, /function refreshDescriptionGenerationStatus\(\)/);
assert.match(source, /function generateAdminBookDescription\(\)/);
assert.match(source, /api\.books\.generateDescription\(adminBookModalCurrentId\)/);
assert.match(source, /setTimeout\(refreshDescriptionGenerationStatus, 3000\)/);
assert.match(
  fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8'),
  /id="adminGenerateDescriptionBtn"/,
);
assert.doesNotMatch(source, /for \(const book of candidates\)/);
assert.doesNotMatch(source, /bulkGenerateDescriptions/);
assert.match(source, /icon: '📘'/);
assert.match(apiSource, /adminStorageAudit\(graceHours = 24\)/);
assert.match(apiSource, /adminCleanupStorage\(graceHours = 24\)/);
assert.match(apiSource, /startDescriptionGeneration\(\)/);
assert.match(apiSource, /latestDescriptionGeneration\(\)/);
assert.equal(
  context.descriptionJobSummary({ status: 'running', processed_books: 3, total_books: 8 }),
  'ИИ-описания · 3/8',
);
console.log('admin static shell tests passed');
