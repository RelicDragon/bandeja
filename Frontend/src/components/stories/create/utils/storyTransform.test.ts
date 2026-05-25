import { describe, expect, it } from 'vitest';
import {
  STORY_CANVAS_HEIGHT,
  STORY_CANVAS_WIDTH,
  canvasToStagePx,
  computeCoverScale,
  defaultMediaTransform,
  snapRotation,
  stagePxToCanvas,
  transformToCss,
} from './storyTransform';

describe('canvasToStagePx / stagePxToCanvas', () => {
  it('round-trips canvas coordinates through stage pixels', () => {
    expect(canvasToStagePx(540, 960, 0.5)).toEqual({ x: 270, y: 480 });
    expect(stagePxToCanvas(270, 480, 0.5)).toEqual({ x: 540, y: 960 });
  });

  it('inverts stage pixel offsets back to canvas space', () => {
    const stage = canvasToStagePx(100, 200, 0.4);
    expect(stagePxToCanvas(stage.x, stage.y, 0.4)).toEqual({ x: 100, y: 200 });
  });
});

describe('transformToCss', () => {
  it('applies stage scale to canvas-space offsets', () => {
    const t = { x: 100, y: -40, scale: 1.35, rotation: 45 };
    expect(transformToCss(t, 0.5)).toBe('translate(50px, -20px) rotate(45deg) scale(1.35)');
    expect(transformToCss(t, 1)).toBe('translate(100px, -40px) rotate(45deg) scale(1.35)');
  });
});

describe('snapRotation', () => {
  it('snaps to 0° within 3°', () => {
    expect(snapRotation(1)).toBe(0);
    expect(snapRotation(-2)).toBe(0);
    expect(snapRotation(359)).toBe(0);
  });

  it('snaps to 90° within 3°', () => {
    expect(snapRotation(88)).toBe(90);
    expect(snapRotation(92)).toBe(90);
    expect(snapRotation(-88)).toBe(-90);
  });

  it('does not snap when beyond threshold', () => {
    expect(snapRotation(10)).toBe(10);
    expect(snapRotation(85)).toBe(85);
  });
});

describe('computeCoverScale / defaultMediaTransform', () => {
  const canvasW = STORY_CANVAS_WIDTH;
  const canvasH = STORY_CANVAS_HEIGHT;

  it('covers landscape photo on 9:16 canvas', () => {
    const scale = computeCoverScale(4000, 3000, canvasW, canvasH);
    expect(scale).toBeCloseTo(canvasH / 3000, 5);
    expect(defaultMediaTransform(4000, 3000, canvasW, canvasH)).toEqual({
      x: 0,
      y: 0,
      scale,
      rotation: 0,
    });
  });

  it('covers portrait photo on 9:16 canvas', () => {
    const scale = computeCoverScale(1080, 2400, canvasW, canvasH);
    expect(scale).toBeCloseTo(canvasW / 1080, 5);
    expect(scale * 2400).toBeGreaterThanOrEqual(canvasH);
  });

  it('covers square photo', () => {
    const scale = computeCoverScale(1000, 1000, canvasW, canvasH);
    expect(scale).toBeCloseTo(canvasH / 1000, 5);
  });

  it('covers ultra-wide panorama', () => {
    const scale = computeCoverScale(6000, 1500, canvasW, canvasH);
    expect(scale).toBeCloseTo(canvasH / 1500, 5);
  });

  it('returns scale 1 for invalid media dimensions', () => {
    expect(computeCoverScale(0, 100, canvasW, canvasH)).toBe(1);
    expect(defaultMediaTransform(0, 100, canvasW, canvasH).scale).toBe(1);
  });
});
