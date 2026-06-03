import { describe, expect, it } from 'vitest';
import { fitLiveSchematicSize } from './liveSchematicFit';

describe('fitLiveSchematicSize', () => {
  it('sizes from width when container height is not yet available', () => {
    const size = fitLiveSchematicSize(320, 0, 610, 1340, false);
    expect(size).not.toBeNull();
    expect(size!.courtW).toBeGreaterThan(0);
    expect(size!.courtH).toBeGreaterThan(0);
    expect(size!.courtW / size!.courtH).toBeCloseTo(610 / 1340, 2);
  });

  it('returns null when width is zero', () => {
    expect(fitLiveSchematicSize(0, 400, 610, 1340, false)).toBeNull();
  });
});
