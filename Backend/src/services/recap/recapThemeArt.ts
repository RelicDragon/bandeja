import { readFileSync } from 'fs';
import path from 'path';
import type { MainTheme } from '@prisma/client';

/**
 * Member-theme art for server-rendered share images (recap slides and the
 * recap card) — docs/domains/premium-appearance.md, "Share cards".
 *
 * Export-safe by construction: plain SVG primitives rasterised by sharp, no CSS
 * masks or animation, no remote fetches. Every theme uses its *dark* chrome
 * palette (light themes their dusk/night scene) so white type stays AA on the
 * whole canvas. Art sits at the edges and the bottom band; the text band in the
 * middle is left calm.
 *
 * The crest bitmaps in `Backend/assets/premium/` are 360 px PNG copies of
 * `Frontend/public/premium/bandeja-crest-{lines,silhouette}.webp` and
 * `bandeja-gold-crest.webp` (sharp `resize(360).png()`).
 */

export type ShareThemeId = Exclude<MainTheme, 'classic'>;

type Scene = (w: number, h: number) => string;

type ShareThemeArt = {
  /** Background stops, top → bottom. */
  sky: [string, string, string];
  glow: string;
  frame: string;
  ornament: string;
  crestFill: [string, string, string];
  crestPlate: string;
  scene: Scene;
};

const n = (value: number): string => (Math.round(value * 10) / 10).toString();

function wave(w: number, y: number, amp: number, period: number, phase = 0): string {
  let d = `M${n(-phase)} ${n(y)}`;
  let i = 0;
  for (let x = -phase; x < w; x += period / 2, i += 1) {
    const dir = i % 2 === 0 ? -1 : 1;
    d += ` Q${n(x + period / 4)} ${n(y + dir * amp * 2)} ${n(x + period / 2)} ${n(y)}`;
  }
  return d;
}

function dots(points: Array<[number, number, number]>, w: number, h: number, fill: string, opacity: number): string {
  return points
    .map(([x, y, r]) => `<circle cx="${n(x * w)}" cy="${n(y * h)}" r="${r}" fill="${fill}" opacity="${opacity}"/>`)
    .join('');
}

function gear(cx: number, cy: number, r: number, teeth: number): string {
  const outer = r;
  const inner = r * 0.84;
  let d = '';
  for (let i = 0; i < teeth * 2; i += 1) {
    const a0 = (Math.PI * i) / teeth;
    const a1 = (Math.PI * (i + 1)) / teeth;
    const rr = i % 2 === 0 ? outer : inner;
    const p0 = `${n(cx + rr * Math.cos(a0))} ${n(cy + rr * Math.sin(a0))}`;
    const p1 = `${n(cx + rr * Math.cos(a1))} ${n(cy + rr * Math.sin(a1))}`;
    d += `${i === 0 ? 'M' : 'L'}${p0} L${p1} `;
  }
  return `${d}Z M${n(cx + r * 0.32)} ${n(cy)} A${n(r * 0.32)} ${n(r * 0.32)} 0 1 0 ${n(cx - r * 0.32)} ${n(cy)} A${n(r * 0.32)} ${n(r * 0.32)} 0 1 0 ${n(cx + r * 0.32)} ${n(cy)} Z`;
}

const STARS: Array<[number, number, number]> = [
  [0.12, 0.06, 2.2], [0.27, 0.13, 1.6], [0.44, 0.05, 2], [0.63, 0.11, 1.4], [0.8, 0.07, 2.4],
  [0.9, 0.17, 1.5], [0.07, 0.2, 1.3], [0.36, 0.21, 1.2], [0.71, 0.24, 1.3],
];

