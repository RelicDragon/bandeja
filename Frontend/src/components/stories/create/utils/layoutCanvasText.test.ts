import { describe, expect, it } from 'vitest';
import { STORY_TEXT_MAX_WIDTH_CANVAS_PX } from './storyCompositionLayout';
import { canvasTextLineHeight, layoutCanvasText } from './layoutCanvasText';
import { STORY_TEXT_BASE_CANVAS_PX } from './storyTextStyles';

function mockCtx(charWidth = 10) {
  return {
    measureText: (text: string) => ({ width: text.length * charWidth }),
  };
}

describe('layoutCanvasText', () => {
  it('wraps long lines at max width', () => {
    const ctx = mockCtx(8);
    const layout = layoutCanvasText(ctx, 'hello world foo bar', STORY_TEXT_BASE_CANVAS_PX, 80);
    expect(layout.lines.length).toBeGreaterThan(1);
    expect(layout.width).toBeLessThanOrEqual(80);
  });

  it('preserves explicit newlines', () => {
    const ctx = mockCtx(10);
    const layout = layoutCanvasText(ctx, 'line one\nline two', STORY_TEXT_BASE_CANVAS_PX);
    expect(layout.lines).toHaveLength(2);
    expect(layout.lines[0]?.text).toBe('line one');
    expect(layout.lines[1]?.text).toBe('line two');
  });

  it('computes height from line count', () => {
    const ctx = mockCtx(10);
    const layout = layoutCanvasText(ctx, 'a\nb\nc', STORY_TEXT_BASE_CANVAS_PX);
    const lineHeight = canvasTextLineHeight(STORY_TEXT_BASE_CANVAS_PX);
    expect(layout.lineHeight).toBe(lineHeight);
    expect(layout.height).toBe(lineHeight * 3);
  });

  it('uses STORY_TEXT_MAX_WIDTH_CANVAS_PX by default', () => {
    const ctx = mockCtx(1);
    const long = 'word '.repeat(80);
    const layout = layoutCanvasText(ctx, long, STORY_TEXT_BASE_CANVAS_PX);
    expect(layout.width).toBeLessThanOrEqual(STORY_TEXT_MAX_WIDTH_CANVAS_PX);
  });

  it('returns empty line layout for blank text', () => {
    const ctx = mockCtx(10);
    const layout = layoutCanvasText(ctx, '', STORY_TEXT_BASE_CANVAS_PX);
    expect(layout.lines).toHaveLength(1);
    expect(layout.height).toBeGreaterThan(0);
  });
});
