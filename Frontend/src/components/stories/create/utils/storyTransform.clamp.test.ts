import { describe, expect, it } from 'vitest';
import {
  clampLayerTransform,
  clampMediaTransform,
  clampMediaPan,
  computeCoverScale,
  mediaScaleBounds,
} from './storyTransform';
import { STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH } from '../types/storyEditor.types';

describe('clampLayerTransform', () => {
  it('keeps position inside canvas padding', () => {
    const t = clampLayerTransform({ x: -100, y: 9999, scale: 10, rotation: 0 });
    expect(t.x).toBeGreaterThanOrEqual(48);
    expect(t.y).toBeLessThanOrEqual(STORY_CANVAS_HEIGHT - 48);
    expect(t.scale).toBe(4);
  });
});

describe('clampMediaTransform', () => {
  it('limits pan and scale relative to cover', () => {
    const cover = computeCoverScale(2000, 1500);
    const t = clampMediaTransform({ x: 2000, y: -2000, scale: 0.01, rotation: 2 }, cover);
    expect(t.x).toBe(720);
    expect(t.y).toBe(-720);
    expect(t.scale).toBeGreaterThanOrEqual(mediaScaleBounds(cover).min);
  });
});

describe('clampMediaPan', () => {
  it('clamps extreme pan values', () => {
    expect(clampMediaPan(100, -100)).toEqual({ x: 100, y: -100 });
    expect(clampMediaPan(900, 0).x).toBe(720);
  });
});

describe('mediaScaleBounds', () => {
  it('anchors min scale near cover fit', () => {
    const cover = computeCoverScale(STORY_CANVAS_WIDTH, STORY_CANVAS_HEIGHT);
    const { min, max } = mediaScaleBounds(cover);
    expect(min).toBeCloseTo(cover * 0.85, 5);
    expect(max).toBeGreaterThan(min);
  });
});
