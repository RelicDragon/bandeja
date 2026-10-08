#!/usr/bin/env node
// Generates the member-theme alternate app icons (docs/domains/premium-appearance.md).
//
//   node scripts/generate-theme-app-icons.mjs [--sheet <png>]
//
// Re-runnable and deterministic (seeded noise). Uses sharp from Backend/node_modules.
// Writes, per theme id in THEMES:
//   iOS      Frontend/ios/App/App/Assets.xcassets/theme_<id>.appiconset/{Contents.json,theme_<id>-1024.png}
//   Android  Frontend/android/app/src/main/res/drawable/ic_launcher_theme_<id>.png
//   Web      Frontend/public/premium/app-icons/theme_<id>.webp (in-app preview, 192px)
// plus a contact sheet (default progress-screens/app-icons-sheet.png).
//
// Crest masks come from Frontend/public/bandeja2-white-tr.png (1080px): alpha = silhouette,
// dark pixels inside it = ink lines. Obsidian Gold uses the raster gold crest.

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'Backend', 'package.json'));
const sharp = require('sharp');

const FE = path.join(ROOT, 'Frontend');
const S = 1024;
const CREST_W = 880;
const INK_SIGMA = 0.9;
const INK_GAIN = 1.45;
const sheetArg = process.argv.indexOf('--sheet');
const SHEET_PATH =
  sheetArg > 0 ? path.resolve(process.argv[sheetArg + 1]) : path.join(ROOT, 'progress-screens', 'app-icons-sheet.png');

// ---------------------------------------------------------------- math & noise

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixRgb = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const ramp = (stops, t) => {
  t = clamp(t);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [p0, c0] = stops[i - 1];
      const [p1, c1] = stops[i];
      return mixRgb(c0, c1, (t - p0) / (p1 - p0 || 1));
    }
  }
  return stops[stops.length - 1][1];
};

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise(seed) {
  const r = rng(seed);
  const perm = new Uint16Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = r();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const at = (x, y) => vals[perm[(perm[x & 255] + y) & 511] & 255];
  const noise = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    return mix(mix(at(xi, yi), at(xi + 1, yi), u), mix(at(xi, yi + 1), at(xi + 1, yi + 1), u), v);
  };
  return (x, y, octaves = 4) => {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * f + o * 17.3, y * f - o * 9.1) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  };
}

// --------------------------------------------------------------- raster helpers

/** Full-canvas opaque RGB from a per-pixel colour function. */
function paint(fn, w = S, h = S) {
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fn(x, y);
      const i = (y * w + x) * 3;
      buf[i] = clamp(c[0], 0, 255);
      buf[i + 1] = clamp(c[1], 0, 255);
      buf[i + 2] = clamp(c[2], 0, 255);
    }
  }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

/** RGBA layer: colour function over a 1-channel mask (0..255), times opacity. */
function tint(mask, w, h, color, opacity = 1) {
  const buf = Buffer.alloc(w * h * 4);
  const fixed = typeof color === 'string' ? hex(color) : null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const c = fixed ?? color(x / w, y / h);
      buf[p * 4] = c[0];
      buf[p * 4 + 1] = c[1];
      buf[p * 4 + 2] = c[2];
      buf[p * 4 + 3] = mask[p] * opacity;
    }
  }
  return sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

const blurred = (png, sigma) => sharp(png).blur(sigma).png().toBuffer();
const svg = (body, w = S, h = S) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);

/** Pads a crest-sized layer onto a transparent full canvas so it can be blurred without clipping. */
async function onCanvas(png, left, top) {
  return sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: png, left, top }])
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------- crest

