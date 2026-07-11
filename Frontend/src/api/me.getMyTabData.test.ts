import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyTabData } from './myTabLocalCache';

const apiGet = vi.fn();
const getMyGamesWithUnread = vi.fn();
const getMineTeams = vi.fn();

vi.mock('./axios', () => ({
  default: {
    get: (...args: unknown[]) => apiGet(...args),
  },
}));

vi.mock('./games', () => ({
  gamesApi: {
    getMyGamesWithUnread: (...args: unknown[]) => getMyGamesWithUnread(...args),
  },
}));

vi.mock('./userTeams', () => ({
  userTeamsApi: {
    getMine: (...args: unknown[]) => getMineTeams(...args),
  },
}));

vi.mock('@/utils/capacitor', () => ({
  isCapacitor: () => false,
}));

import { getMyTabData, getMyTabDataFallback } from './me';

const USER_ID = 'user-1';

function installLocalStorageStub() {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    get length() {
      return storage.size;
    },
    key: (index: number) => [...storage.keys()][index] ?? null,
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
  });
  return storage;
}

function samplePayload(): MyTabData {
  return {
    games: [{ id: 'g1', startTime: '2026-07-12T10:00:00Z' } as MyTabData['games'][number]],
    invites: [],
    teams: [],
    unreadCounts: { g1: 2 },
    _meta: {
      etag: 'etag-live',
      timestamp: '2026-07-11T12:00:00.000Z',
    },
  };
}

describe('getMyTabData reliability', () => {
  beforeEach(() => {
    installLocalStorageStub();
    localStorage.setItem('user', JSON.stringify({ id: USER_ID }));
    apiGet.mockReset();
    getMyGamesWithUnread.mockReset();
    getMineTeams.mockReset();
  });

  it('stores user-scoped cache on success', async () => {
    apiGet.mockResolvedValue({ data: { data: samplePayload() } });

    const result = await getMyTabData({ userId: USER_ID, useCache: true });

    expect(result.games).toHaveLength(1);
    expect(localStorage.getItem(`my_tab_data:${USER_ID}`)).toContain(USER_ID);
  });

  it('refetches when 304 would reuse an empty cache', async () => {
    localStorage.setItem(`my_tab_etag:${USER_ID}`, 'etag-stale');
    localStorage.setItem(
      `my_tab_data:${USER_ID}`,
      JSON.stringify({
        games: [],
        invites: [],
        teams: [],
        unreadCounts: {},
        _meta: { userId: USER_ID, etag: 'etag-stale', timestamp: '2026-07-11T10:00:00.000Z' },
      }),
    );
    localStorage.setItem(`my_tab_timestamp:${USER_ID}`, Date.now().toString());

    apiGet
      .mockRejectedValueOnce({ response: { status: 304 } })
      .mockResolvedValueOnce({ data: { data: samplePayload() } });

    const result = await getMyTabData({ userId: USER_ID, useCache: true });

    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(result.games).toHaveLength(1);
  });

  it('uses fallback endpoints on 503', async () => {
    apiGet.mockRejectedValue({ response: { status: 503 } });
    getMyGamesWithUnread.mockResolvedValue({
      data: {
        games: [{ id: 'g2', startTime: '2026-07-13T10:00:00Z' }],
        invites: [],
        gamesUnreadCounts: {},
      },
    });
    getMineTeams.mockResolvedValue([]);

    const result = await getMyTabData({ userId: USER_ID, useCache: true });

    expect(getMyGamesWithUnread).toHaveBeenCalledTimes(1);
    expect(result.games).toHaveLength(1);
  });

  it('serves owned local cache on network failure when payload exists', async () => {
    localStorage.setItem(`my_tab_etag:${USER_ID}`, 'etag-owned');
    localStorage.setItem(
      `my_tab_data:${USER_ID}`,
      JSON.stringify({
        games: [{ id: 'g-local', startTime: '2026-07-14T10:00:00Z' }],
        invites: [],
        teams: [],
        unreadCounts: {},
        _meta: { userId: USER_ID, etag: 'etag-owned', timestamp: '2026-07-11T10:00:00.000Z' },
      }),
    );
    localStorage.setItem(`my_tab_timestamp:${USER_ID}`, Date.now().toString());

    apiGet.mockRejectedValue(new Error('network down'));

    const result = await getMyTabData({ userId: USER_ID, useCache: true });

    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(result.games[0]?.id).toBe('g-local');
  });

  it('clears legacy cache keys when writing scoped cache', async () => {
    localStorage.setItem('my_tab_data', '{"games":[]}');
    localStorage.setItem('my_tab_etag', 'legacy');
    apiGet.mockResolvedValue({ data: { data: samplePayload() } });

    await getMyTabData({ userId: USER_ID, useCache: true });

    expect(localStorage.getItem('my_tab_data')).toBeNull();
    expect(localStorage.getItem('my_tab_etag')).toBeNull();
  });

  it('ignores legacy global cache and loads fresh scoped data', async () => {
    localStorage.setItem(
      'my_tab_data',
      JSON.stringify({
        games: [],
        invites: [],
        teams: [],
        unreadCounts: {},
        _meta: { etag: 'legacy-empty', timestamp: '2026-07-11T08:00:00.000Z' },
      }),
    );
    localStorage.setItem('my_tab_etag', 'legacy-empty');
    localStorage.setItem('my_tab_timestamp', Date.now().toString());
    apiGet.mockResolvedValue({ data: { data: samplePayload() } });

    const result = await getMyTabData({ userId: USER_ID, useCache: true });

    expect(result.games).toHaveLength(1);
    expect(localStorage.getItem(`my_tab_data:${USER_ID}`)).toContain(USER_ID);
  });
});

describe('getMyTabDataFallback', () => {
  beforeEach(() => {
    installLocalStorageStub();
    getMyGamesWithUnread.mockReset();
    getMineTeams.mockReset();
  });

  it('writes fallback payload into user cache', async () => {
    getMyGamesWithUnread.mockResolvedValue({
      data: {
        games: [{ id: 'g2', startTime: '2026-07-13T10:00:00Z' }],
        invites: [],
        gamesUnreadCounts: {},
      },
    });
    getMineTeams.mockResolvedValue([]);

    const result = await getMyTabDataFallback(USER_ID);

    expect(result.games).toHaveLength(1);
    expect(localStorage.getItem(`my_tab_data:${USER_ID}`)).toContain(USER_ID);
  });
});
