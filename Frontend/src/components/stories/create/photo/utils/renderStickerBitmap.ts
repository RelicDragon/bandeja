import { PHOTO_STICKER_FONT_PX } from '../constants';

export const STICKER_EMOJI_FONT_FAMILY =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

export type StickerBitmap = {
  image: HTMLCanvasElement;
  width: number;
  height: number;
};

export function renderStickerBitmap(emoji: string): StickerBitmap {
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
  if (!ctx) return { image: canvas, width, height };

  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, width / 2, height / 2);

  return { image: canvas, width, height };
}