async function loadCrest(width) {
  const src = path.join(FE, 'public', 'bandeja2-white-tr.png');
  const { data, info } = await sharp(src)
    .resize({ width, kernel: 'lanczos3' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const sil = Buffer.alloc(n);
  const ink = Buffer.alloc(n);
  for (let p = 0; p < n; p++) {
    const a = data[p * 4 + 3] / 255;
    // sharp hands back premultiplied RGB after resizing an RGBA image.
    const lum = a > 0 ? (data[p * 4] + data[p * 4 + 1] + data[p * 4 + 2]) / (765 * a) : 1;
    sil[p] = Math.round(a * 255);
    ink[p] = Math.round(a * smooth(0.82, 0.18, lum) * 255);
  }
  const grow = async (mask, sigma, gain) => {
    const out = await sharp(mask, { raw: { width: info.width, height: info.height, channels: 1 } })
      .blur(sigma)
      .extractChannel(0)
      .raw()
      .toBuffer();
    for (let p = 0; p < n; p++) out[p] = clamp(out[p] * gain, 0, 255);
    return out;
  };
  // Close the outline so plates never show a halo; embolden the ink a touch so it survives 60px.
  const silSoft = await grow(sil, 1.2, 1.6);
  const inkBold = await grow(ink, INK_SIGMA, INK_GAIN);
  return { w: info.width, h: info.height, sil: silSoft, ink: inkBold };
}

// ------------------------------------------------------------------ motifs

function swallowPath(cx, cy, s, rot) {
  // Stylised barn swallow: swept crescent wings, forked tail. Drawn in a 100-unit box around 0,0.
  const d =
    'M0 -6 C-8 -10 -26 -22 -50 -24 C-34 -14 -20 -6 -9 2 C-8 10 -6 18 -12 34 L-3 16 L0 22 L3 16 L12 34 C6 18 8 10 9 2 C20 -6 34 -14 50 -24 C26 -22 8 -10 0 -6 Z' +
    'M0 -6 C-3 -12 3 -12 0 -6 Z';
  return `<path d="${d}" transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s / 100})"/>`;
}

function gearPath(cx, cy, rOuter, rInner, teeth, rHole) {
  const pts = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const seq = [
      [a - step * 0.3, rInner],
      [a - step * 0.18, rOuter],
      [a + step * 0.18, rOuter],
      [a + step * 0.3, rInner],
    ];
    for (const [ang, r] of seq) pts.push(`${(cx + Math.cos(ang) * r).toFixed(1)} ${(cy + Math.sin(ang) * r).toFixed(1)}`);
  }
  const hole = `M${cx + rHole} ${cy} A${rHole} ${rHole} 0 1 0 ${cx - rHole} ${cy} A${rHole} ${rHole} 0 1 0 ${cx + rHole} ${cy} Z`;
  return `M${pts.join(' L')} Z ${hole}`;
}

function pineRow(baseY, count, minH, maxH, seed) {
  const r = rng(seed);
  let d = '';
  const span = S + 120;
  for (let i = 0; i < count; i++) {
    const x = -60 + (span / (count - 1)) * i + (r() - 0.5) * 40;
    const h = mix(minH, maxH, r());
    const w = h * 0.42;
    const top = baseY - h;
    // Three stacked tiers + trunk-free base: reads as spruce at any size.
    for (let t = 0; t < 3; t++) {
      const ty = top + (h * t) / 3.4;
      const tw = w * (0.55 + t * 0.25);
      const by = ty + h * 0.48;
      d += `M${x.toFixed(1)} ${ty.toFixed(1)} L${(x + tw / 2).toFixed(1)} ${by.toFixed(1)} L${(x - tw / 2).toFixed(1)} ${by.toFixed(1)} Z`;
    }
  }
  return d;
}


function ridgePath(baseY, amp, period, seed, sharp = 1.4) {
  const n = valueNoise(seed);
  let d = `M-10 ${S + 10} L-10 ${baseY}`;
  for (let x = -10; x <= S + 10; x += 6) {
    const r = 1 - Math.abs(n(x / period, seed * 3.1, 2) * 2 - 1);
    const y = baseY - amp * Math.pow(r, sharp);
    d += ` L${x} ${y.toFixed(1)}`;
  }
  return `${d} L${S + 10} ${S + 10} Z`;
}

function palmFrond() {
  // Rachis arcs in from the top-right corner; leaflets droop off both sides, shrinking to the tip.
  const P0 = [1110, -40];
  const P1 = [930, 40];
  const P2 = [760, 250];
  const at = (t) => [
    (1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * P1[0] + t * t * P2[0],
    (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1],
  ];
  let d = '';
  const count = 15;
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const [x, y] = at(t);
    const [x2, y2] = at(t + 0.02);
    const ang = Math.atan2(y2 - y, x2 - x);
    const len = mix(190, 70, t);
    for (const side of [-1, 1]) {
      const a = ang + side * 1.05 + 0.35;
      const tipX = x + Math.cos(a) * len;
      const tipY = y + Math.sin(a) * len + len * 0.25;
      const w = mix(16, 8, t);
      const nx = Math.cos(ang) * w;
      const ny = Math.sin(ang) * w;
      d += `M${(x - nx).toFixed(1)} ${(y - ny).toFixed(1)} Q${((x + tipX) / 2 + side * 6).toFixed(1)} ${((y + tipY) / 2 - 10).toFixed(1)} ${tipX.toFixed(1)} ${tipY.toFixed(1)} Q${((x + tipX) / 2 + nx).toFixed(1)} ${((y + tipY) / 2 + ny).toFixed(1)} ${(x + nx).toFixed(1)} ${(y + ny).toFixed(1)} Z`;
    }
  }
  const [mx, my] = at(0.5);
  const rachis = `<path d="M${P0[0]} ${P0[1]} Q${P1[0]} ${P1[1]} ${P2[0]} ${P2[1]}" stroke-width="10" stroke-linecap="round" fill="none"/>`;
  return { leaves: d, rachis, mid: [mx, my] };
}

// ------------------------------------------------------------------ themes

const vignette = (strength, color = '#000') =>
  svg(`<defs><radialGradient id="v" cx="50%" cy="46%" r="72%"><stop offset="55%" stop-color="${color}" stop-opacity="0"/><stop offset="100%" stop-color="${color}" stop-opacity="${strength}"/></radialGradient></defs><rect width="${S}" height="${S}" fill="url(#v)"/>`);

async function themePremium(crest, pos) {
  // Obsidian stone: mirror-stack the 1024x342 strip so no scaling softens the veins.
  const stone = path.join(FE, 'src', 'assets', 'premium', 'obsidian-gold-stone.webp');
  const strip = await sharp(stone).resize(S, 342).png().toBuffer();
  const flipped = await sharp(strip).flip().png().toBuffer();
  const base = await sharp({ create: { width: S, height: S, channels: 3, background: '#000' } })
    .composite([
      { input: strip, left: 0, top: 0 },
      { input: flipped, left: 0, top: 341 },
      { input: strip, left: 0, top: 682 },
    ])
    .modulate({ brightness: 0.62, saturation: 0.9 })
    .png()
    .toBuffer();
  const gold = await sharp(path.join(FE, 'public', 'premium', 'bandeja-gold-crest.png'))
    .resize({ width: crest.w, kernel: 'lanczos3' })
    .sharpen({ sigma: 0.8 })
    .png()
    .toBuffer();
  const goldMeta = await sharp(gold).metadata();
  const gTop = Math.round(S / 2 - goldMeta.height / 2 + 6);
  const shadowMask = await sharp(gold).extractChannel(3).raw().toBuffer();
  const shadow = await onCanvas(await tint(shadowMask, goldMeta.width, goldMeta.height, '#000000', 0.85), pos.left, gTop + 14);
  const halo = await onCanvas(await tint(shadowMask, goldMeta.width, goldMeta.height, '#c9973a', 0.55), pos.left, gTop);
  return [
    base,
    svg(`<defs><radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#000" stop-opacity="0.55"/><stop offset="70%" stop-color="#000" stop-opacity="0.2"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient></defs><ellipse cx="512" cy="512" rx="470" ry="330" fill="url(#g)"/>`),
    { input: await blurred(halo, 34), blend: 'screen' },
    { input: await blurred(shadow, 16) },
    { input: gold, left: pos.left, top: gTop },
    vignette(0.7),
  ];
}

async function themeSpring(crest, pos) {
  const n = valueNoise(11);
  const sky = await paint((x, y) => {
    const t = y / S;
    const c = ramp(
      [
        [0, hex('#7cc0e8')],
        [0.5, hex('#bfe1f2')],
        [0.82, hex('#f3dfe6')],
        [1, hex('#f6cfdc')],
      ],
      t + (n(x / 260, y / 260, 3) - 0.5) * 0.08,
    );
    return c;
  });
  const inkColor = (u, v) =>
    ramp(
      [
        [0, hex('#2f6b3a')],
        [0.45, hex('#3f7f45')],
        [0.72, hex('#b8436c')],
        [1, hex('#d9577f')],
      ],
      u * 0.8 + v * 0.35 - 0.05,
    );
  const plate = await tint(crest.sil, crest.w, crest.h, '#fffdf8');
  const ink = await tint(crest.ink, crest.w, crest.h, inkColor);
  const shadow = await onCanvas(await tint(crest.sil, crest.w, crest.h, '#5d8fb0', 0.55), pos.left, pos.top + 16);
  const birds = svg(
    `<g fill="#24324a">${swallowPath(250, 182, 104, -12)}${swallowPath(372, 132, 66, 8)}</g>`,
  );
  return [
    sky,
    svg(`<defs><radialGradient id="s" cx="78%" cy="8%" r="60%"><stop offset="0%" stop-color="#fff8e6" stop-opacity="0.9"/><stop offset="100%" stop-color="#fff8e6" stop-opacity="0"/></radialGradient></defs><rect width="${S}" height="${S}" fill="url(#s)"/>`),
    { input: await blurred(shadow, 22) },
    { input: plate, left: pos.left, top: pos.top },
    { input: ink, left: pos.left, top: pos.top },
    birds,
  ];
}

async function themeCyberpunk(crest, pos) {
  const H = 690; // horizon
  const n = valueNoise(23);
  const base = await paint((x, y) => {
    const t = y / S;
    let c = ramp(
      [
        [0, hex('#07041a')],
        [0.55, hex('#1c0b45')],
        [H / S, hex('#3a0f5e')],
        [1, hex('#0b0520')],
      ],
      t,
    );
    const grain = (n(x / 3, y / 3, 1) - 0.5) * 6;
    return [c[0] + grain, c[1] + grain, c[2] + grain];
  });
  // Perspective grid below the horizon.
  let lines = '';
  for (let i = -14; i <= 14; i++) {
    const xb = 512 + i * 150;
    lines += `<line x1="512" y1="${H}" x2="${xb}" y2="${S + 200}"/>`;
  }
  for (let k = 1; k <= 9; k++) {
    const y = H + (S - H) * Math.pow(k / 9, 1.9);
    lines += `<line x1="0" y1="${y.toFixed(1)}" x2="${S}" y2="${y.toFixed(1)}"/>`;
  }
  const grid = svg(
    `<defs><linearGradient id="f" x1="0" y1="${H}" x2="0" y2="${S}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ff3fb4" stop-opacity="0.15"/><stop offset="0.35" stop-color="#ff3fb4" stop-opacity="0.85"/><stop offset="1" stop-color="#ff5fc8" stop-opacity="1"/></linearGradient><clipPath id="c"><rect x="0" y="${H}" width="${S}" height="${S - H}"/></clipPath></defs><g clip-path="url(#c)" stroke="url(#f)" stroke-width="5" fill="none">${lines}</g><rect x="0" y="${H - 3}" width="${S}" height="6" fill="#ff7ad1"/>`,
  );
  const horizonGlow = svg(
    `<defs><linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff2fa8" stop-opacity="0"/><stop offset="1" stop-color="#ff2fa8" stop-opacity="0.55"/></linearGradient></defs><rect x="0" y="${H - 260}" width="${S}" height="260" fill="url(#h)"/>`,
  );
  const plate = await tint(crest.sil, crest.w, crest.h, '#140a36', 0.94);
  const neon = await tint(crest.ink, crest.w, crest.h, '#5ff6ff');
  const core = await tint(crest.ink, crest.w, crest.h, '#e6feff', 0.7);
  const neonCanvas = await onCanvas(neon, pos.left, pos.top);
  const rim = await onCanvas(await tint(crest.sil, crest.w, crest.h, '#33e6ff', 0.9), pos.left, pos.top);
  return [
    base,
    horizonGlow,
    { input: await blurred(grid, 7), blend: 'screen' },
    grid,
    { input: await blurred(rim, 14), blend: 'screen' },
    { input: plate, left: pos.left, top: pos.top },
    { input: await blurred(neonCanvas, 9), blend: 'screen' },
    { input: await blurred(neonCanvas, 3), blend: 'screen' },
    { input: neon, left: pos.left, top: pos.top },
    { input: core, left: pos.left, top: pos.top, blend: 'screen' },
    vignette(0.55, '#05020f'),
  ];
}

async function themeSteampunk(crest, pos) {
  const n = valueNoise(37);
  const brass = await paint((x, y) => {
    const dx = (x - 430) / S;
    const dy = (y - 380) / S;
    const r = Math.sqrt(dx * dx + dy * dy);
    const c = ramp(
      [
        [0, hex('#f0cf86')],
        [0.35, hex('#c9963f')],
        [0.75, hex('#8a5a22')],
        [1, hex('#5a3713')],
      ],
      r * 1.25,
    );
    const brushed = (n(x / 600, y / 1.6, 3) - 0.5) * 34 + (n(x / 40, y / 40, 2) - 0.5) * 10;
    return [c[0] + brushed, c[1] + brushed * 0.85, c[2] + brushed * 0.6];
  });
  const gear = svg(
    `<defs><radialGradient id="cu" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#c7743f"/><stop offset="1" stop-color="#6b3418"/></radialGradient></defs>` +
      `<path d="${gearPath(985, 985, 230, 196, 16, 70)}" fill="#2a160a" opacity="0.55" transform="translate(6 8)"/>` +
      `<path d="${gearPath(985, 985, 230, 196, 16, 70)}" fill="url(#cu)" fill-rule="evenodd" stroke="#3d1d0b" stroke-width="4"/>` +
      `<circle cx="985" cy="985" r="150" fill="none" stroke="#4a230d" stroke-width="6" opacity="0.6"/>`,
  );
  let rivets = '';
  const R = 452;
  const count = 28;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    const x = 512 + Math.cos(a) * R;
    const y = 512 + Math.sin(a) * R;
    rivets += `<circle cx="${(x + 3).toFixed(1)}" cy="${(y + 5).toFixed(1)}" r="15" fill="#2b1708" opacity="0.55"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" fill="url(#rv)"/>`;
  }
  const ring = svg(
    `<defs><radialGradient id="rv" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff1c4"/><stop offset="0.35" stop-color="#d9a856"/><stop offset="1" stop-color="#6b4316"/></radialGradient></defs>` +
      `<circle cx="512" cy="512" r="${R + 30}" fill="none" stroke="#3d240c" stroke-width="3" opacity="0.6"/>` +
      `<circle cx="512" cy="512" r="${R - 30}" fill="none" stroke="#fff0c0" stroke-width="2" opacity="0.35"/>` +
      `<circle cx="512" cy="512" r="${R - 32}" fill="none" stroke="#3d240c" stroke-width="3" opacity="0.5"/>` +
      rivets,
  );
  // Engraving: a light lip below each cut, the dark cut on top, a faint darker field inside.
  const field = await tint(crest.sil, crest.w, crest.h, '#6b4216', 0.32);
  const lip = await tint(crest.ink, crest.w, crest.h, '#ffe9b0', 0.75);
  const cut = await tint(crest.ink, crest.w, crest.h, '#2e1a08');
  return [
    brass,
    gear,
    ring,
    { input: field, left: pos.left, top: pos.top },
    { input: lip, left: pos.left, top: pos.top + 3 },
    { input: cut, left: pos.left, top: pos.top },
    vignette(0.45, '#1f1005'),
  ];
}

