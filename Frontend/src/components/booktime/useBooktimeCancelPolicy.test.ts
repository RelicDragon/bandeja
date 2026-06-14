import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canCancelByPolicy } from '@/integrations/booktime/bookFlow';
import {
  DEFAULT_BOOKTIME_CANCEL_HOURS,
  resolveBooktimeCancelHoursForClub,
} from './useBooktimeCancelPolicy';

describe('resolveBooktimeCancelHoursForClub', () => {
  const policies = new Map([
    ['ksc-club-id', 8],
    ['elite-club-id', 24],
  ]);

  it('returns each club policy from the map', () => {
    expect(resolveBooktimeCancelHoursForClub('ksc-club-id', policies)).toBe(8);
    expect(resolveBooktimeCancelHoursForClub('elite-club-id', policies)).toBe(24);
  });

  it('falls back while a club policy is still loading', () => {
    expect(resolveBooktimeCancelHoursForClub('ksc-club-id', new Map(), 12)).toBe(12);
    expect(resolveBooktimeCancelHoursForClub('ksc-club-id', undefined, 12)).toBe(12);
  });

  it('does not reuse another club policy when the map is missing an entry', () => {
    const eliteOnly = new Map([['elite-club-id', 24]]);
    expect(resolveBooktimeCancelHoursForClub('ksc-club-id', eliteOnly)).toBe(
      DEFAULT_BOOKTIME_CANCEL_HOURS,
    );
  });
});

describe('canCancelByPolicy with per-club hours', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows KSC cancellation inside 8h window but blocks under Elite 24h rule', () => {
    const slotInTenHours = '2026-06-15T20:00:00.000Z';

    expect(canCancelByPolicy(slotInTenHours, 8)).toBe(true);
    expect(canCancelByPolicy(slotInTenHours, 24)).toBe(false);
  });

  it('blocks cancellation inside 8h window for KSC', () => {
    const slotInSixHours = '2026-06-15T16:00:00.000Z';

    expect(canCancelByPolicy(slotInSixHours, 8)).toBe(false);
  });
});
