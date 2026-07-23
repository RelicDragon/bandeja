import { describe, expect, it } from 'vitest';
import type { BasicUser, User } from '@/types';
import {
  canDisableSport,
  gamesPlayedForSport,
  formatSportLevelBadgeDisplay,
  getDisplayLevelForSport,
  getReliabilityForSport,
  hasEnabledSports,
  hasMultipleSportsEnabled,
  isSportEnabled,
  isSportLevelAvailableForDisplay,
  listCreateFlowSports,
  listEnabledSports,
  listSelectableSports,
  resolveActivePrimarySport,
  resolveCreateGameDefaultSport,
  resolveProfileCardSport,
  resolveProfileHeaderLevel,
  resolveTrainingEditDefaults,
  shouldShowSportLevelBadge,
  userLevelMatchesGameBand,
  isLevelConfirmedForSport,
} from './profileSports';

const baseUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'u1',
    level: 3.4,
    socialLevel: 3.0,
    gender: 'PREFER_NOT_TO_SAY',
    approvedLevel: false,
    isTrainer: false,
    reliability: 0,
    totalPoints: 0,
    gamesPlayed: 10,
    gamesWon: 5,
    primarySport: 'PADEL',
    sportsEnabled: ['PADEL'],
    sportProfiles: [{ sport: 'PADEL', level: 3.4, reliability: 0, gamesPlayed: 10, gamesWon: 5 }],
    ...overrides,
  }) as User;

