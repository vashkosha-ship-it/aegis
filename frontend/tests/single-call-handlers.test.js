'use strict';

// Диспетчер data-on* вызывает ровно одну функцию из реестра. Цепочка
// «a();b()» выполняла только первую — так крестик окна индексации не
// закрывал окно. Несколько действий оформляются отдельной функцией.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '..');
const files = fs.readdirSync(frontend).filter(f => /\.(js|html)$/.test(f));
const offenders = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(frontend, file), 'utf8');
  for (const m of text.matchAll(/data-on[a-z]+="([^"]*)"/g)) {
    if (/\)\s*;\s*\S/.test(m[1]) || /^\s*[\w$]+\.[\w$.]+\s*\(/.test(m[1])) {
      offenders.push(`${file}: ${m[0]}`);
    }
  }
}
assert.deepEqual(offenders, [], 'обработчик должен быть одним вызовом функции');
console.log('single-call handler tests passed');
