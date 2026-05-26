import type { CSSProperties } from 'react';
import type { TextAlignment, TextStylePresetId } from '../types';

export function textPresetClassName(id: TextStylePresetId, align: TextAlignment): string {
  const alignClass =
    align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';
  const base = `font-bold outline-none whitespace-pre-wrap break-words ${alignClass}`;

  switch (id) {
    case 'blackBox':
      return `${base} text-white px-4 py-2 rounded-xl bg-black/55`;
    case 'gradient':
      return `${base} bg-gradient-to-r from-pink-500 via-purple-500 to-sky-400 bg-clip-text text-transparent`;
    case 'outline':
      return `${base} text-white [paint-order:stroke_fill] [-webkit-text-stroke:1.5px_rgba(0,0,0,0.85)]`;
    case 'neon':
      return `${base} text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.95)]`;
    case 'classic':
    default:
      return `${base} text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]`;
  }
}

export function textPresetStyle(fontSizePx: number): CSSProperties {
  return {
    fontSize: fontSizePx,
    lineHeight: 1.25,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    caretColor: '#ffffff',
  };
}

/** WYSIWYG classes in contentEditable (same presets as canvas DOM preview). */
export function textEditPresetClassName(id: TextStylePresetId, align: TextAlignment): string {
  return `${textPresetClassName(id, align)} caret-white`;
}

/** Inline overrides — Tailwind stroke/gradient often fail on contentEditable. */
export function textEditPresetStyle(id: TextStylePresetId, fontSizePx: number): CSSProperties {
  const stroke = Math.max(1.5, fontSizePx * 0.04);

  switch (id) {
    case 'gradient':
      return {
        backgroundImage: 'linear-gradient(90deg, #ec4899, #a855f7, #38bdf8)',
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
    default:
      return {};
  }
}
