import { describe, expect, it } from 'vitest';
import { sumSizeDeltaAboveScrollTop } from '../messageListScrollAnchor';

describe('sumSizeDeltaAboveScrollTop', () => {
  const row = (start: number, size: number) => ({ start, size });

  it('ignores size changes below the scroll offset', () => {
    const prev = [row(0, 80), row(80, 80), row(160, 80)];
    const next = [row(0, 80), row(80, 80), row(160, 120)];
    expect(sumSizeDeltaAboveScrollTop(prev, next, 100)).toBe(0);
  });

  it('sums size changes above the scroll offset', () => {
    const prev = [row(0, 80), row(80, 80), row(160, 80)];
    const next = [row(0, 100), row(100, 80), row(180, 80)];
    expect(sumSizeDeltaAboveScrollTop(prev, next, 150)).toBe(20);
  });

  it('does not use full list height delta when only tail rows grow', () => {
    const prev = [row(0, 80), row(80, 80), row(160, 80), row(240, 80)];
    const next = [row(0, 80), row(80, 80), row(160, 80), row(240, 200)];
    const fullListDelta = 120;
    const anchored = sumSizeDeltaAboveScrollTop(prev, next, 200);
    expect(anchored).toBe(0);
    expect(anchored).not.toBe(fullListDelta);
  });

  it('does not adjust when the partially visible top row grows', () => {
    const prev = [row(0, 80), row(80, 80), row(160, 80)];
    const next = [row(0, 80), row(80, 120), row(200, 80)];
    expect(sumSizeDeltaAboveScrollTop(prev, next, 120)).toBe(0);
  });
});
