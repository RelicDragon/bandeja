import { describe, expect, it } from 'vitest';
import {
  BOOKTIME_FALLBACK_DURATIONS_HOURS,
  defaultDurationOptionsHours,
  resolveClubDurationOptions,
  resolveBooktimeDurationsHours,
} from '@/integrations/booktime/durations';

describe('resolveClubDurationOptions', () => {
  it('uses full defaults when external booking is off', () => {
    expect(
      resolveClubDurationOptions({
        entityType: 'GAME',
        useBooktimeCompanyDurations: false,
        integrationDurationsHours: [1, 2],
      }),
    ).toEqual([1, 1.5, 2]);
  });

  it('hides 1.5h while booktime durations load', () => {
    expect(
      resolveClubDurationOptions({
        entityType: 'GAME',
        useBooktimeCompanyDurations: true,
        integrationDurationsHours: null,
      }),
    ).toEqual(BOOKTIME_FALLBACK_DURATIONS_HOURS);
    expect(
      resolveClubDurationOptions({
        entityType: 'GAME',
        useBooktimeCompanyDurations: true,
        integrationDurationsHours: null,
      }),
    ).not.toContain(1.5);
  });

  it('uses API durations when loaded', () => {
    expect(
      resolveClubDurationOptions({
        entityType: 'GAME',
        useBooktimeCompanyDurations: true,
        integrationDurationsHours: resolveBooktimeDurationsHours({ bookingDurations: [60, 90, 120] }),
      }),
    ).toEqual([1, 1.5, 2]);
  });
});

describe('defaultDurationOptionsHours', () => {
  it('includes 1.5h for games', () => {
    expect(defaultDurationOptionsHours('GAME')).toContain(1.5);
  });
});
