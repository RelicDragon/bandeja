import type { MemberThemeId } from '@/utils/mainTheme';

/**
 * Themed motion for member themes (docs/domains/premium-appearance.md → "Themed motion").
 * Classic users never reach this module: callers pass `activeMemberTheme(user)` and keep
 * today's effect when it is null.
 */

/** Particle silhouettes; each maps to one small inline SVG in `MemberParticleShape`. */
export type ParticleShape =
  | 'dust'
  | 'glint'
  | 'petal'
  | 'blossom'
  | 'sunburst'
  | 'droplet'
  | 'wildflower'
  | 'leaf'
  | 'snowflake'
  | 'bubble'
  | 'speck'
  | 'mapleLeaf'
  | 'shaving'
  | 'cog'
  | 'steam'
  | 'spark'
  | 'glitch';

/**
 * How a particle travels (CSS keyframes in memberEffects.css, transform/opacity only).
 * `fall` — out from the centre, then drifts down. `rise` — out, then floats up.
 * `twinkle` — appears in place and pulses. `flicker` — stepped on/off in place.
 * `ring` — one expanding halo from the centre.
 */
export type ParticleMotion = 'fall' | 'rise' | 'twinkle' | 'flicker' | 'ring';

export type ParticleRecipe = {
  shape: ParticleShape;
  motion: ParticleMotion;
  count: number;
  /** Base size in px (scaled 0.85–1.45× per particle). `ring` particles ignore it and span the burst. */
  size: number;
  /** Own palette (e.g. steam stays pale); defaults to the theme palette. */
  colors?: { onLight: readonly string[]; onDark: readonly string[] };
};

export type CelebrationConfig = {
  recipes: readonly ParticleRecipe[];
  /** Colours legible on light surfaces (trophy sheet in light appearance). */
  onLight: readonly string[];
  /** Colours legible on dark surfaces (dark appearance, full-screen novice overlay). */
  onDark: readonly string[];
  /** The single static glyph shown under reduced motion. */
  glyph: ParticleShape;
};

export type SpinnerKind =
  | 'goldRing'
  | 'swallow'
  | 'sunRays'
  | 'alpineSunrise'
  | 'snowflake'
  | 'bubbleRing'
  | 'woodRing'
  | 'gear'
  | 'neonDash';

/** Hard caps from the design brief: short, GPU-cheap. */
export const CELEBRATION_MAX_PARTICLES = 40;
export const CELEBRATION_MAX_MS = 1800;

export const MEMBER_CELEBRATIONS: Record<MemberThemeId, CelebrationConfig> = {
  premium: {
    recipes: [
      { shape: 'dust', motion: 'fall', count: 18, size: 5 },
      { shape: 'glint', motion: 'twinkle', count: 6, size: 14 },
    ],
    onLight: ['#b8862b', '#8a6427', '#c99a3c'],
    onDark: ['#f2d58a', '#d6b978', '#fff3cf'],
    glyph: 'glint',
  },
  spring: {
    recipes: [
      { shape: 'petal', motion: 'fall', count: 16, size: 10 },
      { shape: 'blossom', motion: 'fall', count: 6, size: 13 },
    ],
    onLight: ['#e0789d', '#ec9fbb', '#7fb98f'],
    onDark: ['#f6c1d3', '#ffe1ea', '#a8dbb5'],
    glyph: 'blossom',
  },
  summer: {
    recipes: [
      { shape: 'sunburst', motion: 'ring', count: 1, size: 0 },
      { shape: 'glint', motion: 'twinkle', count: 5, size: 13 },
      { shape: 'droplet', motion: 'fall', count: 16, size: 8 },
    ],
    onLight: ['#f2a516', '#ff7a45', '#2aa7c9'],
    onDark: ['#ffd36b', '#ffb38a', '#7fdcf0'],
    glyph: 'sunburst',
  },
  alpine: {
    recipes: [
      { shape: 'wildflower', motion: 'fall', count: 14, size: 11 },
      { shape: 'petal', motion: 'fall', count: 8, size: 8 },
      { shape: 'leaf', motion: 'fall', count: 1, size: 18, colors: { onLight: ['#4e8f4a'], onDark: ['#8fd08a'] } },
    ],
    onLight: ['#d24d7a', '#7a5bd0', '#e0a91c', '#4e8f4a'],
    onDark: ['#f19ab8', '#b8a6f5', '#ffd866', '#8fd08a'],
    glyph: 'wildflower',
  },
  nordic: {
    recipes: [
      { shape: 'snowflake', motion: 'fall', count: 14, size: 12 },
      { shape: 'dust', motion: 'fall', count: 10, size: 4 },
    ],
    onLight: ['#5b9cc7', '#24658f', '#7fb3d6'],
    onDark: ['#e9f5ff', '#9ed2ef', '#c7e6fa'],
    glyph: 'snowflake',
  },
  ocean: {
    recipes: [
      { shape: 'bubble', motion: 'rise', count: 14, size: 10 },
      { shape: 'speck', motion: 'twinkle', count: 12, size: 7 },
    ],
    onLight: ['#1f9fb0', '#16a394', '#0f6f8c'],
    onDark: ['#7ff5e6', '#5fd4ff', '#b8fff4'],
    glyph: 'bubble',
  },
  woodstone: {
    recipes: [
      { shape: 'mapleLeaf', motion: 'fall', count: 12, size: 13 },
      { shape: 'shaving', motion: 'fall', count: 10, size: 10 },
    ],
    onLight: ['#b5562a', '#c98424', '#8c3b1f', '#a8794e'],
    onDark: ['#e07b45', '#f0b34a', '#d0643a', '#d8b08a'],
    glyph: 'mapleLeaf',
  },
  steampunk: {
    recipes: [
      { shape: 'cog', motion: 'fall', count: 12, size: 12 },
      { shape: 'steam', motion: 'rise', count: 6, size: 18, colors: { onLight: ['#b3a798'], onDark: ['#e8dfd2'] } },
    ],
    onLight: ['#a8712c', '#7a4e22', '#b5653a'],
    onDark: ['#e0a84e', '#c98a3b', '#d9824f'],
    glyph: 'cog',
  },
  cyberpunk: {
    recipes: [
      { shape: 'spark', motion: 'fall', count: 16, size: 12 },
      { shape: 'glitch', motion: 'flicker', count: 8, size: 7 },
    ],
    onLight: ['#d1179f', '#0a95a8', '#7a3cff'],
    onDark: ['#ff3fd6', '#3ef2ff', '#b48cff'],
    glyph: 'spark',
  },
};

