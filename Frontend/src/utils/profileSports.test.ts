import { describe, expect, it } from 'vitest';
import type { User } from '@/types';
import {
  gamesPlayedForSport,
  getDisplayLevelForSport,
  hasEnabledSports,
  hasMultipleSportsEnabled,
  isSportEnabled,
  listCreateFlowSports,
  listEnabledSports,
  listSelectableSports,
  resolveActivePrimarySport,
  resolveCreateGameDefaultSport,
  resolveProfileHeaderLevel,
  shouldShowSportLevelBadge,
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

  it('detects multi-sport for leaderboard picker', () => {
    expect(hasMultipleSportsEnabled(baseUser())).toBe(false);
    expect(listEnabledSports(baseUser())).toEqual(['PADEL']);
    const multi = baseUser({ sportsEnabled: ['PADEL', 'TENNIS'] });
    expect(hasMultipleSportsEnabled(multi)).toBe(true);
    expect(listEnabledSports(multi)).toEqual(['PADEL', 'TENNIS']);
  });

  it('resolveCreateGameDefaultSport prefers lastCreatedSport when enabled', () => {
    expect(
      resolveCreateGameDefaultSport(
        baseUser({
          primarySport: 'PADEL',
          lastCreatedSport: 'TENNIS',
          sportsEnabled: ['PADEL', 'TENNIS'],
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

  it('resolveProfileHeaderLevel uses user.level when no enabled sports', () => {
    expect(resolveProfileHeaderLevel(baseUser({ sportsEnabled: [], level: 4.2 }))).toBe(4.2);
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
});
