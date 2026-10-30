// Android-приложение (TWA) открывается без адресной строки только если сайт
// подтверждает его через /.well-known/assetlinks.json: имя пакета должно
// совпадать с android/twa-manifest.json, а отпечаток — с ключом подписи.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const links = JSON.parse(fs.readFileSync(path.join(root, 'frontend', '.well-known', 'assetlinks.json'), 'utf8'));
const twa = JSON.parse(fs.readFileSync(path.join(root, 'android', 'twa-manifest.json'), 'utf8'));

assert.equal(links.length, 1);
const target = links[0].target;
assert.deepEqual(links[0].relation, ['delegate_permission/common.handle_all_urls']);
assert.equal(target.namespace, 'android_app');
assert.equal(target.package_name, twa.packageId);
assert.equal(twa.host, 'aegis-sec-library.ru');
assert.equal(twa.name, 'Центр знаний по кибербезопасности');
assert.ok(target.sha256_cert_fingerprints.length >= 1);
target.sha256_cert_fingerprints.forEach(fp => assert.match(fp, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/));

console.log('android assetlinks tests passed');
