import { beforeEach, describe, expect, it, vi } from 'vitest';
import { removeMissingBooking } from './removeMissingBooking';

const mocks = vi.hoisted(() => ({ find: vi.fn(), unlink: vi.fn(), evict: vi.fn() }));
vi.mock('./unlinkBookingFromLinkedGames', () => ({
  fetchLinkedGameIdsForBooking: mocks.find,
  unlinkBookingFromLinkedGames: mocks.unlink,
}));
vi.mock('@/integrations/booktime/booktimeAllUpcomingLoader', () => ({ removeBooktimeBookingFromCache: mocks.evict }));
vi.mock('@/integrations/padeloo/padelooAllUpcomingLoader', () => ({ invalidatePadelooUpcomingCache: vi.fn() }));
vi.mock('@/integrations/klikteren/klikterenAllUpcomingLoader', () => ({ invalidateKlikterenUpcomingCache: vi.fn() }));

beforeEach(() => vi.resetAllMocks());

describe('remove missing booking', () => {
  it('removes every saved game link before clearing the cached card', async () => {
    mocks.find.mockResolvedValue(['g1', 'g2']);
    mocks.unlink.mockResolvedValue(['g1', 'g2']);
    await removeMissingBooking('booking');
    expect(mocks.unlink).toHaveBeenCalledWith('booking', ['g1', 'g2']);
    expect(mocks.evict).toHaveBeenCalledWith('booking');
  });

  it('keeps the card if a link cannot be removed', async () => {
    mocks.find.mockResolvedValue(['g1', 'g2']);
    mocks.unlink.mockResolvedValue(['g1']);
    await expect(removeMissingBooking('booking')).rejects.toThrow();
    expect(mocks.evict).not.toHaveBeenCalled();
  });

  it('clears an unlinked stale card', async () => {
    mocks.find.mockResolvedValue([]);
    mocks.unlink.mockResolvedValue([]);
    await removeMissingBooking('booking');
    expect(mocks.evict).toHaveBeenCalledWith('booking');
  });
});
