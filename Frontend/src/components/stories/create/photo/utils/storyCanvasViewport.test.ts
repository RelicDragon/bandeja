import { describe, expect, it } from 'vitest';
import { STORY_CANVAS_ASPECT, fitStoryCanvasInStage } from './storyCanvasViewport';

describe('fitStoryCanvasInStage', () => {
  it('letterboxes when stage is taller than 9:16', () => {
    const v = fitStoryCanvasInStage(390, 844);
    expect(v.frameWidth).toBe(390);
    expect(v.frameHeight).toBeCloseTo(390 / STORY_CANVAS_ASPECT, 4);
    expect(v.offsetY).toBeGreaterThan(0);
    expect(v.offsetX).toBe(0);
    expect(v.frameWidth / v.frameHeight).toBeCloseTo(STORY_CANVAS_ASPECT, 5);
  });

  it('pillarboxes when stage is wider than 9:16', () => {
    const v = fitStoryCanvasInStage(844, 390);
    expect(v.frameHeight).toBe(390);
    expect(v.frameWidth).toBeCloseTo(390 * STORY_CANVAS_ASPECT, 4);
    expect(v.offsetX).toBeGreaterThan(0);
    expect(v.offsetY).toBe(0);
  });
});