async function themeWoodstone(crest, pos) {
  const n = valueNoise(51);
  const walnut = await paint((x, y) => {
    // Flat-sawn walnut: long, slightly wandering growth lines with fine fibre streaks.
    const warp = n(x / 900, y / 260, 4) * 5 + n(x / 160, y / 60, 2) * 0.35;
    const t = y / 30 + warp + x / 2400;
    const ring = Math.pow(0.5 + 0.5 * Math.sin(t * Math.PI * 2), 3);
    const streak = (n(x / 520, y / 1.4, 2) - 0.5) * 0.4;
    const pores = n(x / 2.5, y / 9, 1) > 0.86 ? -0.12 : 0;
    const c = ramp(
      [
        [0, hex('#24150c')],
        [0.5, hex('#3f2716')],
        [1, hex('#6a442a')],
      ],
      ring * 0.65 + 0.2 + streak + pores,
    );
    return c;
  });
  const m = valueNoise(52);
  const oakColor = (u, v) => {
    const g = 0.5 + 0.5 * Math.sin((v * 22 + m(u * 6, v * 40, 3) * 3) * Math.PI);
    return mixRgb(hex('#e7c48f'), hex('#c99a5c'), g * 0.7);
  };
  const inlay = await tint(crest.sil, crest.w, crest.h, oakColor);
  const groove = await tint(crest.ink, crest.w, crest.h, '#2a170b');
  const grooveLight = await tint(crest.ink, crest.w, crest.h, '#fbe6c2', 0.45);
  const shadow = await onCanvas(await tint(crest.sil, crest.w, crest.h, '#000000', 0.85), pos.left, pos.top + 10);
  const bevel = await onCanvas(await tint(crest.sil, crest.w, crest.h, '#fff3dc', 0.5), pos.left, pos.top - 3);
  return [
    walnut,
    { input: await blurred(shadow, 12) },
    { input: await blurred(bevel, 1.5) },
    { input: inlay, left: pos.left, top: pos.top },
    { input: grooveLight, left: pos.left, top: pos.top + 2 },
    { input: groove, left: pos.left, top: pos.top },
    vignette(0.6, '#0d0704'),
  ];
}

