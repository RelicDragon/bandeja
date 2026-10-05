import { describe, expect, it } from 'vitest';
import { dynamicDuoProgress } from './dynamicDuoProgress';

describe('dynamicDuoProgress', () => {
  it('starts toward the first tier', () => {
    expect(dynamicDuoProgress(0)).toEqual({ wins: 0, target: 10, reached: null, fraction: 0, remaining: 10 });
    expect(dynamicDuoProgress(7)).toMatchObject({ target: 10, reached: null, remaining: 3, fraction: 0.7 });
  });

  it('moves to the next tier once one is reached', () => {
    expect(dynamicDuoProgress(10)).toMatchObject({ target: 50, reached: 10, remaining: 40 });
    expect(dynamicDuoProgress(99)).toMatchObject({ target: 100, reached: 50, remaining: 1 });
  });

  it('is done after the last tier', () => {
    expect(dynamicDuoProgress(100)).toMatchObject({ target: null, reached: 100, fraction: 1, remaining: 0 });
    expect(dynamicDuoProgress(240)).toMatchObject({ target: null, reached: 100 });
  });

  it('sanitises bad input', () => {
    expect(dynamicDuoProgress(-3).wins).toBe(0);
    expect(dynamicDuoProgress(Number.NaN).wins).toBe(0);
  });
});
