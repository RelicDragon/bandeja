import { describe, expect, it } from 'vitest';
import {
  clampMediaTransform,
  computeContainScale,
  computeCoverScale,
  mediaScaleBounds,
  mediaScaleBoundsForMedia,
} from './transform';

describe('media zoom-out bounds', () => {
  it('allows scale below cover down toward contain', () => {
    const w = 4000;
    const h = 3000;
    const cover = computeCoverScale(w, h);
    const contain = computeContainScale(w, h);
    const bounds = mediaScaleBoundsForMedia(w, h);

    expect(contain).toBeLessThan(cover);
    expect(bounds.min).toBeLessThan(cover);
    expect(bounds.min).toBeLessThanOrEqual(contain);
    expect(bounds.max).toBeGreaterThan(cover);

    const zoomedOut = clampMediaTransform(
      { x: 0, y: 0, scale: contain, rotation: 0 },
      cover,
      { minScale: bounds.min, maxScale: bounds.max, snapRotation: false }
    );
    expect(zoomedOut.scale).toBeCloseTo(contain, 5);
  });

  it('approximate bounds still allow zoom out from cover', () => {
    const cover = computeCoverScale(2000, 1500);
    const { min } = mediaScaleBounds(cover);
    expect(min).toBeLessThan(cover * 0.85);
  });
});