const SHARE_THEME_ART: Record<ShareThemeId, ShareThemeArt> = {
  premium: {
    sky: ['#281d0f', '#140f08', '#0c0906'],
    glow: '#c28a3a',
    frame: '#dbb565',
    ornament: '#f3d38d',
    crestFill: ['#fff0c4', '#dbb565', '#a9803b'],
    crestPlate: '#15120d',
    scene: (w, h) => {
      const lines: string[] = [];
      for (let i = -6; i < 14; i += 1) {
        const x = (i * w) / 7;
        lines.push(`<path d="M${n(x)} 0 L${n(x + h * 0.4)} ${h}" stroke="#e7c87b" stroke-width="2" opacity="0.05"/>`);
      }
      return `${lines.join('')}<rect y="${n(h * 0.86)}" width="${w}" height="${n(h * 0.14)}" fill="#000" opacity="0.25"/>`;
    },
  },
  spring: {
    sky: ['#123039', '#1a2742', '#272640'],
    glow: '#e6a1b3',
    frame: '#a9d98a',
    ornament: '#e7a9bb',
    crestFill: ['#d8f0c4', '#a9d98a', '#e7a9bb'],
    crestPlate: '#0f1f2a',
    scene: (w, h) => {
      const swallow = (x: number, y: number, s: number) =>
        `<path transform="translate(${n(x)} ${n(y)}) scale(${s})" d="M0 4Q6 0 12 6Q18 0 24 4Q18 3 12 9Q6 3 0 4Z" fill="#0b1a1f" opacity="0.75"/>`;
      return `${dots([[0.18, 0.7, 4], [0.32, 0.64, 3], [0.74, 0.69, 3.5], [0.86, 0.62, 2.5], [0.55, 0.73, 3]], w, h, '#ffd97a', 0.55)}
  ${swallow(w * 0.68, h * 0.14, 3.2)}${swallow(w * 0.78, h * 0.1, 2.2)}
  <path d="M0 ${n(h * 0.8)} Q${n(w * 0.33)} ${n(h * 0.72)} ${n(w * 0.65)} ${n(h * 0.79)} T${w} ${n(h * 0.76)} V${h} H0Z" fill="#153430"/>
  <path d="M0 ${n(h * 0.88)} Q${n(w * 0.25)} ${n(h * 0.83)} ${n(w * 0.5)} ${n(h * 0.87)} T${w} ${n(h * 0.85)} V${h} H0Z" fill="#0b1f1f"/>`;
    },
  },
  summer: {
    sky: ['#071a2e', '#0c2a3e', '#1d2a30'],
    glow: '#ffc46a',
    frame: '#6dd7da',
    ornament: '#ffa585',
    crestFill: ['#ffd29a', '#ff9b6a', '#6fe0dc'],
    crestPlate: '#081a2c',
    scene: (w, h) => `<circle cx="${n(w * 0.55)}" cy="${n(h * 0.08)}" r="${n(w * 0.09)}" fill="#f6ead2" opacity="0.08"/>
  <circle cx="${n(w * 0.55)}" cy="${n(h * 0.08)}" r="${n(w * 0.045)}" fill="#f6ead2" opacity="0.85"/>
  ${dots(STARS.slice(0, 6), w, h, '#ffffff', 0.55)}
  <rect y="${n(h * 0.78)}" width="${w}" height="${n(h * 0.22)}" fill="#0a2236"/>
  <path d="${wave(w, h * 0.8, 6, 120)}" fill="none" stroke="#6dd7da" stroke-width="3" opacity="0.25"/>
  <path d="${wave(w, h * 0.835, 5, 90, 30)}" fill="none" stroke="#6dd7da" stroke-width="2" opacity="0.16"/>
  <path d="M0 ${n(h * 0.9)} Q${n(w * 0.45)} ${n(h * 0.86)} ${w} ${n(h * 0.92)} V${h} H0Z" fill="#2a2730"/>`,
  },
  alpine: {
    sky: ['#0f1230', '#2e2550', '#7a4560'],
    glow: '#e88a6a',
    frame: '#f0c27a',
    ornament: '#a7d1b1',
    crestFill: ['#fbe0a8', '#f0c27a', '#a7d1b1'],
    crestPlate: '#1a1830',
    scene: (w, h) => `${dots(STARS, w, h, '#ffffff', 0.6)}
  <path d="M0 ${n(h * 0.8)} L${n(w * 0.14)} ${n(h * 0.71)} L${n(w * 0.27)} ${n(h * 0.76)} L${n(w * 0.45)} ${n(h * 0.64)} L${n(w * 0.62)} ${n(h * 0.74)} L${n(w * 0.78)} ${n(h * 0.67)} L${w} ${n(h * 0.77)} V${h} H0Z" fill="#3a2f52"/>
  <path d="M${n(w * 0.41)} ${n(h * 0.665)} L${n(w * 0.45)} ${n(h * 0.64)} L${n(w * 0.49)} ${n(h * 0.664)} L${n(w * 0.46)} ${n(h * 0.659)}Z" fill="#e9c9c0" opacity="0.55"/>
  <path d="M${n(w * 0.745)} ${n(h * 0.69)} L${n(w * 0.78)} ${n(h * 0.67)} L${n(w * 0.815)} ${n(h * 0.689)}Z" fill="#e9c9c0" opacity="0.45"/>
  <path d="M0 ${n(h * 0.86)} L${n(w * 0.2)} ${n(h * 0.79)} L${n(w * 0.38)} ${n(h * 0.85)} L${n(w * 0.58)} ${n(h * 0.78)} L${n(w * 0.8)} ${n(h * 0.85)} L${w} ${n(h * 0.8)} V${h} H0Z" fill="#1c1a33"/>
  <path d="M0 ${n(h * 0.93)} Q${n(w * 0.5)} ${n(h * 0.89)} ${w} ${n(h * 0.93)} V${h} H0Z" fill="#14231e"/>`,
  },
  nordic: {
    sky: ['#0d1424', '#081020', '#0b0f1c'],
    glow: '#5ee3b3',
    frame: '#9ed2ef',
    ornament: '#5ee3b3',
    crestFill: ['#ffffff', '#d7eaf5', '#7fb8da'],
    crestPlate: '#0b1426',
    scene: (w, h) => {
      const pines: string[] = [];
      for (let i = 0; i < 14; i += 1) {
        const x = (i / 13) * w;
        const tall = h * (0.07 + ((i * 37) % 5) * 0.012);
        const base = h * 0.86;
        pines.push(`<path d="M${n(x)} ${n(base - tall)} L${n(x + tall * 0.28)} ${n(base)} L${n(x - tall * 0.28)} ${n(base)}Z" fill="#050a14"/>`);
      }
      return `<defs><filter id="aurora-blur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="${n(w * 0.03)}"/></filter></defs>
  ${dots(STARS, w, h, '#ffffff', 0.5)}
  <path d="M${n(-w * 0.1)} ${n(h * 0.3)} Q${n(w * 0.3)} ${n(h * 0.12)} ${n(w * 0.6)} ${n(h * 0.24)} T${n(w * 1.1)} ${n(h * 0.14)}" fill="none" stroke="#5ee3b3" stroke-width="${n(w * 0.07)}" opacity="0.22" filter="url(#aurora-blur)"/>
  <path d="M${n(-w * 0.1)} ${n(h * 0.24)} Q${n(w * 0.4)} ${n(h * 0.08)} ${n(w * 1.1)} ${n(h * 0.2)}" fill="none" stroke="#a48cf0" stroke-width="${n(w * 0.05)}" opacity="0.16" filter="url(#aurora-blur)"/>
  ${pines.join('')}
  <rect y="${n(h * 0.86)}" width="${w}" height="${n(h * 0.14)}" fill="#141e30"/>`;
    },
  },
  ocean: {
    sky: ['#0b1e31', '#08182a', '#061423'],
    glow: '#2dd4bf',
    frame: '#5eead4',
    ornament: '#38bdf8',
    crestFill: ['#d5fff5', '#8ff5e0', '#3cc4b3'],
    crestPlate: '#061120',
    scene: (w, h) => `${[0.18, 0.24, 0.3].map((y, i) => `<path d="${wave(w, h * y, 10 - i * 2, 260 - i * 50, i * 40)}" fill="none" stroke="#5eead4" stroke-width="3" opacity="${0.1 - i * 0.02}"/>`).join('')}
  ${dots([[0.12, 0.74, 4], [0.24, 0.81, 3], [0.41, 0.77, 2.5], [0.63, 0.83, 3.5], [0.82, 0.75, 3], [0.91, 0.86, 2.5]], w, h, '#5eead4', 0.5)}
  <path d="M0 ${n(h * 0.86)} Q${n(w * 0.25)} ${n(h * 0.82)} ${n(w * 0.5)} ${n(h * 0.86)} T${w} ${n(h * 0.85)} V${h} H0Z" fill="#04101c"/>`,
  },
  woodstone: {
    sky: ['#2a1c11', '#1d150e', '#141516'],
    glow: '#e8a95a',
    frame: '#d9be8c',
    ornament: '#b9cf93',
    crestFill: ['#fff6e4', '#ead6ae', '#b89462'],
    crestPlate: '#24160c',
    scene: (w, h) => `${[0.05, 0.1, 0.15, 0.2, 0.26, 0.32].map((y, i) => `<path d="${wave(w, h * y, 8 + (i % 3) * 4, 340 + i * 30, i * 70)}" fill="none" stroke="#e8a95a" stroke-width="2" opacity="0.07"/>`).join('')}
  <rect y="${n(h * 0.84)}" width="${w}" height="${n(h * 0.16)}" fill="#1b1d1f"/>
  <rect y="${n(h * 0.84)}" width="${w}" height="3" fill="#9bb87a" opacity="0.4"/>
  <path d="M${n(w * 0.3)} ${n(h * 0.84)} L${n(w * 0.33)} ${h} M${n(w * 0.71)} ${n(h * 0.84)} L${n(w * 0.68)} ${h}" stroke="#2b2e31" stroke-width="3"/>`,
  },
  steampunk: {
    sky: ['#2a1a0e', '#1c140c', '#120c07'],
    glow: '#c98a4a',
    frame: '#e0a866',
    ornament: '#f0c27a',
    crestFill: ['#fde6b8', '#e3ad63', '#9b5b2b'],
    crestPlate: '#2a1a0e',
    scene: (w, h) => `<path d="${gear(w * 0.06, h * 0.9, w * 0.2, 14)}" fill="none" stroke="#e0a866" stroke-width="4" opacity="0.16" fill-rule="evenodd"/>
  <path d="${gear(w * 0.36, h * 0.95, w * 0.12, 10)}" fill="none" stroke="#e0a866" stroke-width="3" opacity="0.12" fill-rule="evenodd"/>
  <path d="${gear(w * 0.98, h * 0.46, w * 0.14, 12)}" fill="none" stroke="#e0a866" stroke-width="3" opacity="0.13" fill-rule="evenodd"/>`,
  },
  cyberpunk: {
    sky: ['#07060f', '#110a22', '#1c0b2c'],
    glow: '#ff3fd6',
    frame: '#3ef2ff',
    ornament: '#ff3fd6',
    crestFill: ['#a8fbff', '#3ef2ff', '#ff3fd6'],
    crestPlate: '#0b0918',
    scene: (w, h) => {
      const horizon = h * 0.8;
      const grid: string[] = [];
      for (let i = -8; i <= 8; i += 1) {
        grid.push(`<path d="M${n(w / 2 + i * w * 0.03)} ${n(horizon)} L${n(w / 2 + i * w * 0.2)} ${h}" stroke="#ff3fd6" stroke-width="2" opacity="0.28"/>`);
      }
      for (let j = 1; j <= 5; j += 1) {
        const y = horizon + (h - horizon) * (j / 5) ** 1.8;
        grid.push(`<path d="M0 ${n(y)} H${w}" stroke="#3ef2ff" stroke-width="2" opacity="0.22"/>`);
      }
      const towers = [[0, 0.07, 0.1], [0.08, 0.05, 0.16], [0.14, 0.08, 0.08], [0.24, 0.04, 0.13], [0.7, 0.06, 0.12], [0.77, 0.05, 0.18], [0.84, 0.08, 0.09], [0.93, 0.07, 0.14]]
        .map(([x, bw, bh]) => `<rect x="${n(x * w)}" y="${n(horizon - bh * h)}" width="${n(bw * w)}" height="${n(bh * h)}" fill="#0b0918"/>`)
        .join('');
      return `${towers}${dots([[0.03, 0.74, 3], [0.1, 0.68, 3], [0.27, 0.72, 3], [0.8, 0.66, 3], [0.88, 0.75, 3], [0.96, 0.7, 3]], w, h, '#3ef2ff', 0.6)}
  <rect y="${n(horizon)}" width="${w}" height="${n(h - horizon)}" fill="#0a0614"/>
  ${grid.join('')}
  <rect y="${n(horizon - 1)}" width="${w}" height="3" fill="#ff3fd6" opacity="0.6"/>`;
    },
  },
};