async function themeOcean(crest, pos) {
  const n = valueNoise(61);
  const n2 = valueNoise(62);
  const water = await paint((x, y) => {
    const t = y / S;
    const c = ramp(
      [
        [0, hex('#127b80')],
        [0.38, hex('#0a3f5c')],
        [0.8, hex('#061a38')],
        [1, hex('#030c22')],
      ],
      t,
    );
    // Ridged noise = caustic web, strongest near the surface.
    const a = 1 - Math.abs(n(x / 150, y / 110, 3) - 0.5) * 2;
    const b = 1 - Math.abs(n2(x / 95 + 3, y / 80, 2) - 0.5) * 2;
    const caustic = Math.pow(a, 14) * 0.7 + Math.pow(b, 18) * 0.5;
    const k = caustic * (1 - smooth(0.05, 0.75, t)) * 70;
    return [c[0] + k * 0.75, c[1] + k, c[2] + k * 0.9];
  });
  const shafts = svg(
    `<defs><linearGradient id="l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9fff0" stop-opacity="0.16"/><stop offset="1" stop-color="#b9fff0" stop-opacity="0"/></linearGradient></defs>` +
      `<path d="M300 0 L420 0 L620 1024 L420 1024 Z M560 0 L620 0 L860 1024 L760 1024 Z" fill="url(#l)"/>`,
  );
  const plate = await tint(crest.sil, crest.w, crest.h, '#06243d', 0.88);
  const foam = await tint(crest.ink, crest.w, crest.h, '#a6f7e1');
  const foamCanvas = await onCanvas(foam, pos.left, pos.top);
  const rim = await onCanvas(await tint(crest.sil, crest.w, crest.h, '#5fe3cf', 0.6), pos.left, pos.top);
  return [
    water,
    shafts,
    { input: await blurred(rim, 18), blend: 'screen' },
    { input: plate, left: pos.left, top: pos.top },
    { input: await blurred(foamCanvas, 6), blend: 'screen' },
    { input: foam, left: pos.left, top: pos.top },
    vignette(0.55, '#020814'),
  ];
}