export const MEMBER_SPINNERS: Record<MemberThemeId, SpinnerKind> = {
  premium: 'goldRing',
  spring: 'swallow',
  summer: 'sunRays',
  alpine: 'alpineSunrise',
  nordic: 'snowflake',
  ocean: 'bubbleRing',
  woodstone: 'woodRing',
  steampunk: 'gear',
  cyberpunk: 'neonDash',
};

export function celebrationFor(theme: MemberThemeId | null): CelebrationConfig | null {
  return theme ? MEMBER_CELEBRATIONS[theme] : null;
}

export function spinnerFor(theme: MemberThemeId | null): SpinnerKind | null {
  return theme ? MEMBER_SPINNERS[theme] : null;
}

export type CelebrationParticle = {
  shape: ParticleShape;
  motion: ParticleMotion;
  color: string;
  size: number;
  /** End offset from the centre, px. */
  x: number;
  y: number;
  /** End rotation, deg. */
  rotate: number;
  delayMs: number;
  durationMs: number;
};

export type CelebrationSurface = 'light' | 'dark';

/** Deterministic pseudo-random in [0, 1) so the burst looks organic yet renders the same every time. */
function hash(i: number, salt: number): number {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Lays out one burst: particles spread on a ring (`radius` px, the biggest travel),
 * delays staggered, every particle finished inside `CELEBRATION_MAX_MS`.
 */
export function buildCelebrationParticles(
  config: CelebrationConfig,
  surface: CelebrationSurface,
  radius: number,
): CelebrationParticle[] {
  const themePalette = surface === 'dark' ? config.onDark : config.onLight;
  const out: CelebrationParticle[] = [];
  let n = 0;
  config.recipes.forEach((recipe, ri) => {
    const own = recipe.colors && (surface === 'dark' ? recipe.colors.onDark : recipe.colors.onLight);
    const palette = own ?? themePalette;
    for (let k = 0; k < recipe.count && out.length < CELEBRATION_MAX_PARTICLES; k++, n++) {
      const r1 = hash(n, 1);
      const r2 = hash(n, 2);
      const r3 = hash(n, 3);
      const angle = (k / recipe.count) * Math.PI * 2 + (r1 - 0.5) * 0.7 + ri * 0.5;
      const reach =
        recipe.motion === 'twinkle' || recipe.motion === 'flicker'
          ? radius * (0.35 + r2 * 0.6)
          : recipe.motion === 'ring'
            ? 0
            : radius * (0.7 + r2 * 0.3);
      const durationMs =
        recipe.motion === 'twinkle' ? 700 + r3 * 300
          : recipe.motion === 'flicker' ? 600 + r3 * 250
            : recipe.motion === 'ring' ? 900
              : 1150 + r3 * 300;
      const delayMs = Math.min(Math.round((k % 6) * 45 + r1 * 120), CELEBRATION_MAX_MS - durationMs);
      out.push({
        shape: recipe.shape,
        motion: recipe.motion,
        color: palette[n % palette.length],
        size: recipe.motion === 'ring' ? Math.round(radius * 1.2) : Math.round(recipe.size * (0.85 + r2 * 0.6)),
        x: Math.round(Math.cos(angle) * reach),
        y: Math.round(Math.sin(angle) * reach * 0.85),
        rotate: Math.round((r3 - 0.5) * 540),
        delayMs,
        durationMs: Math.round(durationMs),
      });
    }
  });
  return out;
}
