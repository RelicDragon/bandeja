import type { CSSProperties } from 'react';
import type { TextAlignment, TextStylePresetId } from '../types/storyEditor.types';

export const TEXT_STYLE_PRESET_IDS: TextStylePresetId[] = [
  'classic',
  'blackBox',
  'gradient',
  'outline',
  'neon',
];

export type TextStyleRender = {
  className: string;
  style?: CSSProperties;
};

export function getTextStyleRender(
  presetId: TextStylePresetId,
  align: TextAlignment,
  fontSizePx?: number
): TextStyleRender {
  const alignClass =
    align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';
  const sizeClass = fontSizePx == null ? 'text-xl' : '';
  const fontStyle: CSSProperties | undefined =
    fontSizePx != null ? { fontSize: fontSizePx } : undefined;

  switch (presetId) {
    case 'blackBox':
      return {
        className: `${alignClass} ${sizeClass} text-white font-bold px-4 py-2 rounded-xl bg-black/55`,
        style: fontStyle,
      };
    case 'gradient':
      return {
        className: `${alignClass} ${sizeClass} font-bold px-1 py-0.5 bg-gradient-to-r from-pink-500 via-purple-500 to-sky-400 bg-clip-text text-transparent`,
        style: fontStyle,
      };
    case 'outline':
      return {
        className: `${alignClass} ${sizeClass} text-white font-bold`,
        style: {
          ...fontStyle,
          WebkitTextStroke: '1.5px rgba(0,0,0,0.85)',
          paintOrder: 'stroke fill',
          textShadow: '0 2px 8px rgba(0,0,0,0.35)',
        },
      };
    case 'neon':
      return {
        className: `${alignClass} ${sizeClass} font-bold text-cyan-300`,
        style: {
          ...fontStyle,
          textShadow:
            '0 0 8px rgba(34,211,238,0.95), 0 0 18px rgba(236,72,153,0.75), 0 0 28px rgba(168,85,247,0.55)',
        },
      };
    case 'classic':
    default:
      return {
        className: `${alignClass} ${sizeClass} text-white font-bold drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]`,
        style: fontStyle,
      };
  }
}

/** Matches editor `text-xl` (~20px screen) at 1080×1920 canvas resolution. */
export const STORY_TEXT_BASE_CANVAS_PX = 60;

export function getCanvasFontSize(baseScale: number): number {
  return Math.max(28, Math.round(STORY_TEXT_BASE_CANVAS_PX * baseScale));
}

export function applyCanvasTextStyle(
  ctx: CanvasRenderingContext2D,
  presetId: TextStylePresetId,
  fontSize: number,
  align: TextAlignment
): void {
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';

  switch (presetId) {
    case 'blackBox':
      break;
    case 'gradient':
      break;
    case 'outline':
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = Math.max(2, fontSize * 0.04);
      break;
    case 'neon':
      ctx.fillStyle = '#67e8f9';
      ctx.shadowColor = 'rgba(34,211,238,0.95)';
      ctx.shadowBlur = fontSize * 0.35;
      break;
    case 'classic':
    default:
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = fontSize * 0.15;
      ctx.shadowOffsetY = fontSize * 0.06;
      break;
  }
}

export function drawCanvasTextWithPreset(
  ctx: CanvasRenderingContext2D,
  text: string,
  presetId: TextStylePresetId,
  fontSize: number,
  align: TextAlignment,
  x: number,
  y: number
): { width: number; height: number } {
  applyCanvasTextStyle(ctx, presetId, fontSize, align);
  const metrics = ctx.measureText(text);
  const width = metrics.width;
  const height = fontSize * 1.25;
  const drawX =
    align === 'left' ? x - width / 2 : align === 'right' ? x + width / 2 : x;
  const padX = presetId === 'blackBox' ? fontSize * 0.45 : 0;
  const padY = presetId === 'blackBox' ? fontSize * 0.35 : 0;

  if (presetId === 'blackBox') {
    const boxW = width + padX * 2;
    const boxH = height + padY * 2;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const rx = 12;
    const left = drawX - (align === 'center' ? boxW / 2 : align === 'left' ? 0 : boxW);
    const top = y - boxH / 2;
    ctx.beginPath();
    ctx.roundRect(left, top, boxW, boxH, rx);
    ctx.fill();
    ctx.restore();
    applyCanvasTextStyle(ctx, presetId, fontSize, align);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, drawX, y);
    return { width: boxW, height: boxH };
  }

  if (presetId === 'gradient') {
    const halfW = Math.max(width / 2, fontSize);
    const grad = ctx.createLinearGradient(drawX - halfW, y, drawX + halfW, y);
    grad.addColorStop(0, '#ec4899');
    grad.addColorStop(0.5, '#a855f7');
    grad.addColorStop(1, '#38bdf8');
    ctx.fillStyle = grad;
    ctx.fillText(text, drawX, y);
  } else if (presetId === 'outline') {
    ctx.strokeText(text, drawX, y);
    ctx.fillText(text, drawX, y);
  } else {
    ctx.fillText(text, drawX, y);
  }

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  return { width, height };
}
