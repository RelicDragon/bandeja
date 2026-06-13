import { describe, expect, it } from 'vitest';
import { deriveBallsInGamesFromScoring as feDeriveBallsInGames } from './deriveBallsInGames';
import { deriveGameTimeFromBookings as feDeriveGameTime } from './gameBooking/deriveGameTimeFromBookings';
import { supportsClubBookingFlow as feSupportsClubBookingFlow } from './gameBooking/supportsClubBookingFlow';
import { GAME_FORMAT_UPDATE_KEYS as feFormatKeys } from './gameFormatUpdateKeys';
import { deriveBallsInGamesFromScoring as beDeriveBallsInGames } from '@backend/shared/deriveBallsInGames';
import { deriveGameTimeFromBookings as beDeriveGameTime } from '@backend/shared/gameBooking/deriveGameTimeFromBookings';
import { supportsClubBookingFlow as beSupportsClubBookingFlow } from '@backend/shared/gameBooking/supportsClubBookingFlow';
import { GAME_FORMAT_UPDATE_KEYS as beFormatKeys } from '@backend/shared/gameFormatUpdateKeys';

describe('shared module FE/BE parity', () => {
  it('deriveBallsInGamesFromScoring matches backend export', () => {
    const cases = [
      { sport: 'TABLE_TENNIS', scoringPreset: 'CLASSIC_3' },
      { scoringPreset: 'CLASSIC_3' },
      { scoringPreset: 'POINTS_16' },
      { winnerOfMatch: 'BY_SETS', maxTotalPointsPerSet: 0 },
      { winnerOfMatch: 'BY_SCORES', maxTotalPointsPerSet: 0 },
    ] as const;

    for (const input of cases) {
      expect(feDeriveBallsInGames(input)).toBe(beDeriveBallsInGames(input));
    }
  });

  it('GAME_FORMAT_UPDATE_KEYS matches backend export', () => {
    expect([...feFormatKeys].sort()).toEqual([...beFormatKeys].sort());
  });

  it('supportsClubBookingFlow matches backend export', () => {
    const cases: Array<[string, 'create' | 'edit' | undefined]> = [
      ['GAME', undefined],
      ['TRAINING', 'create'],
      ['TOURNAMENT', 'create'],
      ['LEAGUE', 'create'],
      ['LEAGUE', 'edit'],
      ['BAR', 'edit'],
      ['LEAGUE_SEASON', 'edit'],
    ];
    for (const [entityType, mode] of cases) {
      expect(feSupportsClubBookingFlow(entityType, mode)).toBe(
        beSupportsClubBookingFlow(entityType, mode),
      );
    }
  });

  it('deriveGameTimeFromBookings matches backend export', () => {
    const snapshots = [
      { bookingStart: '2026-06-12T10:00:00.000Z', bookingEnd: '2026-06-12T11:00:00.000Z' },
      { bookingStart: '2026-06-12T09:00:00.000Z', bookingEnd: '2026-06-12T12:00:00.000Z' },
    ];
    expect(feDeriveGameTime(snapshots)).toEqual(beDeriveGameTime(snapshots));
    expect(feDeriveGameTime([])).toEqual(beDeriveGameTime([]));
  });
});
