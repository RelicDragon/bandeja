import { describe, expect, it } from 'vitest';
import { parseBooktimeIntegrationConfig as feParseBooktimeIntegrationConfig } from './clubIntegration';
import { deriveBallsInGamesFromScoring as feDeriveBallsInGames } from './deriveBallsInGames';
import { deriveGameTimeFromBookings as feDeriveGameTime } from './gameBooking/deriveGameTimeFromBookings';
import { GAME_FORMAT_UPDATE_KEYS as feFormatKeys } from './gameFormatUpdateKeys';
import { parseBooktimeIntegrationConfig as beParseBooktimeIntegrationConfig } from '@backend/shared/clubIntegration';
import { bookingProviderError as feBookingProviderError } from './booking/types';
import { deriveBallsInGamesFromScoring as beDeriveBallsInGames } from '@backend/shared/deriveBallsInGames';
import { deriveGameTimeFromBookings as beDeriveGameTime } from '@backend/shared/gameBooking/deriveGameTimeFromBookings';
import { GAME_FORMAT_UPDATE_KEYS as beFormatKeys } from '@backend/shared/gameFormatUpdateKeys';
import { bookingProviderError as beBookingProviderError } from '@backend/shared/booking/types';

describe('shared module FE/BE parity', () => {
  it('parseBooktimeIntegrationConfig matches backend export', () => {
    const cases: unknown[] = [
      null,
      'x',
      [],
      { companyId: '  ' },
      { companyId: ' acme ' },
      {
        companyId: 'acme',
        termsUrl: ' https://t ',
        privacyUrl: ' https://p ',
        serviceIds: [' a ', '', 1, 'b'],
      },
    ];
    for (const input of cases) {
      expect(feParseBooktimeIntegrationConfig(input)).toEqual(
        beParseBooktimeIntegrationConfig(input),
      );
    }
  });

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

  it('deriveGameTimeFromBookings matches backend export', () => {
    const snapshots = [
      { bookingStart: '2026-06-12T10:00:00.000Z', bookingEnd: '2026-06-12T11:00:00.000Z' },
      { bookingStart: '2026-06-12T09:00:00.000Z', bookingEnd: '2026-06-12T12:00:00.000Z' },
    ];
    expect(feDeriveGameTime(snapshots)).toEqual(beDeriveGameTime(snapshots));
    expect(feDeriveGameTime([])).toEqual(beDeriveGameTime([]));
  });

  it('bookingProviderError matches backend export', () => {
    expect(feBookingProviderError('SlotTaken', 'taken')).toEqual(
      beBookingProviderError('SlotTaken', 'taken'),
    );
  });
});
