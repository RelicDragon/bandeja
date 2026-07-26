import { describe, expect, it } from 'vitest';
import { STORY_CANVAS_ASPECT } from './storyCompositionViewport';
import {
  measureStoryCompositionFrame,
  storyCompositionFrameStyle,
} from './storyCompositionFrameStyle';

describe('storyCompositionFrameStyle', () => {
  it('keeps true 9:16 on tall phone stages (no CSS stretch)', () => {
    const fitted = measureStoryCompositionFrame(390, 844);
    expect(fitted.frameWidth / fitted.frameHeight).toBeCloseTo(STORY_CANVAS_ASPECT, 5);
    expect(fitted.frameHeight).toBeLessThan(844);
    expect(fitted.offsetY).toBeGreaterThan(0);

    const style = storyCompositionFrameStyle(fitted);
    expect(style.width).toBe(fitted.frameWidth);
    expect(style.height).toBe(fitted.frameHeight);
    expect(style.left).toBe(fitted.offsetX);
    expect(style.top).toBe(fitted.offsetY);
  });

  it('letterboxes wide desktop stages', () => {
    const fitted = measureStoryCompositionFrame(1200, 800);
    expect(fitted.frameWidth / fitted.frameHeight).toBeCloseTo(STORY_CANVAS_ASPECT, 5);
    expect(fitted.offsetX).toBeGreaterThan(0);
    expect(fitted.frameHeight).toBe(800);
  });

  it('never rounds the frame (export is sharp 9:16)', () => {
    const fitted = measureStoryCompositionFrame(390, 844);
    const style = storyCompositionFrameStyle(fitted);
    expect(style.borderRadius).toBe(0);
    expect(style.overflow).toBe('hidden');
  });
});
