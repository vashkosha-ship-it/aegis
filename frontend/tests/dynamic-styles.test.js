'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const frontend = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(frontend, 'dynamic-styles.js'), 'utf8');
const rules = [];
const sheet = {
  cssRules: rules,
  ownerNode: { hasAttribute: name => name === 'data-dynamic-stylesheet' },
  insertRule: (cssText, index) => rules.splice(index, 0, { cssText }),
};
const context = vm.createContext({
  document: { styleSheets: [sheet] },
  location: { href: 'https://example.test/' },
  URL,
  CSS: { supports: () => true },
  console,
});
vm.runInContext(source, context);

const token = vm.runInContext("dynamicStyleToken`color:#123456;width:${42}%;background:var(--accent)`", context);
const duplicate = vm.runInContext("dynamicStyleToken`color:#123456;width:${42}%;background:var(--accent)`", context);
assert.match(token, /^ds-[a-z0-9]+$/);
assert.equal(duplicate, token);
assert.equal(rules.length, 1);
assert.match(rules[0].cssText, /color:#123456/);
assert.match(rules[0].cssText, /width:42%/);

assert.throws(
  () => vm.runInContext("dynamicStyleToken`background:url(https://evil.test/x)`", context),
  /Unsafe dynamic CSS value/,
);
assert.throws(
  () => vm.runInContext("dynamicStyleToken`color:${'red;position:fixed'}`", context),
  /Unsafe dynamic CSS interpolation/,
);

const jsFiles = fs.readdirSync(frontend).filter(name => name.endsWith('.js'));
const offenders = [];
for (const name of jsFiles) {
  const text = fs.readFileSync(path.join(frontend, name), 'utf8');
  if (/\sstyle="[^"]*\$\{/.test(text)) offenders.push(name);
}
assert.deepEqual(offenders, [], `dynamic style attributes remain: ${offenders.join(', ')}`);

console.log('dynamic stylesheet tests passed');
