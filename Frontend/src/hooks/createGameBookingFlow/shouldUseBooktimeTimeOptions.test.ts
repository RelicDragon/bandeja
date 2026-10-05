import { describe, expect, it } from 'vitest';
import { shouldUseBooktimeTimeOptions } from './shouldUseBooktimeTimeOptions';

describe('shouldUseBooktimeTimeOptions', () => {
  const base = {
    entityType: 'GAME' as const,
    clubHasBookingIntegration: true,
    needsBooktimeAuth: false,
    locationTimeMode: 'timeSlots' as const,
    willBookOnCreate: true,
    booktimeConnected: true,
  };

  it('uses booktime slots only when reserving on create', () => {
    expect(shouldUseBooktimeTimeOptions(base)).toBe(true);
    expect(
      shouldUseBooktimeTimeOptions({
        ...base,
        willBookOnCreate: false,
      }),
    ).toBe(false);
  });

  it('falls back to full club schedule when court not selected or opt-out', () => {
    expect(
      shouldUseBooktimeTimeOptions({
        ...base,
        willBookOnCreate: false,
        booktimeConnected: true,
      }),
    ).toBe(false);
    expect(
      shouldUseBooktimeTimeOptions({
        ...base,
        locationTimeMode: 'bookings',
      }),
    ).toBe(false);
  });

  it('never uses booktime options for NS Padel even when connected', () => {
    expect(shouldUseBooktimeTimeOptions({ ...base, isNspadelClub: true })).toBe(false);
  });
});
