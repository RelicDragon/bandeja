import { beforeEach, describe, expect, it, vi } from 'vitest';
import { unlinkBookingFromLinkedGames } from './unlinkBookingFromLinkedGames';

const apiMocks = vi.hoisted(() => ({
  getLinkedGamesMock: vi.fn(),
  patchBookingsMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
}));

vi.mock('@/api/booktime', () => ({
  booktimeApi: {
    getLinkedGames: apiMocks.getLinkedGamesMock,
  },
}));

vi.mock('@/api/games', () => ({
  gamesApi: {
    patchBookings: apiMocks.patchBookingsMock,
  },
}));

vi.mock('@/queries/queryClient', () => ({
  queryClient: {
    invalidateQueries: apiMocks.invalidateQueriesMock,
  },
}));

describe('unlinkBookingFromLinkedGames', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.patchBookingsMock.mockResolvedValue({ data: {} });
  });

  it('unlinks the booking from every linked game and invalidates game queries', async () => {
    apiMocks.getLinkedGamesMock.mockResolvedValue({
      data: [{ id: 'game-1' }, { id: 'game-2' }],
    });

    const gameIds = await unlinkBookingFromLinkedGames('booking-1');

    expect(gameIds).toEqual(['game-1', 'game-2']);
    expect(apiMocks.getLinkedGamesMock).toHaveBeenCalledWith('booking-1');
    expect(apiMocks.patchBookingsMock).toHaveBeenCalledTimes(2);
    expect(apiMocks.patchBookingsMock).toHaveBeenCalledWith('game-1', { remove: ['booking-1'] });
    expect(apiMocks.patchBookingsMock).toHaveBeenCalledWith('game-2', { remove: ['booking-1'] });
    expect(apiMocks.invalidateQueriesMock).toHaveBeenCalledOnce();
  });

  it('uses provided game ids without refetching linked games', async () => {
    const gameIds = await unlinkBookingFromLinkedGames('booking-1', ['game-3']);

    expect(gameIds).toEqual(['game-3']);
    expect(apiMocks.getLinkedGamesMock).not.toHaveBeenCalled();
    expect(apiMocks.patchBookingsMock).toHaveBeenCalledWith('game-3', { remove: ['booking-1'] });
    expect(apiMocks.invalidateQueriesMock).toHaveBeenCalledOnce();
  });

  it('returns only successfully unlinked games when one patch keeps failing', async () => {
    apiMocks.patchBookingsMock
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce(new Error('forbidden'))
      .mockRejectedValueOnce(new Error('forbidden'));

    const gameIds = await unlinkBookingFromLinkedGames('booking-1', ['game-1', 'game-2']);

    expect(gameIds).toEqual(['game-1']);
    expect(apiMocks.invalidateQueriesMock).toHaveBeenCalledOnce();
  });

  it('retries a failed unlink once (a link to a cancelled booking reads as booked)', async () => {
    apiMocks.patchBookingsMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: {} });

    const gameIds = await unlinkBookingFromLinkedGames('booking-1', ['game-1']);

    expect(gameIds).toEqual(['game-1']);
    expect(apiMocks.patchBookingsMock).toHaveBeenCalledTimes(2);
  });

  it('returns an empty list when no games are linked', async () => {
    apiMocks.getLinkedGamesMock.mockResolvedValue({ data: [] });

    const gameIds = await unlinkBookingFromLinkedGames('booking-1');

    expect(gameIds).toEqual([]);
    expect(apiMocks.patchBookingsMock).not.toHaveBeenCalled();
    expect(apiMocks.invalidateQueriesMock).not.toHaveBeenCalled();
  });
});
