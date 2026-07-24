import { describe, expect, it } from 'vitest';
import {
  IDENTITY_IMAGE_VIEW_TRANSFORM,
  clampImageViewPan,
  clampImageViewScale,
  imageViewTransformCss,
  isImageViewZoomed,
  shouldDismissImageView,
  shouldSnapImageViewToFit,
  zoomImageViewAtPoint,
} from './imageViewTransform';

describe('imageViewTransform', () => {
  it('treats near-identity as not zoomed', () => {
    expect(isImageViewZoomed(IDENTITY_IMAGE_VIEW_TRANSFORM)).toBe(false);
    expect(isImageViewZoomed({ ...IDENTITY_IMAGE_VIEW_TRANSFORM, scale: 1.01 })).toBe(false);
  });

  it('treats scale, rotation, or pan as zoomed', () => {
    expect(isImageViewZoomed({ ...IDENTITY_IMAGE_VIEW_TRANSFORM, scale: 1.5 })).toBe(true);
    expect(isImageViewZoomed({ ...IDENTITY_IMAGE_VIEW_TRANSFORM, rotation: 15 })).toBe(true);
    expect(isImageViewZoomed({ ...IDENTITY_IMAGE_VIEW_TRANSFORM, x: 40, y: 0 })).toBe(true);
  });

  it('clamps scale to fit..max (no under-zoom)', () => {
    expect(clampImageViewScale(0.1)).toBe(1);
    expect(clampImageViewScale(20)).toBe(8);
    expect(clampImageViewScale(2)).toBe(2);
  });

  it('builds css transform', () => {
    expect(imageViewTransformCss({ x: 10, y: -5, scale: 2, rotation: 45 })).toBe(
      'translate3d(10px, -5px, 0) scale(2) rotate(45deg)',
    );
  });

  it('zooms toward a point', () => {
    const next = zoomImageViewAtPoint(IDENTITY_IMAGE_VIEW_TRANSFORM, 2, 100, 50);
    expect(next.scale).toBe(2);
    expect(next.x).toBe(-100);
    expect(next.y).toBe(-50);
  });

  it('clamps pan at fit scale to origin', () => {
    const next = clampImageViewPan(
      { ...IDENTITY_IMAGE_VIEW_TRANSFORM, x: 80, y: -40 },
      400,
      800,
    );
    expect(next.x).toBe(0);
    expect(next.y).toBe(0);
  });

  it('allows limited pan when zoomed', () => {
    const next = clampImageViewPan({ x: 5000, y: 0, scale: 2, rotation: 0 }, 400, 800);
    expect(next.x).toBeLessThan(5000);
    expect(next.x).toBeGreaterThan(0);
  });

  it('snaps near-fit transforms', () => {
    expect(shouldSnapImageViewToFit({ x: 5, y: 5, scale: 1.02, rotation: 3 })).toBe(true);
    expect(shouldSnapImageViewToFit({ x: 0, y: 0, scale: 2, rotation: 0 })).toBe(false);
  });

  it('dismisses only when not zoomed and past distance/velocity', () => {
    expect(shouldDismissImageView(130, 0, false)).toBe(true);
    expect(shouldDismissImageView(50, 0.9, false)).toBe(true);
    expect(shouldDismissImageView(20, 0.9, false)).toBe(false);
    expect(shouldDismissImageView(200, 1, true)).toBe(false);
    expect(shouldDismissImageView(20, 0.1, false)).toBe(false);
  });
});
