'use strict';

// Тёмная тема PDF: внутри картинки (в том числе скана всей страницы)
// в исходных цветах остаются только иллюстрации, текст перекрашивается.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'reader-core.js'), 'utf8');
const grab = name => {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `нет функции ${name}`);
  let depth = 0;
  for (let k = src.indexOf('{', start); k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return src.slice(start, k + 1);
  }
  throw new Error(name);
};
const consts = src.match(/const DARK_TILES_PER_PAGE = \d+;\nconst DARK_TILE_PICTURE_SHARE = [\d.]+;/);
const tolerance = src.match(/const DARK_PAPER_TOLERANCE = \d+;/);
assert.ok(consts, 'константы клеток');
const sandbox = {};
vm.runInNewContext([consts[0], tolerance[0], ...['_looksLikeText', '_paperColor', '_pixelKind', '_pictureRegions', '_refineRegion'].map(grab),
  'this.pictureRegions = _pictureRegions;'].join('\n'), sandbox);

// Синтетическая «отсканированная» страница 480×680: бумага, строки текста,
// цветная иллюстрация 240×160 в (120, 100) и цветной заголовок.
function page({ photo = true } = {}) {
  const W = 480, H = 680;
  const d = new Uint8ClampedArray(W * H * 4);
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const set = (x, y, r, g, b) => { const i = (y * W + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = 232 + Math.floor(rnd() * 12);
    set(x, y, v, v, v - 2);
  }
  const textLine = (y0, color = [35, 35, 35]) => {
    for (let y = y0; y < y0 + 9; y++) for (let x = 40; x < 440; x++) {
      if ((x % 7) < 2 || (y - y0) % 4 === 0 && rnd() < 0.5) set(x, y, ...color);
      else if ((x % 7) === 2) set(x, y, 150, 150, 150); // сглаживание
    }
  };
  if (photo) {
    for (let y = 100; y < 260; y++) for (let x = 120; x < 360; x++) {
      if (y < 190) set(x, y, 160 + (y - 100) / 3, 175, 205 - (y - 100) / 4); // светлое небо
      else set(x, y, 70 + Math.floor(rnd() * 25), 125 + Math.floor(rnd() * 20), 55);
    }
  }
  for (let k = 0; k < 6; k++) textLine(280 + k * 20); // подпись и текст
  textLine(420, [200, 30, 50]); // красный заголовок
  for (let k = 0; k < 10; k++) textLine(450 + k * 20);
  const source = {
    getContext: () => ({
      getImageData: (x, y, w, h) => {
        const out = new Uint8ClampedArray(w * h * 4);
        for (let r = 0; r < h; r++) out.set(d.subarray(((y + r) * W + x) * 4, ((y + r) * W + x + w) * 4), r * w * 4);
        return { data: out };
      },
    }),
  };
  return { source, W, H };
}

{
  const { source, W, H } = page();
  const regions = sandbox.pictureRegions(source, { x: 0, y: 0, w: W, h: H }, W);
  assert.equal(regions.length, 1, JSON.stringify(regions));
  const [g] = regions;
  // Иллюстрация найдена с точностью до нескольких пикселей, текст под ней — нет.
  assert.ok(Math.abs(g.x - 120) <= 4 && Math.abs(g.y - 100) <= 4, JSON.stringify(g));
  assert.ok(Math.abs(g.x + g.w - 360) <= 4 && Math.abs(g.y + g.h - 260) <= 4, JSON.stringify(g));
}

{
  // Скан с одним текстом (и цветным заголовком) перекрашивается целиком.
  const { source, W, H } = page({ photo: false });
  assert.equal(sandbox.pictureRegions(source, { x: 0, y: 0, w: W, h: H }, W).length, 0);
}

// Рисуем через проверку, что фильтр холста реально работает (Safari).
assert.match(src, /function canvasFilterWorks\(\)/);
assert.match(src, /regions = _pictureRegions\(rendered, \{ x, y, w, h \}, width\)/);

console.log('reader-dark-regions: ok');
