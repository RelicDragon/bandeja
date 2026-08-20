import { describe, expect, it } from 'vitest';
import type { UserStats } from '@/api/users';
import { patchUserStatsPreferenceFlags } from './patchUserStatsPreferenceFlags';

function sampleStats(): UserStats {
  return {
    user: {
      id: 'u1',
      preferredHandLeft: false,
      preferredHandRight: true,
      preferredCourtSideLeft: false,
      preferredCourtSideRight: true,
    } as UserStats['user'],
    levelHistory: [],
    gamesLast30Days: 0,
    followersCount: 0,
    followingCount: 0,
    gamesStats: [],
  };
}

describe('patchUserStatsPreferenceFlags', () => {
  it('writes only the flags present on the profile save payload', () => {
    const next = patchUserStatsPreferenceFlags(sampleStats(), { preferredHandLeft: true });
    expect(next.user.preferredHandLeft).toBe(true);
    expect(next.user.preferredHandRight).toBe(true);
    expect(next.user.preferredCourtSideLeft).toBe(false);
    expect(next.user.preferredCourtSideRight).toBe(true);
  });

  it('treats explicit false as unset, not as omitted', () => {
    const next = patchUserStatsPreferenceFlags(sampleStats(), {
      preferredHandLeft: false,
      preferredHandRight: false,
      preferredCourtSideLeft: true,
      preferredCourtSideRight: false,
    });
    expect(next.user.preferredHandLeft).toBe(false);
    expect(next.user.preferredHandRight).toBe(false);
    expect(next.user.preferredCourtSideLeft).toBe(true);
    expect(next.user.preferredCourtSideRight).toBe(false);
  });
});
