import { beforeEach, describe, expect, it } from 'vitest';
import {
  invalidateUnreadApiCache,
  resetUnreadApiCacheForTests,
  unreadApiCacheState,
  unreadCountCache,
} from '@/api/chatUnreadApiCache';

describe('invalidateUnreadApiCache (Phase 0 #233)', () => {
  beforeEach(() => {
    resetUnreadApiCacheForTests();
  });

  it('clears count cache and in-flight promises', () => {
    unreadCountCache.set('unread-totals-global', { data: { total: 3 }, timestamp: Date.now() });
    unreadApiCacheState.unreadTotalsPromise = Promise.resolve({ total: 3 });
    unreadApiCacheState.unreadObjectsInFlight.set('test', Promise.resolve({ success: true, data: {} } as never));

    invalidateUnreadApiCache();

    expect(unreadCountCache.size).toBe(0);
    expect(unreadApiCacheState.unreadTotalsPromise).toBeNull();
    expect(unreadApiCacheState.unreadObjectsInFlight.size).toBe(0);
  });
});
