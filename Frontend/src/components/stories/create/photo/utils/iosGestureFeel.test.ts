import { describe, expect, it } from 'vitest';
import { nextDoubleTapScale, rubberband, wheelZoomFactor } from './iosGestureFeel';

describe('iosGestureFeel', () => {
  it('rubberbands past bounds', () => {
    expect(rubberband(5, 10, 20)).toBeLessThan(10);
    expect(rubberband(25, 10, 20)).toBeGreaterThan(20);
    expect(rubberband(15, 10, 20)).toBe(15);
  });

  it('wheel zoom out when scrolling down', () => {
    expect(wheelZoomFactor(40, 0)).toBeLessThan(1);
    expect(wheelZoomFactor(-40, 0)).toBeGreaterThan(1);
  });

  it('double-tap toggles cover ↔ 2x', () => {
    expect(nextDoubleTapScale(1, 1)).toBe(2);
    expect(nextDoubleTapScale(2.1, 1)).toBe(1);
  });
});