export function isShareThemeId(value: unknown): value is ShareThemeId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SHARE_THEME_ART, value);
}

/** The theme to paint for an owner, or null for the classic/gold art. */
export function shareThemeFor(owner: { memberTheme?: string | null }): ShareThemeId | null {
  return isShareThemeId(owner.memberTheme) ? owner.memberTheme : null;
}

/** Full-bleed theme backdrop: palette, glow and the theme's scene. */
export function themeBackdropSvg(theme: ShareThemeId, id: string, w: number, h: number): string {
  const art = SHARE_THEME_ART[theme];
  return `
  <defs>
    <linearGradient id="tbg-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${art.sky[0]}"/>
      <stop offset="55%" stop-color="${art.sky[1]}"/>
      <stop offset="100%" stop-color="${art.sky[2]}"/>
    </linearGradient>
    <radialGradient id="tglow-${id}" cx="50%" cy="6%" r="65%">
      <stop offset="0%" stop-color="${art.glow}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${art.glow}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#tbg-${id})"/>
  <rect width="${w}" height="${h}" fill="url(#tglow-${id})"/>
  ${art.scene(w, h)}`;
}

/** Thin double frame with a diamond motif in each corner. */
export function themeFrameSvg(theme: ShareThemeId, w: number, h: number): string {
  const art = SHARE_THEME_ART[theme];
  const m = Math.round(w * 0.04);
  const r = Math.round(w * 0.035);
  const d = Math.round(w * 0.011);
  const corners: Array<[number, number]> = [
    [m, m],
    [w - m, m],
    [m, h - m],
    [w - m, h - m],
  ];
  const diamonds = corners
    .map(
      ([x, y]) =>
        `<path d="M${x} ${y - d} L${x + d} ${y} L${x} ${y + d} L${x - d} ${y}Z" fill="${art.ornament}" opacity="0.85"/>`,
    )
    .join('');
  return `
  <rect x="${m}" y="${m}" width="${w - 2 * m}" height="${h - 2 * m}" rx="${r}" fill="none" stroke="${art.frame}" stroke-width="3" opacity="0.5"/>
  <rect x="${m + 12}" y="${m + 12}" width="${w - 2 * m - 24}" height="${h - 2 * m - 24}" rx="${Math.max(r - 10, 4)}" fill="none" stroke="${art.frame}" stroke-width="1.5" opacity="0.18"/>
  ${diamonds}`;
}

