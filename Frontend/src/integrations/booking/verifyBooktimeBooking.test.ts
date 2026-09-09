import { describe, expect, it, vi } from 'vitest';
import { verifyBooktimeBooking } from './verifyBooktimeBooking';

const booking = (uuid: string, status?: string) => ({ uuid, status, bookingStart: '', bookingEnd: '' });

describe('live booking verification', () => {
  it('finds a booking beyond the first page', async () => {
    const upcoming = vi.fn()
      .mockResolvedValueOnce({ bookings: Array.from({ length: 50 }, (_, i) => booking(`b-${i}`)), totalCount: 51 })
      .mockResolvedValueOnce({ bookings: [booking('target')], totalCount: 51 });
    const previous = vi.fn();
    expect(await verifyBooktimeBooking('target', upcoming, previous)).toBe(true);
    expect(upcoming).toHaveBeenLastCalledWith(1, 50);
    expect(previous).not.toHaveBeenCalled();
  });

  it('checks previous bookings when the slot has started', async () => {
    expect(await verifyBooktimeBooking('target',
      vi.fn().mockResolvedValue({ bookings: [] }),
      vi.fn().mockResolvedValue({ bookings: [booking('target')] }),
    )).toBe(true);
  });

  it('reports missing only after exhausting both lists', async () => {
    const previous = vi.fn().mockResolvedValue({ bookings: [booking('other')] });
    expect(await verifyBooktimeBooking('target', vi.fn().mockResolvedValue({ bookings: [] }), previous)).toBe(false);
    expect(previous).toHaveBeenCalled();
  });

  it.each(['CANCELLED', 'canceled'])('recognizes an explicitly %s booking', async (status) => {
    expect(await verifyBooktimeBooking('target',
      vi.fn().mockResolvedValue({ bookings: [booking('target', status)] }), vi.fn(),
    )).toBe(false);
  });

  it('propagates connection failures instead of reporting missing', async () => {
    await expect(verifyBooktimeBooking('target', vi.fn().mockRejectedValue(new Error('Unauthorized')), vi.fn()))
      .rejects.toThrow('Unauthorized');
  });

  it('rejects incomplete pagination instead of reporting missing', async () => {
    const upcoming = vi.fn()
      .mockResolvedValueOnce({ bookings: [booking('other')], totalCount: 2 })
      .mockResolvedValueOnce({ bookings: [], totalCount: 2 });
    await expect(verifyBooktimeBooking('target', upcoming, vi.fn())).rejects.toThrow('Incomplete');
  });

  it('rejects a server repeating pages', async () => {
    const upcoming = vi.fn().mockResolvedValue({ bookings: [booking('other')], totalCount: 2 });
    await expect(verifyBooktimeBooking('target', upcoming, vi.fn())).rejects.toThrow('did not advance');
  });
});
