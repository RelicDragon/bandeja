import { describe, expect, it } from 'vitest';
import {
  clampLayerTransform,
  clampMediaTransform,
  clampMediaPan,
  computeCoverScale,
  mediaPanLimits,
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
  it('limits pan relative to scaled media AABB', () => {
    const mediaW = 2000;
    const mediaH = 1500;
    const cover = computeCoverScale(mediaW, mediaH);
    const t = clampMediaTransform(
      { x: 99999, y: -99999, scale: cover * 2, rotation: 0 },
      cover,
      { mediaWidth: mediaW, mediaHeight: mediaH }
    );
    const { maxX, maxY } = mediaPanLimits({
      mediaWidth: mediaW,
      mediaHeight: mediaH,
      scale: t.scale,
      rotation: 0,
    });
    expect(t.x).toBe(maxX);
    expect(t.y).toBe(-maxY);
    expect(t.scale).toBeGreaterThanOrEqual(mediaScaleBounds(cover).min);
  });
});

describe('clampMediaPan', () => {
  it('clamps with media context when zoomed in', () => {
    const cover = computeCoverScale(2000, 1500);
    const ctx = { mediaWidth: 2000, mediaHeight: 1500, scale: cover * 2, rotation: 0 };
    const { maxX } = mediaPanLimits(ctx);
    expect(maxX).toBeGreaterThan(0);
    expect(clampMediaPan(10, -10, ctx)).toEqual({ x: 10, y: -10 });
    expect(clampMediaPan(9000, 0, ctx).x).toBe(maxX);
  });

  it('falls back when context missing', () => {
    expect(clampMediaPan(900, 0).x).toBe(720);
  });
});

describe('mediaScaleBounds', () => {
  it('allows zooming out well below cover fit', () => {
    const cover = computeCoverScale(STORY_CANVAS_WIDTH, STORY_CANVAS_HEIGHT);
    const { min, max } = mediaScaleBounds(cover);
    expect(min).toBeLessThan(cover * 0.5);
    expect(max).toBeGreaterThan(cover);
  });
});
