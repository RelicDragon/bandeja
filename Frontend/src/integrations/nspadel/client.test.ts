import { describe, expect, it } from 'vitest';
import { isNspadelClubNotConfiguredError } from './client';

function errWith(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

describe('isNspadelClubNotConfiguredError', () => {
  it('matches the backend nspadelSupabaseUrlRequired key', () => {
    expect(
      isNspadelClubNotConfiguredError(errWith(400, 'errors.booking.nspadelSupabaseUrlRequired')),
    ).toBe(true);
  });

  it('still matches the legacy clubNotConfigured key', () => {
    expect(isNspadelClubNotConfiguredError(errWith(400, 'errors.booking.clubNotConfigured'))).toBe(
      true,
    );
  });

  it('rejects unrelated 400 errors and non-400 statuses', () => {
    expect(isNspadelClubNotConfiguredError(errWith(400, 'errors.booking.slotNoLongerAvailable'))).toBe(
      false,
    );
    expect(
      isNspadelClubNotConfiguredError(errWith(409, 'errors.booking.nspadelSupabaseUrlRequired')),
    ).toBe(false);
    expect(isNspadelClubNotConfiguredError(new Error('boom'))).toBe(false);
  });
});
