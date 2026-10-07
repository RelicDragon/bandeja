import { describe, expect, it, vi } from 'vitest';
import { NspadelClient, isNspadelClubNotConfiguredError } from './client';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/api/axios', () => ({ default: { request: apiRequest } }));

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

describe('NspadelClient.createBooking', () => {
  it('books as the signed-in app user (app API client, not a token-less fetch)', async () => {
    apiRequest.mockResolvedValueOnce({
      data: { data: { id: 'nspadel:c1:2030-05-05:10:00', courtId: 'c1', date: '2030-05-05', startTime: '10:00', endTime: '11:00' } },
    });
    const booking = await new NspadelClient({ clubId: 'club-1' }).createBooking({
      courtId: 'c1',
      date: '2030-05-05',
      startTime: '10:00',
      endTime: '11:00',
    });
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/nspadel/bookings?clubId=club-1', method: 'POST' }),
    );
    expect(booking.id).toBe('nspadel:c1:2030-05-05:10:00');
  });

  it('keeps the status and body of a failed booking (409 unknown outcome)', async () => {
    apiRequest.mockRejectedValueOnce({
      response: { status: 409, data: { message: 'errors.booking.slotNoLongerAvailable', code: 'NSPADEL_BOOKING_UNKNOWN' } },
    });
    await expect(
      new NspadelClient({ clubId: 'club-1' }).createBooking({ courtId: 'c1', date: '2030-05-05', startTime: '10:00', endTime: '11:00' }),
    ).rejects.toMatchObject({ status: 409, data: { code: 'NSPADEL_BOOKING_UNKNOWN' } });
  });
});
