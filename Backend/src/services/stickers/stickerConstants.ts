/** Catalog objects live under uploads/ so existing S3 IAM allows Put/Head/Get; never under chat originals. */
export const STICKER_STORAGE_PREFIX = 'uploads/stickers/';
export const MAX_STICKERS_PER_PACK = 80;
export const MAX_PERSONAL_STICKERS = 80;
export const MAX_OFFICIAL_PACKS = 20;
export const MAX_STICKER_FAVORITES = 100;
export const MAX_STICKER_RECENT = 40;

/** Source chat image caps before normalize. */
export const PERSONAL_STICKER_MAX_SOURCE_BYTES = 8 * 1024 * 1024;
export const PERSONAL_STICKER_MIN_DIM = 64;
export const PERSONAL_STICKER_MAX_SOURCE_DIM = 2048;
export const PERSONAL_STICKER_OUTPUT_MAX_DIM = 512;

export const OFFICIAL_REACTIONS_PACK_SLUG = 'reactions';
export const OFFICIAL_PADEL_PACK_SLUG = 'padel';
export const PERSONAL_PACK_TITLE = 'My stickers';

export function personalPackSlug(userId: string): string {
  return `personal-${userId}`;
}
