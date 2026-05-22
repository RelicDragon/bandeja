import { describe, expect, it } from 'vitest';
import { squashChangeEndsBeforeNextPoint } from './squashServe';

describe('squashChangeEndsBeforeNextPoint', () => {
  it('signals change ends at 11-9 but not 11-10', () => {
    expect(squashChangeEndsBeforeNextPoint(11, 9)).toBe(true);
    expect(squashChangeEndsBeforeNextPoint(9, 11)).toBe(true);
    expect(squashChangeEndsBeforeNextPoint(11, 10)).toBe(false);
    expect(squashChangeEndsBeforeNextPoint(10, 11)).toBe(false);
  });
});
