import type { ApiResponse } from '@/types';
import type { UnreadObjectsApiPayload } from '@/services/chat/chatUnreadPayload';

export const unreadCountCache = new Map<string, { data: unknown; timestamp: number }>();

export const unreadApiCacheState = {
  unreadCountPromise: null as Promise<unknown> | null,
  unreadTotalsPromise: null as Promise<unknown> | null,
  unreadObjectsInFlight: new Map<string, Promise<ApiResponse<UnreadObjectsApiPayload>>>(),
};

/** Clears in-memory unread API caches only — does not refresh the unread store. */
export function invalidateUnreadApiCache(): void {
  unreadCountCache.clear();
  unreadApiCacheState.unreadCountPromise = null;
  unreadApiCacheState.unreadTotalsPromise = null;
  unreadApiCacheState.unreadObjectsInFlight.clear();
}

/** Test-only reset between cases. */
export function resetUnreadApiCacheForTests(): void {
  invalidateUnreadApiCache();
}
