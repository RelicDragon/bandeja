import { describe, expect, it } from 'vitest';
import { resolveMatchCardDensity } from './matchCardDensity';

describe('resolveMatchCardDensity', () => {
  it('uses dense for narrow iPhone-like widths with 3 sets', () => {
    expect(resolveMatchCardDensity(320, 3, false)).toBe('dense');
    expect(resolveMatchCardDensity(340, 3, false)).toBe('dense');
  });

  it('uses compact for mid widths / fewer sets', () => {
    expect(resolveMatchCardDensity(300, 2, false)).toBe('compact');
    expect(resolveMatchCardDensity(380, 3, false)).toBe('compact');
  });

  it('uses comfortable on wide cards', () => {
    expect(resolveMatchCardDensity(480, 3, false)).toBe('comfortable');
    expect(resolveMatchCardDensity(420, 2, false)).toBe('comfortable');
  });

  it('defaults unknown width to dense when many sets', () => {
    expect(resolveMatchCardDensity(0, 3, false)).toBe('dense');
    expect(resolveMatchCardDensity(0, 1, false)).toBe('compact');
  });
});
