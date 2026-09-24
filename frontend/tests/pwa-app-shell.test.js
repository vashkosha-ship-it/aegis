'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(frontend, 'sw.js'), 'utf8');
const listed = new Set([...worker.matchAll(/'([^']+)'/g)].map(match => match[1]));

const scripts = [...index.matchAll(/<script[^>]+src="([^"]+)"/g)]
  .map(match => `/${match[1].replace(/^\//, '')}`);
const styles = [...index.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)]
  .map(match => `/${match[1].replace(/^\//, '')}`);
for (const resource of [...scripts, ...styles]) {
  assert.ok(listed.has(resource), `${resource} must be in the atomic app shell`);
}

assert.match(worker, /const APP_SHELL_URLS = \[\.\.\.PRECACHE_URLS\]/);
assert.match(worker, /expectedContentTypes/);
assert.match(worker, /response\.headers\.get\('content-type'\)/);
assert.match(worker, /вместо статического ресурса получен HTML/);
assert.match(worker, /trimStart\(\)/);
assert.match(worker, /await Promise\.all\([\s\S]*APP_SHELL_URLS\.map/);
assert.ok(
  worker.indexOf('const responses = await Promise.all') < worker.indexOf('caches.delete(CACHE_NAME)'),
  'cache must not change before every response is validated',
);

console.log('PWA app shell contract passed');
