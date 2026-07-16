/** Catalog objects live under uploads/ so existing S3 IAM allows Put/Head/Get; never under chat originals. */
export const STICKER_STORAGE_PREFIX = 'uploads/stickers/';
export const MAX_STICKERS_PER_PACK = 80;
export const MAX_OFFICIAL_PACKS = 20;
export const MAX_STICKER_FAVORITES = 100;
export const MAX_STICKER_RECENT = 40;

export const OFFICIAL_REACTIONS_PACK_SLUG = 'reactions';
export const OFFICIAL_PADEL_PACK_SLUG = 'padel';
