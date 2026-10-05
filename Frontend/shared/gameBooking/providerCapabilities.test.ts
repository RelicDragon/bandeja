import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROVIDER_CAPABILITIES,
  planBookingDurations,
  resolveProviderCapabilities,
  roundUpBookingMinutes,
  type ProviderCapabilities,
} from './providerCapabilities';

describe('DEFAULT_PROVIDER_CAPABILITIES', () => {
  it('covers every provider; none can modify in place; minimum is 60 minutes', () => {
    expect(Object.keys(DEFAULT_PROVIDER_CAPABILITIES).sort()).toEqual(
      ['BOOKTIME', 'KLIKTEREN', 'NSPADELSUPABASE', 'PADELOO', 'WELTNER'].sort(),
    );
    for (const caps of Object.values(DEFAULT_PROVIDER_CAPABILITIES)) {
      expect(caps.canModify).toBe(false);
      expect(caps.canBook).toBe(true);
      expect(caps.minDurationMinutes).toBe(60);
    }
  });

  it('api-cancel providers are not idempotent; club-cancel ones keep a server receipt', () => {
    expect(DEFAULT_PROVIDER_CAPABILITIES.BOOKTIME).toMatchObject({ canCancel: true, cancelMode: 'api', idempotent: false, durationsMinutes: [60, 120] });
    expect(DEFAULT_PROVIDER_CAPABILITIES.PADELOO).toMatchObject({ canCancel: true, idempotent: false });
    expect(DEFAULT_PROVIDER_CAPABILITIES.KLIKTEREN).toMatchObject({ canCancel: true, idempotent: false });
    expect(DEFAULT_PROVIDER_CAPABILITIES.NSPADELSUPABASE).toMatchObject({ canCancel: false, cancelMode: 'club', idempotent: true, slotStepMinutes: 30 });
    expect(DEFAULT_PROVIDER_CAPABILITIES.WELTNER).toMatchObject({
      canCancel: false,
      cancelMode: 'club',
      idempotent: true,
      exactSlots: true,
      durationsMinutes: [60, 90, 120, 180],
    });
  });
});

describe('resolveProviderCapabilities', () => {
  it('returns defaults, merges overrides, and rejects unknown providers', () => {
    expect(resolveProviderCapabilities('PADELOO')).toEqual({ ...DEFAULT_PROVIDER_CAPABILITIES.PADELOO, exactSlots: undefined });
    expect(resolveProviderCapabilities('BOOKTIME', { BOOKTIME: { durationsMinutes: [60, 90] } })?.durationsMinutes).toEqual([60, 90]);
    expect(resolveProviderCapabilities('MYSTERY')).toBeNull();
    expect(resolveProviderCapabilities(null)).toBeNull();
    expect(resolveProviderCapabilities('MYSTERY', { MYSTERY: { canBook: true } })).toBeNull();
  });

  it('accepts a complete override for an unknown provider with safe defaults', () => {
    expect(
      resolveProviderCapabilities('MYSTERY', {
        MYSTERY: { canBook: true, canCancel: false, minDurationMinutes: 30, slotStepMinutes: 30 },
      }),
    ).toEqual({
      canBook: true,
      canCancel: false,
      canModify: false,
      minDurationMinutes: 30,
      slotStepMinutes: 30,
      durationsMinutes: undefined,
      cancelMode: 'club',
      idempotent: false,
      exactSlots: undefined,
    });
  });
});

describe('roundUpBookingMinutes', () => {
  const stepOnly: ProviderCapabilities = {
    canBook: true,
    canCancel: true,
    canModify: false,
    minDurationMinutes: 60,
    slotStepMinutes: 30,
    cancelMode: 'api',
    idempotent: false,
  };

  it('rounds a 30-minute gap up to the 60-minute minimum', () => {
    expect(roundUpBookingMinutes(30, DEFAULT_PROVIDER_CAPABILITIES.PADELOO)).toBe(60);
    expect(roundUpBookingMinutes(30, DEFAULT_PROVIDER_CAPABILITIES.NSPADELSUPABASE)).toBe(60);
  });

  it('picks the smallest allowed duration that fits', () => {
    expect(roundUpBookingMinutes(75, DEFAULT_PROVIDER_CAPABILITIES.PADELOO)).toBe(90);
    expect(roundUpBookingMinutes(90, DEFAULT_PROVIDER_CAPABILITIES.BOOKTIME)).toBe(120);
    expect(roundUpBookingMinutes(150, DEFAULT_PROVIDER_CAPABILITIES.WELTNER)).toBe(180);
    expect(roundUpBookingMinutes(200, DEFAULT_PROVIDER_CAPABILITIES.WELTNER)).toBeNull();
  });

  it('without a duration list rounds to the step above the minimum', () => {
    expect(roundUpBookingMinutes(10, stepOnly)).toBe(60);
    expect(roundUpBookingMinutes(61, stepOnly)).toBe(90);
    expect(roundUpBookingMinutes(7, { ...stepOnly, minDurationMinutes: 0, slotStepMinutes: 0 })).toBe(7);
  });

  it('non-positive needs are not bookable', () => {
    expect(roundUpBookingMinutes(0, stepOnly)).toBeNull();
    expect(roundUpBookingMinutes(Number.NaN, stepOnly)).toBeNull();
  });
});

describe('planBookingDurations', () => {
  it('is a single booking when one fits', () => {
    expect(planBookingDurations(30, DEFAULT_PROVIDER_CAPABILITIES.BOOKTIME)).toEqual([60]);
  });

  it('chains the longest duration plus a rounded remainder', () => {
    expect(planBookingDurations(150, DEFAULT_PROVIDER_CAPABILITIES.BOOKTIME)).toEqual([120, 60]);
    expect(planBookingDurations(240, DEFAULT_PROVIDER_CAPABILITIES.PADELOO)).toEqual([120, 120]);
  });

  it('returns null for non-positive needs', () => {
    expect(planBookingDurations(0, DEFAULT_PROVIDER_CAPABILITIES.BOOKTIME)).toBeNull();
  });
});
