import { describe, expect, it } from 'vitest';
import { supportsDoubleElimination } from './doubleElimBracket.util';

describe('doubleElimBracket.util', () => {
  it('requires at least two MAIN R0 matches', () => {
    expect(supportsDoubleElimination(8)).toBe(true);
    expect(supportsDoubleElimination(2)).toBe(false);
  });
});
