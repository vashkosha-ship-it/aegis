'use strict';

const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '..', '..');

const groups = Object.freeze({
  ar: [
    'ar-schemes-data.js',
    'ar-schemes-renderers.js',
    'ar-schemes-interactions.js',
    'ar-schemes.js',
  ],
  admin: [
    'admin-screens.js',
    'admin-users.js',
    'admin-ai-operations.js',
    'admin-books.js',
    'admin-bulk-upload.js',
  ],
  account: [
    'account-settings.js',
    'account-privacy.js',
    'account-personalization.js',
    'account-profile.js',
  ],
});

function readFrontend(name) {
  return fs.readFileSync(path.join(frontend, name), 'utf8');
}

function readGroup(name) {
  if (!groups[name]) throw new Error(`Unknown frontend module group: ${name}`);
  return groups[name].map(readFrontend).join('\n');
}

module.exports = { groups, readFrontend, readGroup };