async function themeNordic(crest, pos) {
  const n = valueNoise(71);
  const sky = await paint((x, y) => {
    const t = y / S;
    const c = ramp(
      [
        [0, hex('#8dbfe2')],
        [0.45, hex('#c9e2f2')],
        [0.8, hex('#eef6fc')],
        [1, hex('#ffffff')],
      ],
      t + (n(x / 300, y / 200, 3) - 0.5) * 0.06,
    );
    return c;
  });
  const back = pineRow(985, 15, 170, 260, 7);
  const front = pineRow(1060, 11, 230, 330, 9);
  const pines = svg(
    `<path d="${back}" fill="#7f9fb4" opacity="0.75"/>` +
      `<rect x="0" y="975" width="${S}" height="60" fill="#7f9fb4" opacity="0.75"/>` +
      `<path d="${front}" fill="#1d3a4c"/>` +
      `<rect x="0" y="1040" width="${S}" height="40" fill="#1d3a4c"/>`,
  );
  const glacier = (u, v) => mixRgb(hex('#1d5f8e'), hex('#123f66'), clamp(v * 1.1));
  const plate = await tint(crest.sil, crest.w, crest.h, '#ffffff');
  const ink = await tint(crest.ink, crest.w, crest.h, glacier);
  const shadow = await onCanvas(await tint(crest.sil, crest.w, crest.h, '#4f7fa3', 0.5), pos.left, pos.top + 16);
  return [
    sky,
    pines,
    { input: await blurred(shadow, 20) },
    { input: plate, left: pos.left, top: pos.top },
    { input: ink, left: pos.left, top: pos.top },
  ];
}

