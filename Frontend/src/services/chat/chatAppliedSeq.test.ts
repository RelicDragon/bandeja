import { describe, expect, it } from 'vitest';
import { nextAppliedCursor } from './chatAppliedSeq';

describe('nextAppliedCursor', () => {
  it('stays at previous cursor when the first seq is skipped', () => {
    expect(
      nextAppliedCursor(4, [
        { seq: 5, applied: false },
        { seq: 6, applied: true },
      ])
    ).toBe(4);
  });

  it('does not jump past an unapplied MESSAGE_CREATED seq', () => {
    expect(
      nextAppliedCursor(9, [
        { seq: 10, applied: false },
        { seq: 11, applied: true },
      ])
    ).toBe(9);
  });

  it('advances through a contiguous applied prefix', () => {
    expect(
      nextAppliedCursor(3, [
        { seq: 4, applied: true },
        { seq: 5, applied: true },
        { seq: 6, applied: false },
        { seq: 7, applied: true },
      ])
    ).toBe(5);
  });

  it('ignores seqs already covered by the previous cursor', () => {
    expect(
      nextAppliedCursor(10, [
        { seq: 8, applied: true },
        { seq: 10, applied: true },
        { seq: 11, applied: true },
      ])
    ).toBe(11);
  });

  it('does not jump past an unapplied seq when later seqs arrive first', () => {
    expect(
      nextAppliedCursor(4, [
        { seq: 6, applied: true },
        { seq: 5, applied: false },
      ])
    ).toBe(4);
  });
});
