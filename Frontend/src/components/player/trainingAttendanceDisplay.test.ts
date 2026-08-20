import { describe, expect, it } from 'vitest';
import { resolveDisplayedTrainingAttendance } from './trainingAttendanceDisplay';

describe('resolveDisplayedTrainingAttendance', () => {
  it('prefers sport-scoped stats for the history sport', () => {
    expect(
      resolveDisplayedTrainingAttendance({
        historySport: 'PADEL',
        parentStats: { sport: 'PADEL', trainingAttendanceCount: 1 },
        sportStats: { sport: 'PADEL', trainingAttendanceCount: 4 },
      }),
    ).toBe(4);
  });

  it('falls back to parent stats when they match the history sport', () => {
    expect(
      resolveDisplayedTrainingAttendance({
        historySport: 'TENNIS',
        parentStats: { sport: 'TENNIS', trainingAttendanceCount: 2 },
        sportStats: { sport: 'PADEL', trainingAttendanceCount: 9 },
      }),
    ).toBe(2);
  });

  it('does not use another sport while the matching count is loading', () => {
    expect(
      resolveDisplayedTrainingAttendance({
        historySport: 'TENNIS',
        parentStats: { sport: 'PADEL', trainingAttendanceCount: 12 },
        sportStats: { sport: 'PADEL', trainingAttendanceCount: 12 },
      }),
    ).toBeUndefined();
  });

  it('treats missing and invalid counts as absent', () => {
    expect(
      resolveDisplayedTrainingAttendance({
        historySport: 'PADEL',
        parentStats: { sport: 'PADEL', trainingAttendanceCount: Number.NaN },
        sportStats: { sport: 'PADEL' },
      }),
    ).toBeUndefined();
  });
});