async function themeAlpine(crest, pos) {
  const n = valueNoise(81);
  const sky = await paint((x, y) => {
    const t = y / S;
    const c = ramp(
      [
        [0, hex('#7fa6cf')],
        [0.3, hex('#c9b8b0')],
        [0.5, hex('#f4c38a')],
        [0.66, hex('#fbd98f')],
        [1, hex('#f7c674')],
      ],
      t + (n(x / 300, y / 120, 3) - 0.5) * 0.05,
    );
    return c;
  });
  const sun = svg(
    `<defs><radialGradient id="sun" cx="72%" cy="58%" r="38%"><stop offset="0" stop-color="#fff6d8" stop-opacity="0.95"/><stop offset="0.25" stop-color="#ffe2a0" stop-opacity="0.55"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient></defs><rect width="${S}" height="${S}" fill="url(#sun)"/>`,
  );
  const lakeTop = 812;
  const land = svg(
    `<path d="${ridgePath(730, 290, 210, 4, 2.2)}" fill="#d39c80" opacity="0.8"/>` +
      `<path d="${ridgePath(800, 190, 130, 6, 1.8)}" fill="#8e5e4d"/>` +
      `<defs><linearGradient id="lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe3a6"/><stop offset="1" stop-color="#d9a066"/></linearGradient></defs>` +
      `<rect x="0" y="${lakeTop}" width="${S}" height="70" fill="url(#lake)"/>` +
      `<g stroke="#fff4d6" stroke-linecap="round" opacity="0.8"><line x1="610" y1="${lakeTop + 14}" x2="820" y2="${lakeTop + 14}" stroke-width="4"/><line x1="660" y1="${lakeTop + 30}" x2="780" y2="${lakeTop + 30}" stroke-width="3"/><line x1="560" y1="${lakeTop + 46}" x2="700" y2="${lakeTop + 46}" stroke-width="2"/></g>` +
      `<path d="${ridgePath(930, 30, 220, 9, 1)}" fill="#3f4a2c"/>` +
      `<path d="${pineRow(1070, 12, 150, 230, 12)}" fill="#1f3326"/>` +
      `<rect x="0" y="1040" width="${S}" height="40" fill="#1f3326"/>`,
  );
  const plate = await tint(crest.sil, crest.w, crest.h, '#fff3dc');
  const amber = (u, v) => ramp([[0, hex('#7a3a0c')], [0.6, hex('#a8520f')], [1, hex('#c4650f')]], v * 0.7 + u * 0.4);
  const ink = await tint(crest.ink, crest.w, crest.h, amber);
  const glow = await onCanvas(await tint(crest.sil, crest.w, crest.h, '#ffcf73', 0.9), pos.left, pos.top);
  const shadow = await onCanvas(await tint(crest.sil, crest.w, crest.h, '#7a4a3a', 0.5), pos.left, pos.top + 14);
  return [
    sky,
    sun,
    land,
    { input: await blurred(glow, 26), blend: 'screen' },
    { input: await blurred(shadow, 16) },
    { input: plate, left: pos.left, top: pos.top },
    { input: ink, left: pos.left, top: pos.top },
  ];
}

