import { describe, expect, it } from 'vitest';
import type { User } from '@/types';
import {
  getInviteNudgeCopyMode,
  isCreatorUnratedForSport,
  shouldWarnCreateGameLevelBand,
} from './sportQuestionnaire';

const baseUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'u1',
    level: 3.8,
    socialLevel: 3.0,
    gender: 'PREFER_NOT_TO_SAY',
    approvedLevel: false,
    isTrainer: false,
    reliability: 0,
    totalPoints: 0,
    gamesPlayed: 40,
    gamesWon: 20,
    primarySport: 'PADEL',
    sportsEnabled: ['PADEL', 'TENNIS'],
    sportProfiles: [
      { sport: 'PADEL', level: 3.8, reliability: 0, gamesPlayed: 40, gamesWon: 20, levelSource: 'QUESTIONNAIRE' },
      { sport: 'TENNIS', level: 1, reliability: 0, gamesPlayed: 0, gamesWon: 0, levelSource: 'DEFAULT' },
    ],
    welcomeScreenPassed: true,
    ...overrides,
  }) as User;

describe('sportQuestionnaire ADR-Q8', () => {
  it('flags unrated creator with high min band', () => {
    const user = baseUser();
    expect(isCreatorUnratedForSport(user, 'TENNIS')).toBe(true);
    expect(shouldWarnCreateGameLevelBand(user, 'TENNIS', 3.0, 4.5)).toBe(true);
    expect(shouldWarnCreateGameLevelBand(user, 'TENNIS', 1.0, 7.0)).toBe(false);
  });

  it('does not warn when creator has rated games in sport', () => {
    const user = baseUser({
      sportProfiles: [
        { sport: 'TENNIS', level: 1, reliability: 0, gamesPlayed: 2, gamesWon: 0, levelSource: 'DEFAULT' },
      ],
    });
    expect(isCreatorUnratedForSport(user, 'TENNIS')).toBe(false);
    expect(shouldWarnCreateGameLevelBand(user, 'TENNIS', 3.0, 4.5)).toBe(false);
  });
});

describe('sportQuestionnaire cross-sport invite', () => {
  it('uses cross-sport copy when primary level > 1 and game sport unrated', () => {
    expect(getInviteNudgeCopyMode(baseUser(), 'TENNIS')).toBe('cross-sport');
  });

  it('uses same-sport copy for primary sport nudge', () => {
    const user = baseUser({
      sportProfiles: [
        { sport: 'PADEL', level: 1, reliability: 0, gamesPlayed: 0, gamesWon: 0, levelSource: 'DEFAULT' },
      ],
      welcomeScreenPassed: false,
    });
    expect(getInviteNudgeCopyMode(user, 'PADEL')).toBe('same-sport');
  });
});
