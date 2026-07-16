export const BANDEJA_PERSONAL_STICKER_SAVED = 'bandeja:personal-sticker-saved';

export type PersonalStickerSavedDetail = {
  stickerId: string;
  packId: string;
};

export function emitPersonalStickerSaved(detail: PersonalStickerSavedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BANDEJA_PERSONAL_STICKER_SAVED, { detail }));
}
