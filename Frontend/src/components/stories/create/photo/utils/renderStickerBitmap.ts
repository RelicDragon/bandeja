import { PHOTO_STICKER_FONT_PX } from '../constants';

export const STICKER_EMOJI_FONT_FAMILY =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

export type StickerBitmap = {
  image: HTMLCanvasElement;
  width: number;
  height: number;
};

const stickerBitmapCache = new Map<string, StickerBitmap>();

export function renderStickerBitmap(emoji: string): StickerBitmap {
  const cached = stickerBitmapCache.get(emoji);
  if (cached) return cached;

  const pad = 10;
  const fontSize = PHOTO_STICKER_FONT_PX;
  const font = `${fontSize}px ${STICKER_EMOJI_FONT_FAMILY}`;

  const probe = document.createElement('canvas');
  const pctx = probe.getContext('2d');
  let width = fontSize + pad * 2;
  let height = fontSize + pad * 2;
  if (pctx) {
    pctx.font = font;
    const m = pctx.measureText(emoji);
    width = Math.max(width, Math.ceil(m.width) + pad * 2);
    height = Math.max(height, Math.ceil(fontSize * 1.15) + pad * 2);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const empty = { image: canvas, width, height };
    stickerBitmapCache.set(emoji, empty);
    return empty;
  }

  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, width / 2, height / 2);

  const bitmap = { image: canvas, width, height };
  stickerBitmapCache.set(emoji, bitmap);
  return bitmap;
}