describe('profileSports', () => {
  it('lists all implemented sports for profile selector', () => {
    expect(listSelectableSports()).toContain('PADEL');
    expect(listSelectableSports().length).toBeGreaterThan(1);
  });

  it('treats empty sportsEnabled as no enabled sports', () => {
    const user = baseUser({ sportsEnabled: [] });
    expect(listEnabledSports(user)).toEqual([]);
    expect(hasEnabledSports(user)).toBe(false);
    expect(isSportEnabled(user, 'PADEL')).toBe(false);
    expect(resolveActivePrimarySport(user)).toBeNull();
  });

  it('hasEnabledSports is true when at least one sport enabled', () => {
    expect(hasEnabledSports(baseUser())).toBe(true);
  });

  it('resolveActivePrimarySport prefers enabled stored primary', () => {
    const user = baseUser({
      primarySport: 'TENNIS',
      sportsEnabled: ['PADEL', 'TENNIS'],
    });
    expect(resolveActivePrimarySport(user)).toBe('TENNIS');
  });

  it('resolveActivePrimarySport falls back when stored primary disabled', () => {
    const user = baseUser({
      primarySport: 'PADEL',
      sportsEnabled: ['TENNIS'],
    });
    expect(resolveActivePrimarySport(user)).toBe('TENNIS');
  });

  it('resolveProfileCardSport prefers viewer primary when subject has it', () => {
    const subject = baseUser({
      primarySport: 'PADEL',
      sportsEnabled: ['PADEL', 'TENNIS'],
    });
    const viewer = baseUser({
      id: 'viewer',
      primarySport: 'TENNIS',
      sportsEnabled: ['TENNIS'],
    });
    expect(resolveProfileCardSport(subject, viewer)).toBe('TENNIS');
  });

  it('resolveProfileCardSport falls back to subject primary when viewer sport missing', () => {
    const subject = baseUser({
      primarySport: 'PADEL',
      sportsEnabled: ['PADEL'],
    });
    const viewer = baseUser({
      id: 'viewer',
      primarySport: 'TENNIS',
      sportsEnabled: ['TENNIS'],
    });
    expect(resolveProfileCardSport(subject, viewer)).toBe('PADEL');
  });

  it('resolveProfileCardSport prefers open hint when subject has it', () => {
    const subject = baseUser({
      primarySport: 'PADEL',
      sportsEnabled: ['PADEL', 'TENNIS'],
    });
    const viewer = baseUser({
      id: 'viewer',
      primarySport: 'PADEL',
      sportsEnabled: ['PADEL'],
    });
    expect(resolveProfileCardSport(subject, viewer, 'TENNIS')).toBe('TENNIS');
  });

  it('resolveProfileCardSport ignores open hint subject lacks', () => {
    const subject = baseUser({
      primarySport: 'PADEL',
      sportsEnabled: ['PADEL'],
    });
    const viewer = baseUser({
      id: 'viewer',
      primarySport: 'TENNIS',
      sportsEnabled: ['TENNIS'],
    });
    expect(resolveProfileCardSport(subject, viewer, 'TENNIS')).toBe('PADEL');
  });

  it('resolveProfileCardSport returns undefined when subject has no sports', () => {
    const subject = baseUser({ sportsEnabled: [] });
    const viewer = baseUser({ primarySport: 'TENNIS', sportsEnabled: ['TENNIS'] });
    expect(resolveProfileCardSport(subject, viewer)).toBeUndefined();
  });

  it('detects multi-sport for leaderboard picker', () => {
    expect(hasMultipleSportsEnabled(baseUser())).toBe(false);
    expect(listEnabledSports(baseUser())).toEqual(['PADEL']);
    const multi = baseUser({ sportsEnabled: ['PADEL', 'TENNIS'] });
    expect(hasMultipleSportsEnabled(multi)).toBe(true);
    expect(listEnabledSports(multi)).toEqual(['PADEL', 'TENNIS']);
  });

  it('resolveCreateGameDefaultSport prefers active primary over lastCreatedSport', () => {
    expect(
      resolveCreateGameDefaultSport(
        baseUser({
          primarySport: 'BADMINTON',
          lastCreatedSport: 'PADEL',
          sportsEnabled: ['PADEL', 'BADMINTON'],
        }),
      ),
    ).toBe('BADMINTON');
  });

  it('resolveCreateGameDefaultSport falls back to lastCreatedSport when primary disabled', () => {
    expect(
      resolveCreateGameDefaultSport(
        baseUser({
          primarySport: 'PADEL',
          lastCreatedSport: 'TENNIS',
          sportsEnabled: ['TENNIS'],
        }),
      ),
    ).toBe('TENNIS');
  });

  it('resolveCreateGameDefaultSport uses stored primary when none enabled', () => {
    expect(resolveCreateGameDefaultSport(baseUser({ sportsEnabled: [] }))).toBe('PADEL');
  });

  it('listCreateFlowSports offers all sports when profile has none enabled', () => {
    expect(listCreateFlowSports(baseUser({ sportsEnabled: [] }))).toEqual(listSelectableSports());
  });

  it('resolveProfileHeaderLevel uses primary sport profile when no enabled sports', () => {
    expect(
      resolveProfileHeaderLevel(
        baseUser({
          sportsEnabled: [],
          level: 4.2,
          sportProfiles: [{ sport: 'PADEL', level: 3.4, reliability: 0, gamesPlayed: 10, gamesWon: 5 }],
        }),
      ),
    ).toBe(3.4);
  });

  it('canDisableSport only when enabled and another sport remains', () => {
    const padelOnly = baseUser({
      sportsEnabled: ['PADEL'],
      sportProfiles: [{ sport: 'PADEL', level: 1, reliability: 0, gamesPlayed: 22, gamesWon: 10 }],
    });
    expect(canDisableSport(padelOnly, 'PADEL')).toBe(false);

    const multi = baseUser({
      sportsEnabled: ['PADEL', 'TENNIS'],
      sportProfiles: [
        { sport: 'PADEL', level: 1.9, reliability: 0, gamesPlayed: 22, gamesWon: 10 },
        { sport: 'TENNIS', level: 2, reliability: 0, gamesPlayed: 5, gamesWon: 2 },
      ],
    });
    expect(canDisableSport(multi, 'PADEL')).toBe(true);
    expect(canDisableSport(multi, 'TENNIS')).toBe(true);
  });

  it('shouldShowSportLevelBadge when games played or level above 1.0', () => {
    const fresh = baseUser({
      sportProfiles: [{ sport: 'PADEL', level: 1.0, reliability: 0, gamesPlayed: 0, gamesWon: 0 }],
      level: 1.0,
      gamesPlayed: 0,
    });
    expect(shouldShowSportLevelBadge(fresh, 'PADEL')).toBe(false);
    expect(gamesPlayedForSport(fresh, 'PADEL')).toBe(0);

    const estimated = baseUser({
      sportProfiles: [{ sport: 'TENNIS', level: 2.5, reliability: 0, gamesPlayed: 0, gamesWon: 0 }],
      sportsEnabled: ['PADEL', 'TENNIS'],
    });
    expect(shouldShowSportLevelBadge(estimated, 'TENNIS')).toBe(true);

    const played = baseUser({
      sportProfiles: [{ sport: 'PADEL', level: 1.0, reliability: 50, gamesPlayed: 3, gamesWon: 1 }],
      gamesPlayed: 3,
    });
    expect(shouldShowSportLevelBadge(played, 'PADEL')).toBe(true);
  });

  it('formatSportLevelBadgeDisplay shows dash when sport not enabled', () => {
    const padelOnly = baseUser({
      sportsEnabled: ['PADEL'],
      sportProfiles: [
        { sport: 'PADEL', level: 3.4, reliability: 0, gamesPlayed: 10, gamesWon: 5 },
      ],
    });
    expect(isSportLevelAvailableForDisplay(padelOnly, 'TENNIS')).toBe(false);
    expect(formatSportLevelBadgeDisplay(padelOnly, 'TENNIS')).toBe('-');
    expect(formatSportLevelBadgeDisplay(padelOnly, 'PADEL')).toBe('3.4');
  });

  it('formatSportLevelBadgeDisplay trusts projected BasicUser without sportsEnabled', () => {
    const projected: BasicUser = {
      id: 'p1',
      level: 3.2,
      primarySport: 'PADEL',
      socialLevel: 3,
      gender: 'MALE',
      approvedLevel: false,
      isTrainer: false,
    };
    expect(formatSportLevelBadgeDisplay(projected, 'TENNIS')).toBe('3.2');
  });

  it('getDisplayLevelForSport trusts projected level when sportProfiles absent (BasicUser)', () => {
    const projected: BasicUser = {
      id: 'p1',
      level: 3.2,
      primarySport: 'PADEL',
      socialLevel: 3,
      gender: 'MALE',
      approvedLevel: false,
      isTrainer: false,
      reliability: 42,
    };
    expect(getDisplayLevelForSport(projected, 'TENNIS')).toBe(3.2);
    expect(getReliabilityForSport(projected, 'TENNIS')).toBe(42);
  });

  it('formatSportLevelBadgeDisplay shows padel 3.0 and tennis 5.0 for same user', () => {
    const user = baseUser({
      level: 3.0,
      primarySport: 'PADEL',
      sportsEnabled: ['PADEL', 'TENNIS'],
      sportProfiles: [
        { sport: 'PADEL', level: 3.0, reliability: 50, gamesPlayed: 5, gamesWon: 2 },
        { sport: 'TENNIS', level: 5.0, reliability: 60, gamesPlayed: 8, gamesWon: 4 },
      ],
    });
    expect(formatSportLevelBadgeDisplay(user, 'PADEL')).toBe('3.0');
    expect(formatSportLevelBadgeDisplay(user, 'TENNIS')).toBe('5.0');
  });

  it('getDisplayLevelForSport falls back when profile or projected level is missing', () => {
    const projected = {
      id: 'p1',
      primarySport: 'PADEL',
      socialLevel: 3,
      gender: 'MALE',
      approvedLevel: false,
      isTrainer: false,
    } as BasicUser;
    expect(getDisplayLevelForSport(projected, 'PADEL')).toBe(1.0);
    expect(formatSportLevelBadgeDisplay(projected, 'PADEL')).toBe('1.0');

    const user = baseUser({
      sportsEnabled: ['PADEL'],
      sportProfiles: [
        { sport: 'PADEL', level: undefined as unknown as number, reliability: 0, gamesPlayed: 0, gamesWon: 0 },
      ],
    });
    expect(getDisplayLevelForSport(user, 'PADEL')).toBe(1.0);
    expect(formatSportLevelBadgeDisplay(user, 'PADEL')).toBe('1.0');
  });

  it('getDisplayLevelForSport uses profile or legacy padel level', () => {
    const user = baseUser({
      sportsEnabled: ['PADEL', 'TENNIS'],
      sportProfiles: [
        { sport: 'PADEL', level: 3.4, reliability: 0, gamesPlayed: 10, gamesWon: 5 },
        { sport: 'TENNIS', level: 4.1, reliability: 0, gamesPlayed: 12, gamesWon: 6 },
      ],
    });
    expect(getDisplayLevelForSport(user, 'TENNIS')).toBe(4.1);
    expect(getDisplayLevelForSport(user, 'PADEL')).toBe(3.4);
  });

  it('find games filter uses tennis profile level not global padel level', () => {
    const user = baseUser({
      level: 4.5,
      reliability: 70,
      sportProfiles: [
        { sport: 'PADEL', level: 4.5, reliability: 70, gamesPlayed: 40, gamesWon: 20 },
        { sport: 'TENNIS', level: 2.0, reliability: 15, gamesPlayed: 2, gamesWon: 1 },
      ],
      sportsEnabled: ['PADEL', 'TENNIS'],
    });
    expect(getDisplayLevelForSport(user, 'TENNIS')).toBe(2.0);
    expect(userLevelMatchesGameBand(user, 'TENNIS', 3.0, 5.0)).toBe(false);
    expect(userLevelMatchesGameBand(user, 'TENNIS', 1.5, 2.5)).toBe(true);
    expect(userLevelMatchesGameBand(user, 'PADEL', 4.0, 5.0)).toBe(true);
  });

  it('full User with empty sportProfiles returns default level without legacy User fallback', () => {
    const user = baseUser({
      level: 4.5,
      primarySport: 'PADEL',
      sportsEnabled: ['PADEL', 'TENNIS'],
      sportProfiles: [],
    });
    expect(getDisplayLevelForSport(user, 'PADEL')).toBe(1.0);
    expect(getDisplayLevelForSport(user, 'TENNIS')).toBe(1.0);
    expect(getReliabilityForSport(user, 'PADEL')).toBe(0);
    expect(gamesPlayedForSport(user, 'PADEL')).toBe(0);
  });

  it('getReliabilityForSport uses sport profile not global User.reliability', () => {
    const user = baseUser({
      reliability: 80,
      sportProfiles: [
        { sport: 'PADEL', level: 3.4, reliability: 80, gamesPlayed: 10, gamesWon: 5 },
        { sport: 'TENNIS', level: 2.5, reliability: 12, gamesPlayed: 1, gamesWon: 0 },
      ],
      sportsEnabled: ['PADEL', 'TENNIS'],
    });
    expect(getReliabilityForSport(user, 'TENNIS')).toBe(12);
    expect(getReliabilityForSport(user, 'PADEL')).toBe(80);
  });

  it('resolveTrainingEditDefaults uses sport profile when no outcome', () => {
    const user = baseUser({
      level: 4.0,
      reliability: 75,
      sportProfiles: [
        { sport: 'PADEL', level: 4.0, reliability: 75, gamesPlayed: 10, gamesWon: 5 },
        { sport: 'TENNIS', level: 2.2, reliability: 18, gamesPlayed: 0, gamesWon: 0 },
      ],
      sportsEnabled: ['PADEL', 'TENNIS'],
    });
    expect(resolveTrainingEditDefaults(user, 'TENNIS')).toEqual({ level: 2.2, reliability: 50 });
    expect(
      resolveTrainingEditDefaults(user, 'TENNIS', { levelBefore: 2.0, reliabilityBefore: 10 }),
    ).toEqual({ level: 2.0, reliability: 50 });
  });

  it('isLevelConfirmedForSport is per sport profile', () => {
    const user = baseUser({
      approvedLevel: true,
      sportsEnabled: ['PADEL', 'TENNIS'],
      sportProfiles: [
        {
          sport: 'PADEL',
          level: 3.4,
          reliability: 0,
          gamesPlayed: 10,
          gamesWon: 5,
          approvedLevel: true,
        },
        {
          sport: 'TENNIS',
          level: 4.1,
          reliability: 0,
          gamesPlayed: 12,
          gamesWon: 6,
          approvedLevel: false,
        },
      ],
    });
    expect(isLevelConfirmedForSport(user, 'PADEL')).toBe(true);
    expect(isLevelConfirmedForSport(user, 'TENNIS')).toBe(false);
  });

  it('isLevelConfirmedForSport trusts projected approvedLevel when profiles absent', () => {
    const projected: BasicUser = {
      id: 'p1',
      level: 3.2,
      primarySport: 'PADEL',
      socialLevel: 3,
      gender: 'MALE',
      approvedLevel: true,
      isTrainer: false,
    };
    expect(isLevelConfirmedForSport(projected, 'PADEL')).toBe(true);
    expect(isLevelConfirmedForSport(projected, 'TENNIS')).toBe(true);
  });

  it('isLevelConfirmedForSport falls back to User mirror for slim padel profiles only', () => {
    const user = baseUser({
      approvedLevel: true,
      sportsEnabled: ['PADEL', 'TENNIS'],
      sportProfiles: [
        { sport: 'PADEL', level: 3.4, reliability: 0, gamesPlayed: 10, gamesWon: 5 },
        { sport: 'TENNIS', level: 4.1, reliability: 0, gamesPlayed: 12, gamesWon: 6 },
      ],
    });
    expect(isLevelConfirmedForSport(user, 'PADEL')).toBe(true);
    expect(isLevelConfirmedForSport(user, 'TENNIS')).toBe(false);
  });
});
