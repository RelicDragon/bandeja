import { describe, expect, it } from 'vitest';
import { mergeInvitablePlayer } from './mergeInvitablePlayer';
import type { BasicUser } from '@/types';
import { Sports } from '@shared/sport';

describe('mergeInvitablePlayer', () => {
  const existing: BasicUser = {
    id: 'u1',
    firstName: 'A',
    lastName: 'B',
    level: 3.0,
    socialLevel: 1,
    gender: 'MALE',
    approvedLevel: false,
    isTrainer: false,
    sportProfiles: [
      { sport: Sports.PADEL, level: 3.0, reliability: 0.5, gamesPlayed: 1, gamesWon: 0, levelSource: 'DEFAULT' },
      { sport: Sports.TENNIS, level: 4.5, reliability: 0.5, gamesPlayed: 2, gamesWon: 1, levelSource: 'DEFAULT' },
    ],
  };

  it('keeps sportProfiles when incoming response is sport-projected', () => {
    const incoming = {
      ...existing,
      level: 4.5,
      sportProfiles: undefined,
      interactionCount: 3,
      gamesTogetherCount: 1,
    };
    const merged = mergeInvitablePlayer(existing, incoming);
    expect(merged.sportProfiles).toHaveLength(2);
    expect(merged.interactionCount).toBe(3);
  });

  it('keeps sportsEnabled when incoming omits it', () => {
    const withSports: BasicUser = {
      ...existing,
      sportsEnabled: [Sports.PADEL],
    };
    const incoming = {
      ...withSports,
      level: 3.0,
      sportProfiles: undefined,
      sportsEnabled: undefined,
      interactionCount: 1,
      gamesTogetherCount: 0,
    };
    const merged = mergeInvitablePlayer(withSports, incoming);
    expect(merged.sportsEnabled).toEqual([Sports.PADEL]);
  });

  it('replaces user when incoming has full sportProfiles', () => {
    const incoming = {
      ...existing,
      level: 2.0,
      sportProfiles: [
        { sport: Sports.PADEL, level: 2.0, reliability: 0, gamesPlayed: 0, gamesWon: 0, levelSource: 'DEFAULT' },
      ],
      interactionCount: 0,
      gamesTogetherCount: 0,
    };
    const merged = mergeInvitablePlayer(existing, incoming);
    expect(merged.sportProfiles).toHaveLength(1);
    expect(merged.level).toBe(2.0);
  });
});