const CREST_ASPECT = 225 / 360;
const ASSET_DIR = path.join(__dirname, '../../../assets/premium');
const crestCache = new Map<string, string | null>();

function crestDataUri(name: 'lines' | 'silhouette' | 'gold'): string | null {
  if (!crestCache.has(name)) {
    try {
      const png = readFileSync(path.join(ASSET_DIR, `share-crest-${name}.png`));
      crestCache.set(name, `data:image/png;base64,${png.toString('base64')}`);
    } catch {
      // A missing asset drops the crest, never the share.
      crestCache.set(name, null);
    }
  }
  return crestCache.get(name) ?? null;
}

/** The member crest, centred on `cx`, top at `y`. Empty when the bitmaps are unavailable. */
export function themeCrestSvg(theme: ShareThemeId, id: string, cx: number, y: number, width: number): string {
  const height = Math.round(width * CREST_ASPECT);
  const x = Math.round(cx - width / 2);
  if (theme === 'premium') {
    const gold = crestDataUri('gold');
    return gold ? `<image href="${gold}" x="${x}" y="${y}" width="${width}" height="${height}"/>` : '';
  }
  const lines = crestDataUri('lines');
  const silhouette = crestDataUri('silhouette');
  if (!lines || !silhouette) return '';
  const art = SHARE_THEME_ART[theme];
  const box = `x="${x}" y="${y}" width="${width}" height="${height}"`;
  return `
  <defs>
    <mask id="csil-${id}" maskUnits="userSpaceOnUse" ${box}><image href="${silhouette}" ${box}/></mask>
    <mask id="clin-${id}" maskUnits="userSpaceOnUse" ${box}><image href="${lines}" ${box}/></mask>
    <linearGradient id="cfill-${id}" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="10%" stop-color="${art.crestFill[0]}"/>
      <stop offset="50%" stop-color="${art.crestFill[1]}"/>
      <stop offset="95%" stop-color="${art.crestFill[2]}"/>
    </linearGradient>
  </defs>
  <rect ${box} fill="${art.crestPlate}" opacity="0.85" mask="url(#csil-${id})"/>
  <rect ${box} fill="url(#cfill-${id})" mask="url(#clin-${id})"/>`;
}
