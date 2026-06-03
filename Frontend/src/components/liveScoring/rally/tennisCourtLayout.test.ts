import { describe, expect, it } from 'vitest';
import { TN_ALLEY, TN_SERVICE_FROM_NET } from './tennisCourtGeometry';
import { tnLinePaths, tnProjectFlat, TN_SCENE_VB_H, TN_SCENE_VB_W } from './tennisCourtLayout';

describe('tennisCourtLayout', () => {
  it('uses ITF proportions in flat space', () => {
    expect(TN_ALLEY).toBeCloseTo(1.37, 2);
    expect(TN_SERVICE_FROM_NET).toBe(6.4);
  });

  it('projects a wider near baseline than far baseline', () => {
    const farLeft = tnProjectFlat(0, 0);
    const farRight = tnProjectFlat(200, 0);
    const nearLeft = tnProjectFlat(0, 400);
    const nearRight = tnProjectFlat(200, 400);
    expect(nearRight.x - nearLeft.x).toBeGreaterThan(farRight.x - farLeft.x);
    expect(nearLeft.y).toBeGreaterThan(farLeft.y);
  });

  it('has a valid scene viewBox', () => {
    expect(TN_SCENE_VB_W).toBeGreaterThan(50);
    expect(TN_SCENE_VB_H).toBeGreaterThan(100);
    expect(tnLinePaths(false).length).toBeGreaterThanOrEqual(5);
    expect(tnLinePaths(true).length).toBe(5);
  });
});
