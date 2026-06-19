import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BooktimeMyClubRow } from '@/api/booktime';
import {
  invalidateBooktimeAllUpcomingCache,
  loadAllBooktimeUpcoming,
} from './booktimeAllUpcomingLoader';

const idbStore = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => idbStore.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    idbStore.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    idbStore.delete(key);
  }),
}));

vi.mock('./session', () => ({
  hydrateBooktimeSession: vi.fn(async () => true),
  getBooktimeClient: vi.fn(() => ({
    isAuthenticated: true,
    getUpcomingBookings: vi.fn(async () => ({ bookings: [] })),
  })),
}));

const club: BooktimeMyClubRow = {
  clubId: 'club-1',
  clubName: 'KSC',
  avatar: null,
  companyId: 'company-1',
  connected: true,
  phoneNumber: null,
  scoutOptIn: true,
  cityTimezone: 'Europe/Belgrade',
  courts: [],
};

describe('loadAllBooktimeUpcoming', () => {
  beforeEach(() => {
    idbStore.clear();
  });

  afterEach(() => {
    invalidateBooktimeAllUpcomingCache();
    vi.clearAllMocks();
  });

  it('deduplicates concurrent loads for the same club set', async () => {
    const { hydrateBooktimeSession } = await import('./session');
    const first = loadAllBooktimeUpcoming([club], true);
    const second = loadAllBooktimeUpcoming([club], true);
    await Promise.all([first, second]);
    expect(hydrateBooktimeSession).toHaveBeenCalledTimes(1);
  });

  it('serves cached results within TTL', async () => {
    const { hydrateBooktimeSession } = await import('./session');
    await loadAllBooktimeUpcoming([club], true);
    await loadAllBooktimeUpcoming([club], true);
    expect(hydrateBooktimeSession).toHaveBeenCalledTimes(1);
  });

  it('fetches get-upcoming once per companyId across connected clubs', async () => {
    const { getBooktimeClient } = await import('./session');
    const getUpcomingBookings = vi.fn(async () => ({ bookings: [] }));
    vi.mocked(getBooktimeClient).mockReturnValue({
      isAuthenticated: true,
      getUpcomingBookings,
    } as never);

    const secondClub: BooktimeMyClubRow = {
      ...club,
      clubId: 'club-2',
      clubName: 'Other court',
    };

    invalidateBooktimeAllUpcomingCache();
    await loadAllBooktimeUpcoming([club, secondClub], true);
    expect(getUpcomingBookings).toHaveBeenCalledTimes(1);
  });

  it('restores fresh cache from IndexedDB after page refresh', async () => {
    const { hydrateBooktimeSession } = await import('./session');
    await loadAllBooktimeUpcoming([club], true);
    expect(hydrateBooktimeSession).toHaveBeenCalledTimes(1);
    expect(idbStore.size).toBe(1);

    vi.resetModules();

    const loader = await import('./booktimeAllUpcomingLoader');
    const { hydrateBooktimeSession: hydrateAfterRefresh } = await import('./session');
    vi.mocked(hydrateAfterRefresh).mockClear();
    await loader.loadAllBooktimeUpcoming([club], true);
    expect(hydrateAfterRefresh).toHaveBeenCalledTimes(0);
  });
});
