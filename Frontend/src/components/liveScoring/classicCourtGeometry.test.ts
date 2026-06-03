import { describe, expect, it } from 'vitest';
import { classicBaselineAvatarLayout, classicPlayBounds, classicServiceFromNet } from './rally/classicCourtGeometry';

describe('classicCourtGeometry tennis', () => {
  it('uses shorter service line and inset singles alleys', () => {
    expect(classicServiceFromNet('tennis')).toBe(64);
    expect(classicServiceFromNet('padel')).toBe(69.5);
    expect(classicPlayBounds('tennis', false)).toEqual({ xL: 38, xR: 62 });
    expect(classicPlayBounds('tennis', true)).toEqual({ xL: 26, xR: 74 });
    expect(classicPlayBounds('padel', false)).toEqual({ xL: 26, xR: 74 });
  });

  it('uses one roster slot per end in singles setup', () => {
    const slots = classicBaselineAvatarLayout(
      'tennis',
      [{ id: 'a' } as never, { id: 'a2' } as never],
      'top',
      'teamA',
      'teamA',
      'rightDeuce',
      0,
      false,
      false,
      false,
      true,
      false
    );
    expect(slots).toHaveLength(1);
    expect(slots[0]?.left).toBe(62);
  });
});