async function themeSummer(crest, pos) {
  const n = valueNoise(91);
  const H = 640;
  const SAND = 838;
  const scene = await paint((x, y) => {
    if (y < H) {
      return ramp([[0, hex('#1679c9')], [0.6, hex('#2fa6dc')], [1, hex('#6fd3e6')]], y / H);
    }
    if (y < SAND) {
      const t = (y - H) / (SAND - H);
      const c = ramp([[0, hex('#0f8fb3')], [0.55, hex('#19b8c2')], [1, hex('#5fe0d0')]], t);
      const glint = Math.pow(n(x / 18, y / 3.5, 2), 7) * 180 * (1 - t * 0.6);
      return [c[0] + glint, c[1] + glint, c[2] + glint];
    }
    const t = (y - SAND) / (S - SAND);
    const c = ramp([[0, hex('#f7e2b4')], [1, hex('#e9c486')]], t);
    const grain = (n(x / 1.6, y / 1.6, 1) - 0.5) * 18;
    return [c[0] + grain, c[1] + grain, c[2] + grain * 0.8];
  });
  const shore = svg(
    `<path d="M0 ${SAND - 6} C180 ${SAND + 10} 340 ${SAND - 16} 520 ${SAND - 2} S860 ${SAND + 12} ${S} ${SAND - 8}" stroke="#ffffff" stroke-width="9" fill="none" stroke-linecap="round" opacity="0.9"/>` +
      `<rect x="0" y="${H - 1}" width="${S}" height="3" fill="#bff3ff" opacity="0.7"/>` +
      `<defs><radialGradient id="sun" cx="22%" cy="14%" r="40%"><stop offset="0" stop-color="#fff8d6" stop-opacity="0.9"/><stop offset="1" stop-color="#fff8d6" stop-opacity="0"/></radialGradient></defs><rect width="${S}" height="${H}" fill="url(#sun)"/>`,
  );
  const frond = palmFrond();
  const palm = svg(
    `<g fill="#0c5446" stroke="#0c5446" opacity="0.28" transform="translate(10 16)"><path d="${frond.leaves}"/>${frond.rachis}</g>` +
      `<g fill="#0e6b52" stroke="#0b5a45"><path d="${frond.leaves}"/>${frond.rachis}</g>`,
  );
  const plate = await tint(crest.sil, crest.w, crest.h, '#fffaf0');
  const orange = (u, v) => ramp([[0, hex('#ff8a1e')], [0.55, hex('#f2661a')], [1, hex('#d9441a')]], u * 0.7 + v * 0.4);
  const ink = await tint(crest.ink, crest.w, crest.h, orange);
  const shadow = await onCanvas(await tint(crest.sil, crest.w, crest.h, '#0a4f7a', 0.5), pos.left, pos.top + 16);
  return [
    scene,
    shore,
    { input: await blurred(shadow, 18) },
    { input: plate, left: pos.left, top: pos.top },
    { input: ink, left: pos.left, top: pos.top },
    palm,
  ];
}

const THEMES = [
  { id: 'premium', name: 'Obsidian Gold', build: themePremium, dy: 0 },
  { id: 'spring', name: 'Spring Meadow', build: themeSpring, dy: 30 },
  { id: 'cyberpunk', name: 'Neon District', build: themeCyberpunk, dy: -60 },
  { id: 'steampunk', name: 'Brass Works', build: themeSteampunk, dy: 0 },
  { id: 'woodstone', name: 'Wood & Stone', build: themeWoodstone, dy: 0 },
  { id: 'ocean', name: 'Deep Tide', build: themeOcean, dy: 0 },
  { id: 'nordic', name: 'Nordic Frost', build: themeNordic, dy: -50 },
  { id: 'alpine', name: 'Alpine Valley', build: themeAlpine, dy: -80 },
  { id: 'summer', name: 'Summer Coast', build: themeSummer, dy: -10 },
];

