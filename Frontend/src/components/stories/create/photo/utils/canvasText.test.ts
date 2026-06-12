import { describe, expect, it, vi } from 'vitest';
import { PHOTO_TEXT_FONT_PX, PHOTO_TEXT_MAX_WIDTH_PX } from '../constants';
import { layoutCanvasText } from './canvasText';
import { TEXT_EDIT_MAX_WIDTH_EM } from './textDisplayStyles';

const CHAR_W = 12;
const ctx = { measureText: (t: string) => ({ width: t.length * CHAR_W } as TextMetrics) };

describe('canvas text wrap ↔ edit overlay parity', () => {
  it('edit overlay max width uses the same width/font ratio as the canvas renderer', () => {
    expect(TEXT_EDIT_MAX_WIDTH_EM).toBeCloseTo(PHOTO_TEXT_MAX_WIDTH_PX / PHOTO_TEXT_FONT_PX, 10);
  });

  it('wraps words greedily within max width', () => {
    const layout = layoutCanvasText(ctx, 'aaaa bbbb cccc', PHOTO_TEXT_FONT_PX, CHAR_W * 9);
    expect(layout.lines.map((l) => l.text)).toEqual(['aaaa bbbb', 'cccc']);
    expect(layout.lines.every((l) => l.width <= CHAR_W * 9)).toBe(true);
  });

  it('breaks an overlong unbroken word like CSS break-words', () => {
    const word = 'x'.repeat(25);
    const layout = layoutCanvasText(ctx, word, PHOTO_TEXT_FONT_PX, CHAR_W * 10);
    expect(layout.lines.map((l) => l.text)).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
    expect(layout.lines.every((l) => l.width <= CHAR_W * 10)).toBe(true);
  });

  it('moves an overlong word to a fresh line before breaking it', () => {
    const layout = layoutCanvasText(ctx, `ab ${'y'.repeat(12)} cd`, PHOTO_TEXT_FONT_PX, CHAR_W * 10);
    expect(layout.lines.map((l) => l.text)).toEqual(['ab', 'y'.repeat(10), 'yy cd']);
  });

  it('never splits surrogate pairs when breaking long words', () => {
    const word = '🎾'.repeat(12);
    const layout = layoutCanvasText(ctx, word, PHOTO_TEXT_FONT_PX, CHAR_W * 5);
    for (const line of layout.lines) {
      expect(line.text.length % 2).toBe(0);
      expect([...line.text].every((c) => c === '🎾')).toBe(true);
    }
    expect(layout.lines.map((l) => l.text).join('')).toBe(word);
  });

  it('never splits surrogate pairs without Intl.Segmenter', () => {
    const intl = globalThis.Intl;
    vi.stubGlobal('Intl', { ...intl, Segmenter: undefined });
    try {
      const word = '🎾'.repeat(12);
      const layout = layoutCanvasText(ctx, word, PHOTO_TEXT_FONT_PX, CHAR_W * 5);
      for (const line of layout.lines) {
        expect(line.text.length % 2).toBe(0);
      }
      expect(layout.lines.map((l) => l.text).join('')).toBe(word);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
