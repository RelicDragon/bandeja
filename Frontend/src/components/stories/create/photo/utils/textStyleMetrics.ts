/** Shared text-style numbers — keep canvas (`canvasText`) and edit overlay CSS in sync. */

export const PHOTO_TEXT_FONT_STACK = 'system-ui, -apple-system, sans-serif';

export const TEXT_CLASSIC_FILL = '#ffffff';
export const TEXT_CLASSIC_SHADOW_COLOR = 'rgba(0,0,0,0.55)';
export const TEXT_CLASSIC_SHADOW_OFFSET_Y_RATIO = 0.06;
export const TEXT_CLASSIC_SHADOW_BLUR_RATIO = 0.15;

export const TEXT_NEON_FILL = '#67e8f9';
export const TEXT_NEON_SHADOW_COLOR = 'rgba(34,211,238,0.95)';
export const TEXT_NEON_SHADOW_BLUR_RATIO = 0.35;

export const TEXT_OUTLINE_FILL = '#ffffff';
export const TEXT_OUTLINE_STROKE_COLOR = 'rgba(0,0,0,0.85)';
export const TEXT_OUTLINE_STROKE_MIN_PX = 2;
export const TEXT_OUTLINE_STROKE_RATIO = 0.04;

export const TEXT_BLACK_BOX_FILL = '#ffffff';
export const TEXT_BLACK_BOX_BG = 'rgba(0,0,0,0.55)';
export const TEXT_BLACK_BOX_PAD_X_RATIO = 0.45;
export const TEXT_BLACK_BOX_PAD_Y_RATIO = 0.35;
export const TEXT_BLACK_BOX_RADIUS_RATIO = 0.2;

export const TEXT_GRADIENT_STOPS = ['#ec4899', '#a855f7', '#38bdf8'] as const;

export function canvasFont(fontSizePx: number): string {
  return `bold ${fontSizePx}px ${PHOTO_TEXT_FONT_STACK}`;
}

export function outlineStrokeWidthPx(fontSizePx: number): number {
  return Math.max(TEXT_OUTLINE_STROKE_MIN_PX, fontSizePx * TEXT_OUTLINE_STROKE_RATIO);
}

export function classicTextShadowCss(): string {
  return `0 ${TEXT_CLASSIC_SHADOW_OFFSET_Y_RATIO}em ${TEXT_CLASSIC_SHADOW_BLUR_RATIO}em ${TEXT_CLASSIC_SHADOW_COLOR}`;
}

export function neonTextShadowCss(): string {
  return `0 0 ${TEXT_NEON_SHADOW_BLUR_RATIO}em ${TEXT_NEON_SHADOW_COLOR}`;
}
