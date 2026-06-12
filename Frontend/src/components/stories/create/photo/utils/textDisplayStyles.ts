import type { CSSProperties } from 'react';
import { PHOTO_TEXT_FONT_PX, PHOTO_TEXT_MAX_WIDTH_PX } from '../constants';
import type { TextAlignment, TextStylePresetId } from '../types';
import {
  PHOTO_TEXT_FONT_STACK,
  TEXT_BLACK_BOX_BG,
  TEXT_BLACK_BOX_PAD_X_RATIO,
  TEXT_BLACK_BOX_PAD_Y_RATIO,
  TEXT_BLACK_BOX_RADIUS_RATIO,
  TEXT_GRADIENT_STOPS,
  TEXT_NEON_FILL,
  classicTextShadowCss,
  neonTextShadowCss,
  outlineStrokeWidthPx,
} from './textStyleMetrics';

/** Canvas wraps at PHOTO_TEXT_MAX_WIDTH_PX with PHOTO_TEXT_FONT_PX font → same ratio in em. */
export const TEXT_EDIT_MAX_WIDTH_EM = PHOTO_TEXT_MAX_WIDTH_PX / PHOTO_TEXT_FONT_PX;

function textAlignClass(align: TextAlignment): string {
  if (align === 'left') return 'text-left';
  if (align === 'right') return 'text-right';
  return 'text-center';
}

export function textEditLayoutClassName(align: TextAlignment): string {
  return `font-bold outline-none whitespace-pre-wrap break-words ${textAlignClass(align)}`;
}

export function textPresetClassName(id: TextStylePresetId, align: TextAlignment): string {
  const base = textEditLayoutClassName(align);

  switch (id) {
    case 'blackBox':
      return `${base} text-white bg-black/55`;
    case 'gradient':
      return `${base} bg-gradient-to-r from-pink-500 via-purple-500 to-sky-400 bg-clip-text text-transparent`;
    case 'outline':
      return `${base} text-white [paint-order:stroke_fill]`;
    case 'neon':
      return `${base} text-cyan-300`;
    case 'classic':
    default:
      return `${base} text-white`;
  }
}

export function textPresetStyle(fontSizePx: number): CSSProperties {
  return {
    fontSize: fontSizePx,
    lineHeight: 1.25,
    fontFamily: PHOTO_TEXT_FONT_STACK,
    fontWeight: 700,
    caretColor: '#ffffff',
  };
}

/** WYSIWYG classes in contentEditable (same presets as canvas DOM preview). */
export function textEditPresetClassName(id: TextStylePresetId, align: TextAlignment): string {
  return `${textPresetClassName(id, align)} caret-white`;
}

/**
 * Inline overrides — Tailwind stroke/gradient often fail on contentEditable.
 * Metrics come from `textStyleMetrics` (shared with canvas renderer).
 */
export function textEditPresetStyle(id: TextStylePresetId, fontSizePx: number): CSSProperties {
  const stroke = outlineStrokeWidthPx(fontSizePx);

  switch (id) {
    case 'gradient':
      return {
        backgroundImage: `linear-gradient(90deg, ${TEXT_GRADIENT_STOPS.join(', ')})`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        WebkitTextFillColor: 'transparent',
        caretColor: '#ffffff',
      };
    case 'outline':
      return {
        color: '#ffffff',
        WebkitTextStroke: `${stroke}px rgba(0,0,0,0.85)`,
        WebkitTextFillColor: '#ffffff',
        paintOrder: 'stroke fill',
      };
    case 'blackBox':
      return {
        backgroundColor: TEXT_BLACK_BOX_BG,
        padding: `${TEXT_BLACK_BOX_PAD_Y_RATIO}em ${TEXT_BLACK_BOX_PAD_X_RATIO}em`,
        borderRadius: `${TEXT_BLACK_BOX_RADIUS_RATIO}em`,
      };
    case 'neon':
      return {
        color: TEXT_NEON_FILL,
        textShadow: neonTextShadowCss(),
      };
    case 'classic':
    default:
      return {
        textShadow: classicTextShadowCss(),
      };
  }
}

/** Transparent input metrics aligned to canvas bitmap preview while editing. */
export function textEditTransparentLayoutStyle(fontSizePx: number): CSSProperties {
  return {
    ...textPresetStyle(fontSizePx),
    boxSizing: 'content-box',
    maxWidth: `${TEXT_EDIT_MAX_WIDTH_EM}em`,
    color: 'transparent',
    WebkitTextFillColor: 'transparent',
    caretColor: '#ffffff',
  };
}
