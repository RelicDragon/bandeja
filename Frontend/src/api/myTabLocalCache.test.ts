import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAllMyTabLocalCaches,
  clearMyTabCachesExcept,
  clearMyTabLocalCache,
  myTabCacheKeys,
  readMyTabLocalCache,
  resolveMyTabCacheUserId,
  writeMyTabLocalCache,
} from './myTabLocalCache';
import type { MyTabData } from './myTabLocalCache';

const USER_A = 'user-a';
const USER_B = 'user-b';

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
}

function sampleData(): MyTabData {
  return {
    games: [{ id: 'g1', startTime: '2026-07-12T10:00:00Z' } as MyTabData['games'][number]],
    invites: [],
    teams: [],
    unreadCounts: {},
    _meta: { timestamp: '2026-07-11T12:00:00.000Z' },
  };
}

describe('myTabLocalCache', () => {
  beforeEach(() => {
    installLocalStorageStub();
    vi.restoreAllMocks();
  });

  it('stores and reads user-scoped cache', () => {
    writeMyTabLocalCache(USER_A, sampleData(), 'etag-a');

    const cached = readMyTabLocalCache(USER_A);
    expect(cached.data?.games).toHaveLength(1);
    expect(cached.data?._meta?.userId).toBe(USER_A);
    expect(cached.etag).toBe('etag-a');
  });

  it('does not return cache for a different user', () => {
    writeMyTabLocalCache(USER_A, sampleData(), 'etag-a');
    expect(readMyTabLocalCache(USER_B).data).toBeNull();
  });

  it('clears caches for other users on login handoff', () => {
    writeMyTabLocalCache(USER_A, sampleData(), 'etag-a');
    writeMyTabLocalCache(USER_B, sampleData(), 'etag-b');

    clearMyTabCachesExcept(USER_B);

    expect(readMyTabLocalCache(USER_A).data).toBeNull();
    expect(readMyTabLocalCache(USER_B).data).not.toBeNull();
  });

  it('clears all scoped and legacy keys', () => {
    localStorage.setItem('my_tab_data', '{"games":[]}');
    writeMyTabLocalCache(USER_A, sampleData(), 'etag-a');

    clearAllMyTabLocalCaches();

    expect(localStorage.getItem('my_tab_data')).toBeNull();
    expect(readMyTabLocalCache(USER_A).data).toBeNull();
    expect(localStorage.getItem(myTabCacheKeys(USER_A).data)).toBeNull();
  });

  it('resolveMyTabCacheUserId reads current user id', () => {
    localStorage.setItem('user', JSON.stringify({ id: USER_A }));
    expect(resolveMyTabCacheUserId()).toBe(USER_A);
  });

  it('clearMyTabLocalCache removes only one user bucket', () => {
    writeMyTabLocalCache(USER_A, sampleData(), 'etag-a');
    writeMyTabLocalCache(USER_B, sampleData(), 'etag-b');

    clearMyTabLocalCache(USER_A);

    expect(readMyTabLocalCache(USER_A).data).toBeNull();
    expect(readMyTabLocalCache(USER_B).data).not.toBeNull();
  });
});