// ------------------------------------------------------------------- output

const APPICONSET_CONTENTS = (file) =>
  `${JSON.stringify(
    {
      images: [{ filename: file, idiom: 'universal', platform: 'ios', size: '1024x1024' }],
      info: { author: 'xcode', version: 1 },
    },
    null,
    2,
  )}\n`;

async function renderTheme(theme, crest) {
  const left = Math.round((S - crest.w) / 2);
  const top = Math.round((S - crest.h) / 2 + theme.dy);
  const layers = await theme.build(crest, { left, top });
  const [base, ...rest] = layers;
  const composites = rest.map((l) => (Buffer.isBuffer(l) ? { input: l } : l));
  const flat = await sharp(base).composite(composites).png().toBuffer();
  // iOS rejects alpha in app icons: flatten to opaque RGB.
  return sharp(flat).flatten({ background: '#000' }).removeAlpha().png({ compressionLevel: 9, palette: true, quality: 95, colours: 256, dither: 1, effort: 10 }).toBuffer();
}

async function main() {
  const crest = await loadCrest(CREST_W);
  const iosDir = path.join(FE, 'ios', 'App', 'App', 'Assets.xcassets');
  const drawableDir = path.join(FE, 'android', 'app', 'src', 'main', 'res', 'drawable');
  const webDir = path.join(FE, 'public', 'premium', 'app-icons');
  await mkdir(webDir, { recursive: true });
  const rendered = [];
  for (const theme of THEMES) {
    const name = `theme_${theme.id}`;
    const png = await renderTheme(theme, crest);
    const setDir = path.join(iosDir, `${name}.appiconset`);
    await mkdir(setDir, { recursive: true });
    await writeFile(path.join(setDir, `${name}-1024.png`), png);
    await writeFile(path.join(setDir, 'Contents.json'), APPICONSET_CONTENTS(`${name}-1024.png`));
    await writeFile(path.join(drawableDir, `ic_launcher_${name}.png`), png);
    await sharp(png).resize(192, 192, { kernel: 'lanczos3' }).webp({ quality: 90 }).toFile(path.join(webDir, `${name}.webp`));
    rendered.push({ theme, png });
    console.log(`wrote ${name}`);
  }
  await writeSheet(rendered);
  console.log(`sheet ${SHEET_PATH}`);
}

/** iOS-style squircle-ish mask (rounded rect, 22.37% radius). */
const roundMask = (size) =>
  svg(`<rect width="${size}" height="${size}" rx="${size * 0.2237}" ry="${size * 0.2237}" fill="#fff"/>`, size, size);

async function iconAt(png, size) {
  return sharp(png)
    .resize(size, size, { kernel: 'lanczos3' })
    .ensureAlpha()
    .composite([{ input: roundMask(size), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function writeSheet(rendered) {
  const big = 180;
  const small = 60;
  const gap = 36;
  const pad = 48;
  const cols = rendered.length;
  const width = pad * 2 + cols * big + (cols - 1) * gap;
  const half = pad / 2 + 10 + big + 16 + small + 56;
  const height = half * 2;
  const comps = [];
  let labels = '';
  for (let half = 0; half < 2; half++) {
    const bg = half === 0 ? '#f2f2f5' : '#111114';
    const fg = half === 0 ? '#3a3a40' : '#c8c8d0';
    const y0 = half === 0 ? 0 : height / 2;
    labels += `<rect x="0" y="${y0}" width="${width}" height="${height / 2}" fill="${bg}"/>`;
    for (let i = 0; i < cols; i++) {
      const x = pad + i * (big + gap);
      const yBig = y0 + pad / 2 + 10;
      comps.push({ input: await iconAt(rendered[i].png, big), left: x, top: Math.round(yBig) });
      comps.push({
        input: await iconAt(rendered[i].png, small),
        left: Math.round(x + (big - small) / 2),
        top: Math.round(yBig + big + 16),
      });
      labels += `<text x="${x + big / 2}" y="${yBig + big + small + 38}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="${fg}">${rendered[i].theme.name.replace('&', '&amp;')}</text>`;
    }
  }
  await mkdir(path.dirname(SHEET_PATH), { recursive: true });
  await sharp(svg(labels, width, height)).composite(comps).png().toFile(SHEET_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
