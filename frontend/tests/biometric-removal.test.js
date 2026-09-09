'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FRONTEND = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');

for (const removedSymbol of [
  'biometricAuth',
  'maybeOfferBiometric',
  'showBiometricGate',
  'runBiometricUnlock',
  'biometricGateFallback',
  'toggleBiometricFromSettings',
  'navigator.credentials',
  'PublicKeyCredential',
]) {
  assert.doesNotMatch(appSource, new RegExp(removedSymbol.replace('.', '\\.')));
}

assert.doesNotMatch(appSource, /Вход по биометрии|Face ID|отпечатк/i);
assert.doesNotMatch(appSource, /id=["']biometricGate|id=["']bioUnlockBtn/);
assert.match(
  appSource,
  /for \(const key of \['aegis_biometric_enabled', 'aegis_biometric_cred', 'aegis_biometric_declined'\]\)/,
);
assert.match(appSource, /localStorage\.removeItem\(key\)/);
assert.match(
  appSource,
  /tryAutoLogin\(\)\.then\(ok => \{\s*navigateTo\(ok \? 'home' : 'auth'\);\s*\}\);/,
);
assert.match(workerSource, /aegis-cache-v246/);

console.log('Biometric login removal tests passed');
