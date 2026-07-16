import type { Sport } from '@prisma/client';

export type StickerManifestItem = {
  slug: string;
  emoji: string;
  title: string;
  /** Soft fill behind emoji glyph */
  bg: string;
  /** Accent ring / blob */
  accent: string;
  /** When true, generator also writes `{slug}.anim.webp` */
  animated?: boolean;
};

export type PackManifest = {
  slug: string;
  title: string;
  sport: Sport | null;
  sortOrder: number;
  coverSlug: string;
  stickers: StickerManifestItem[];
};

/** Official packs — source of truth for generate + seed. */
export const OFFICIAL_PACK_MANIFESTS: PackManifest[] = [
  {
    slug: 'reactions',
    title: 'Reactions',
    sport: null,
    sortOrder: 0,
    coverSlug: 'ball',
    stickers: [
      { slug: 'ball', emoji: '🎾', title: 'Ball', bg: '#0f766e', accent: '#5eead4', animated: true },
      { slug: 'fire', emoji: '🔥', title: 'Fire', bg: '#c2410c', accent: '#fdba74' },
      { slug: 'clap', emoji: '👏', title: 'Clap', bg: '#1d4ed8', accent: '#93c5fd' },
      { slug: 'strong', emoji: '💪', title: 'Strong', bg: '#6d28d9', accent: '#c4b5fd' },
      { slug: 'lol', emoji: '😂', title: 'Lol', bg: '#a16207', accent: '#fde047', animated: true },
      { slug: 'heart', emoji: '❤️', title: 'Heart', bg: '#be123c', accent: '#fda4af' },
      { slug: 'trophy', emoji: '🏆', title: 'Trophy', bg: '#b45309', accent: '#fcd34d' },
      { slug: 'hands', emoji: '🙌', title: 'Hands up', bg: '#0e7490', accent: '#67e8f9' },
    ],
  },
  {
    slug: 'padel',
    title: 'Padel',
    sport: 'PADEL',
    sortOrder: 1,
    coverSlug: 'smash',
    stickers: [
      { slug: 'smash', emoji: '💥', title: 'Smash', bg: '#14532d', accent: '#86efac', animated: true },
      { slug: 'ace', emoji: '🎯', title: 'Ace', bg: '#1e3a8a', accent: '#93c5fd' },
      { slug: 'volley', emoji: '🤚', title: 'Volley', bg: '#4c1d95', accent: '#c4b5fd' },
      { slug: 'lob', emoji: '🌤️', title: 'Lob', bg: '#0c4a6e', accent: '#7dd3fc' },
      { slug: 'bandeja', emoji: '🍽️', title: 'Bandeja', bg: '#9a3412', accent: '#fdba74' },
      { slug: 'vibora', emoji: '🐍', title: 'Víbora', bg: '#365314', accent: '#bef264' },
      { slug: 'glass', emoji: '🪟', title: 'Glass', bg: '#164e63', accent: '#a5f3fc' },
      { slug: 'net', emoji: '🥅', title: 'Net', bg: '#1f2937', accent: '#d1d5db' },
      { slug: 'partner', emoji: '🤝', title: 'Partner', bg: '#312e81', accent: '#a5b4fc' },
      { slug: 'warmup', emoji: '🏃', title: 'Warm-up', bg: '#7c2d12', accent: '#fdba74' },
      { slug: 'matchpoint', emoji: '⚡', title: 'Match point', bg: '#854d0e', accent: '#fde047', animated: true },
      { slug: 'gg', emoji: '✨', title: 'GG', bg: '#581c87', accent: '#e9d5ff' },
      { slug: 'out', emoji: '🚫', title: 'Out', bg: '#7f1d1d', accent: '#fca5a5' },
      { slug: 'letsgo', emoji: '🚀', title: "Let's go", bg: '#134e4a', accent: '#5eead4' },
    ],
  },
];

export const STATIC_ASSET_FILENAME = (slug: string) => `${slug}.webp`;
export const ANIMATED_ASSET_FILENAME = (slug: string) => `${slug}.anim.webp`;
