/**
 * PRD 355 — the bridge between a catalogue `assetKey` and the CSS that paints it.
 *
 * Cosmetics are pure CSS (`Frontend/src/styles/collection.css`); the backend only
 * ever stores the key. An unknown key must render as *nothing* rather than a
 * broken style, so an admin can stage a catalogue row before the CSS ships.
 */
import type { GoodsKind } from '@/api/shop';

/** Frames ship as a gradient ring around any round avatar. */
export const COLLECTION_FRAME_KEYS = [
  'frame-neon',
  'frame-gold',
  'frame-aurora',
  'frame-court',
  'frame-sunset',
  'frame-mono',
] as const;

/** Name colours repaint a player's name wherever it renders. */
export const COLLECTION_NAME_COLOR_KEYS = [
  'name-coral',
  'name-mint',
  'name-violet',
  'name-ocean',
  'name-amber',
] as const;

/** Chat accents tint the viewer's own outgoing bubbles. */
export const COLLECTION_ACCENT_KEYS = [
  'accent-neon',
  'accent-sunset',
  'accent-mint',
  'accent-violet',
] as const;

const FRAME_SET = new Set<string>(COLLECTION_FRAME_KEYS);
const NAME_COLOR_SET = new Set<string>(COLLECTION_NAME_COLOR_KEYS);
const ACCENT_SET = new Set<string>(COLLECTION_ACCENT_KEYS);

/** `null` when the key has no shipped CSS — render the plain avatar. */
export function frameClass(assetKey: string | null | undefined): string | null {
  if (!assetKey || !FRAME_SET.has(assetKey)) return null;
  return `collection-frame collection-${assetKey}`;
}

export function nameColorClass(assetKey: string | null | undefined): string | null {
  if (!assetKey || !NAME_COLOR_SET.has(assetKey)) return null;
  return `collection-name collection-${assetKey}`;
}

export function chatAccentClass(assetKey: string | null | undefined): string | null {
  if (!assetKey || !ACCENT_SET.has(assetKey)) return null;
  return `collection-accent collection-${assetKey}`;
}

/** The class that paints a swatch/preview tile for any kind. */
export function previewClassForKind(kind: GoodsKind, assetKey: string): string | null {
  switch (kind) {
    case 'PROFILE_FRAME':
      return frameClass(assetKey);
    case 'NAME_COLOR':
      return nameColorClass(assetKey);
    case 'CHAT_ACCENT':
      return chatAccentClass(assetKey);
    case 'STICKER_PACK':
      return null;
  }
}

/** i18n key for a category chip. Keeps the enum out of the components. */
export function kindLabelKey(kind: GoodsKind): string {
  switch (kind) {
    case 'PROFILE_FRAME':
      return 'shop.categoryFrames';
    case 'CHAT_ACCENT':
      return 'shop.categoryChat';
    case 'STICKER_PACK':
      return 'shop.categoryStickers';
    case 'NAME_COLOR':
      return 'shop.categoryNameColors';
  }
}

/** The category chips, in the order the shop renders them. */
export const SHOP_KIND_ORDER: readonly GoodsKind[] = [
  'PROFILE_FRAME',
  'CHAT_ACCENT',
  'STICKER_PACK',
  'NAME_COLOR',
];

/**
 * Premium gold always beats an equipped name colour: membership is what the
 * gold glow signals, and a bought colour must not be able to fake it.
 */
export function resolveNameClass(options: {
  premiumVisible: boolean;
  nameColorAssetKey: string | null | undefined;
}): string | null {
  if (options.premiumVisible) return null;
  return nameColorClass(options.nameColorAssetKey);
}
