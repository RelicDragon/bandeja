import api from './axios';
import { isCapacitor } from '@/utils/capacitor';
import {
  clearAllMyTabLocalCaches,
  clearLegacyMyTabLocalCache,
  clearMyTabCachesExcept,
  clearMyTabLocalCache,
  isMyTabCacheOwnedByUser,
  isMyTabLocalCacheFresh,
  readMyTabLocalCache,
  resolveMyTabCacheUserId,
  writeMyTabLocalCache,
  type MyTabData,
  type StoredMyTabData,
} from './myTabLocalCache';

export type { MyTabData, StoredMyTabData };

const MY_TAB_CACHE_MAX_AGE_MS = 30 * 1000;

function resolveUserId(userId?: string): string {
  const resolved = userId ?? resolveMyTabCacheUserId();
  if (!resolved) {
    throw new Error('[me.getMyTabData] Missing authenticated user id');
  }
  return resolved;
}

function shouldUseFallback(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 503) return true;
  if (typeof status === 'number' && status >= 500) return true;
  if (!status) return true;
  return false;
}

function hasMyTabListPayload(data: MyTabData | StoredMyTabData | null | undefined): boolean {
  if (!data) return false;
  return (data.games?.length ?? 0) > 0 || (data.invites?.length ?? 0) > 0;
}

/**
 * Get My Tab data from the aggregated endpoint with ETag support.
 */
export async function getMyTabData(options?: {
  userId?: string;
  includeStories?: boolean;
  includeBooktime?: boolean;
  useCache?: boolean;
  forceRefresh?: boolean;
  signal?: AbortSignal;
}): Promise<MyTabData> {
  const userId = resolveUserId(options?.userId);
  const localCache = readMyTabLocalCache(userId);
  const isCacheValid = isMyTabLocalCacheFresh(localCache.timestampMs, MY_TAB_CACHE_MAX_AGE_MS);

  const headers: Record<string, string> = {};
  if (
    options?.useCache &&
    !options?.forceRefresh &&
    localCache.etag &&
    isCacheValid &&
    localCache.data &&
    hasMyTabListPayload(localCache.data)
  ) {
    headers['If-None-Match'] = localCache.etag;
  }

  const params: Record<string, string | number | undefined> = {
    includeStories: options?.includeStories ? 'true' : undefined,
    includeBooktime: options?.includeBooktime ? 'true' : undefined,
  };
  if (isCapacitor()) {
    params._t = Date.now();
  }

  try {
    const response = await api.get<{ data: MyTabData }>('/me/my-tab-data', {
      params,
      headers,
      signal: options?.signal,
    });

    const data = response.data.data;
    if (data._meta?.etag) {
      writeMyTabLocalCache(userId, data, data._meta.etag);
    }

    return data;
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status;

    if (status === 304) {
      if (
        !options?.forceRefresh &&
        localCache.data &&
        isMyTabCacheOwnedByUser(localCache.data, userId) &&
        hasMyTabListPayload(localCache.data)
      ) {
        return localCache.data;
      }
      if (!options?.forceRefresh) {
        return getMyTabData({ ...options, userId, useCache: false, forceRefresh: true });
      }
    }

    if (
      localCache.data &&
      isMyTabCacheOwnedByUser(localCache.data, userId) &&
      (!status || status >= 500)
    ) {
      console.warn('[me.getMyTabData] Using local My Tab cache after request failure', {
        status,
      });
      return localCache.data;
    }

    if (shouldUseFallback(error)) {
      console.warn('[me.getMyTabData] Request failed, using fallback endpoints', { status });
      return getMyTabDataFallback(userId);
    }

    throw error;
  }
}

/**
 * Fallback to individual endpoints when aggregated endpoint fails.
 */
export async function getMyTabDataFallback(userId?: string): Promise<MyTabData> {
  const [{ gamesApi }, { userTeamsApi }] = await Promise.all([
    import('./games'),
    import('./userTeams'),
  ]);

  const [gamesResponse, teamsResponse] = await Promise.all([
    gamesApi.getMyGamesWithUnread(),
    userTeamsApi.getMine(),
  ]);
  const gamesData = gamesResponse.data;
  const data: MyTabData = {
    games: gamesData.games ?? [],
    invites: gamesData.invites ?? [],
    teams: teamsResponse ?? [],
    unreadCounts: gamesData.gamesUnreadCounts || {},
    storiesCount: null,
    booktimeConnected: null,
    _meta: {
      timestamp: new Date().toISOString(),
    },
  };

  const resolvedUserId = userId ?? resolveMyTabCacheUserId();
  if (resolvedUserId) {
    writeMyTabLocalCache(resolvedUserId, data, `fallback-${Date.now()}`);
  }

  return data;
}

/**
 * Clear cached My Tab data for the current or specified user.
 */
export function clearMyTabCache(userId?: string): void {
  const resolved = userId ?? resolveMyTabCacheUserId();
  if (resolved) {
    clearMyTabLocalCache(resolved);
  }
  clearLegacyMyTabLocalCache();
}

export function clearAllMyTabCaches(): void {
  clearAllMyTabLocalCaches();
}

export function clearOtherUsersMyTabCaches(keepUserId: string): void {
  clearMyTabCachesExcept(keepUserId);
}

export function patchMyTabCacheUserNote(
  gameId: string,
  userNote: string | null,
  userId?: string,
): void {
  const resolvedUserId = userId ?? resolveMyTabCacheUserId();
  if (!resolvedUserId) return;

  const cached = readMyTabLocalCache(resolvedUserId);
  if (!cached.data) return;

  try {
    const data = cached.data;
    let changed = false;

    const games = data.games?.map((game) => {
      if (game.id !== gameId) return game;
      if (game.userNote === userNote) return game;
      changed = true;
      return { ...game, userNote };
    });

    const invites = data.invites?.map((invite) => {
      if (!invite.game || invite.game.id !== gameId) return invite;
      if (invite.game.userNote === userNote) return invite;
      changed = true;
      return { ...invite, game: { ...invite.game, userNote } };
    });

    if (!changed || !cached.etag) return;

    writeMyTabLocalCache(resolvedUserId, {
      ...data,
      games: games ?? data.games,
      invites: invites ?? data.invites,
    }, cached.etag);
  } catch {
    // ignore corrupt cache
  }
}
