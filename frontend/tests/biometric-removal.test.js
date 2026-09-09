'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FRONTEND = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(FRONTEND, 'app.js'), 'utf8');
const authSource = fs.readFileSync(path.join(FRONTEND, 'auth-ui.js'), 'utf8');
const ownSource = appSource + '\n' + authSource;
const workerSource = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(FRONTEND, 'styles.css'), 'utf8');
const handlersSource = fs.readFileSync(path.join(FRONTEND, 'handler-allowlist.js'), 'utf8');
const baselineSource = fs.readFileSync(path.join(FRONTEND, '..', 'tools', 'innerhtml-baseline.txt'), 'utf8');

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
  assert.doesNotMatch(ownSource, new RegExp(removedSymbol.replace('.', '\\.')));
}

assert.doesNotMatch(ownSource, /Вход по биометрии|Face ID|отпечатку пальца/i);
assert.doesNotMatch(ownSource, /id=["']biometricGate|id=["']bioUnlockBtn/);
assert.doesNotMatch(handlersSource, /biometricGateFallback|runBiometricUnlock|toggleBiometricFromSettings/);
assert.doesNotMatch(stylesSource, /data-static-style="a(?:300|301|302|303|427)"/);
assert.doesNotMatch(baselineSource, /biometricAuth|toggleBiometricFromSettings/);
assert.match(
  ownSource,
  /for \(const key of \['aegis_biometric_enabled', 'aegis_biometric_cred', 'aegis_biometric_declined'\]\)/,
);
assert.match(ownSource, /localStorage\.removeItem\(key\)/);
assert.match(
  appSource,
  /tryAutoLogin\(\)\.then\(ok => \{\s*navigateTo\(ok \? 'home' : 'auth'\);\s*\}\);/,
);
assert.match(workerSource, /aegis-cache-v[0-9]+/);

console.log('Biometric login removal tests passed');
