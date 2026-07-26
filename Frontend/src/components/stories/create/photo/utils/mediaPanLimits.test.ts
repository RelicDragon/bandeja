import { describe, expect, it } from 'vitest';
import {
  clampMediaPan,
  clampMediaTransform,
  computeCoverScale,
  mediaPanLimits,
  mediaScaleBoundsForMedia,
} from './transform';

describe('media pan limits (cover-aware)', () => {
  it('locks pan at cover scale for matching 9:16 media', () => {
    const { coverScale } = mediaScaleBoundsForMedia(1080, 1920);
    const { maxX, maxY } = mediaPanLimits({
      mediaWidth: 1080,
      mediaHeight: 1920,
      scale: coverScale,
    });
    expect(maxX).toBe(0);
    expect(maxY).toBe(0);
  });

  it('allows pan when zoomed in', () => {
    const { coverScale } = mediaScaleBoundsForMedia(2000, 1500);
    const scale = coverScale * 2;
    const { maxX, maxY } = mediaPanLimits({
      mediaWidth: 2000,
      mediaHeight: 1500,
      scale,
    });
    expect(maxX).toBeGreaterThan(0);
    expect(maxY).toBeGreaterThan(0);
    const clamped = clampMediaPan(99999, -99999, {
      mediaWidth: 2000,
      mediaHeight: 1500,
      scale,
    });
    expect(clamped.x).toBe(maxX);
    expect(clamped.y).toBe(-maxY);
  });

  it('clampMediaTransform uses media AABB', () => {
    const cover = computeCoverScale(2000, 1500);
    const t = clampMediaTransform(
      { x: 5000, y: 0, scale: cover * 3, rotation: 0 },
      cover,
      { mediaWidth: 2000, mediaHeight: 1500 }
    );
    const { maxX } = mediaPanLimits({
      mediaWidth: 2000,
      mediaHeight: 1500,
      scale: t.scale,
    });
    expect(t.x).toBe(maxX);
  });
});
