'use strict';

// Dynamic presentation values must not be emitted through style="...".
// Instead, add a sanitized rule to the already trusted external stylesheet
// and bind it to the element through a data attribute.
const _dynamicStyleTokens = new Map();
const _dynamicStyleRules = new Map();

function _dynamicStyleSheet() {
  const sheet = Array.from(document.styleSheets).find((candidate) => {
    const owner = candidate.ownerNode;
    if (owner && owner.hasAttribute && owner.hasAttribute('data-dynamic-stylesheet')) return true;
    try {
      return candidate.href && new URL(candidate.href, location.href).pathname.endsWith('/styles.css');
    } catch (_) {
      return false;
    }
  });
  if (!sheet) throw new Error('Dynamic stylesheet is not available');
  return sheet;
}

function _dynamicStyleHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function _normalizeDynamicDeclarations(source) {
  const declarations = [];
  for (const raw of source.split(';')) {
    const declaration = raw.trim();
    if (!declaration) continue;
    const colon = declaration.indexOf(':');
    if (colon <= 0) throw new Error('Invalid dynamic CSS declaration');
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    if (!/^-?[a-z][a-z0-9-]*$/.test(property)) throw new Error('Invalid dynamic CSS property');
    if (!value || /[{}@]/.test(value) || /url\s*\(/i.test(value)) {
      throw new Error('Unsafe dynamic CSS value');
    }
    if (typeof CSS !== 'undefined' && CSS.supports && !CSS.supports(property, value)) {
      console.warn(`Unsupported dynamic CSS ignored: ${property}`);
      continue;
    }
    declarations.push(`${property}:${value}`);
  }
  if (!declarations.length) throw new Error('Dynamic CSS declaration is empty');
  return declarations.join(';');
}

function dynamicStyleToken(strings, ...values) {
  let source = strings[0];
  for (let i = 0; i < values.length; i++) {
    const value = String(values[i]);
    const staticPrefix = strings[i];
    const lastSeparator = Math.max(staticPrefix.lastIndexOf(';'), staticPrefix.lastIndexOf('{'));
    const valueContext = staticPrefix.lastIndexOf(':') > lastSeparator;
    if (/[{}@]/.test(value) || /url\s*\(/i.test(value) || (valueContext && value.includes(';'))) {
      throw new Error('Unsafe dynamic CSS interpolation');
    }
    source += value + strings[i + 1];
  }
  const ruleBody = _normalizeDynamicDeclarations(source);
  const existing = _dynamicStyleTokens.get(ruleBody);
  if (existing) return existing;

  const base = `ds-${_dynamicStyleHash(ruleBody)}`;
  let token = base;
  let suffix = 1;
  while (_dynamicStyleRules.has(token) && _dynamicStyleRules.get(token) !== ruleBody) {
    token = `${base}-${suffix++}`;
  }

  const sheet = _dynamicStyleSheet();
  sheet.insertRule(`[data-dynamic-style="${token}"]{${ruleBody}}`, sheet.cssRules.length);
  _dynamicStyleTokens.set(ruleBody, token);
  _dynamicStyleRules.set(token, ruleBody);
  return token;
}
