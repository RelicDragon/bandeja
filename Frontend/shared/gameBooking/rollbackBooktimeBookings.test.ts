import { describe, expect, it, vi } from 'vitest';
import {
  hasRollbackFailures,
  rollbackBooktimeBookings,
} from './rollbackBooktimeBookings';

describe('rollbackBooktimeBookings', () => {
  it('cancels each unique id and reports all successes', async () => {
    const cancelBooking = vi.fn().mockResolvedValue(undefined);

    const outcomes = await rollbackBooktimeBookings(cancelBooking, ['a', 'b', 'a']);

    expect(cancelBooking).toHaveBeenCalledTimes(2);
    expect(cancelBooking).toHaveBeenNthCalledWith(1, 'a');
    expect(cancelBooking).toHaveBeenNthCalledWith(2, 'b');
    expect(outcomes).toEqual([
      { externalBookingId: 'a', cancelled: true },
      { externalBookingId: 'b', cancelled: true },
    ]);
    expect(hasRollbackFailures(outcomes)).toBe(false);
  });

  it('reports partial failures without stopping remaining cancels', async () => {
    const cancelBooking = vi
      .fn()
      .mockRejectedValueOnce(new Error('cancel failed'))
      .mockResolvedValue(undefined);

    const outcomes = await rollbackBooktimeBookings(cancelBooking, ['first', 'second']);

    expect(outcomes).toEqual([
      { externalBookingId: 'first', cancelled: false },
      { externalBookingId: 'second', cancelled: true },
    ]);
    expect(hasRollbackFailures(outcomes)).toBe(true);
  });

  it('returns empty outcomes for empty input', async () => {
    const cancelBooking = vi.fn();

    const outcomes = await rollbackBooktimeBookings(cancelBooking, []);

    expect(outcomes).toEqual([]);
    expect(cancelBooking).not.toHaveBeenCalled();
    expect(hasRollbackFailures(outcomes)).toBe(false);
  });
});
