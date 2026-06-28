import api from './axios';
import type { Game, Invite, UserTeam } from '@/types';

// Types for My Tab aggregated endpoint
export interface MyTabData {
  games: Game[];
  invites: Invite[];
  teams: UserTeam[];
  unreadCounts: Record<string, number>;
  storiesCount?: number | null;
  booktimeConnected?: boolean | null;
  _meta?: {
    etag?: string;
    timestamp: string;
  };
}

// Local storage keys for caching
const MY_TAB_ETAG_KEY = 'my_tab_etag';
const MY_TAB_DATA_KEY = 'my_tab_data';
const MY_TAB_TIMESTAMP_KEY = 'my_tab_timestamp';

function getStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

/**
 * Get My Tab data from the aggregated endpoint with ETag support.
 *
 * @param options - Options for the request
 * @returns My Tab data
 */
export async function getMyTabData(options?: {
  includeStories?: boolean;
  includeBooktime?: boolean;
  useCache?: boolean;
  signal?: AbortSignal;
}): Promise<MyTabData> {
  const storage = getStorage();
  const cachedETag = storage?.getItem(MY_TAB_ETAG_KEY);
  const cachedData = storage?.getItem(MY_TAB_DATA_KEY);
  const cachedTimestamp = storage?.getItem(MY_TAB_TIMESTAMP_KEY);

  // Check if cache is still valid (less than 30 seconds old)
  const isCacheValid =
    cachedData &&
    cachedTimestamp &&
    Date.now() - parseInt(cachedTimestamp) < 30 * 1000;

  const headers: Record<string, string> = {};
  if (options?.useCache && cachedETag && isCacheValid) {
    headers['If-None-Match'] = cachedETag;
  }

  try {
    const response = await api.get<any>('/me/my-tab-data', {
      params: {
        includeStories: options?.includeStories ? 'true' : undefined,
        includeBooktime: options?.includeBooktime ? 'true' : undefined,
      },
      headers,
      signal: options?.signal,
    });

    const data = response.data.data;

    // Cache the response and ETag
    if (storage && data._meta?.etag) {
      storage.setItem(MY_TAB_ETAG_KEY, data._meta.etag);
      storage.setItem(MY_TAB_DATA_KEY, JSON.stringify(data));
      storage.setItem(MY_TAB_TIMESTAMP_KEY, Date.now().toString());
    }

    return data;
  } catch (error: any) {
    // Handle 304 Not Modified
    if (error.response?.status === 304 && cachedData) {
      return JSON.parse(cachedData);
    }

    // Handle 503 Service Unavailable - use fallback
    if (error.response?.status === 503) {
      console.warn('[me.getMyTabData] Service unavailable, using fallback');
      return getMyTabDataFallback();
    }

    throw error;
  }
}

/**
 * Fallback to individual endpoints when aggregated endpoint fails.
 *
 * This ensures graceful degradation - users still get their data even if the
 * optimized endpoint is unavailable.
 */
export async function getMyTabDataFallback(): Promise<MyTabData> {
  // Import these dynamically to avoid circular dependencies
  const [{ gamesApi }, { userTeamsApi }] = await Promise.all([
    import('./games'),
    import('./userTeams'),
  ]);

  // Fetch data from individual endpoints in parallel
  const [gamesResponse, teamsResponse] = await Promise.all([
    gamesApi.getMyGamesWithUnread(),
    userTeamsApi.getMine(),
  ]);
  const gamesData = gamesResponse.data;

  return {
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
}

/**
 * Clear cached My Tab data.
 * Call this after mutations that affect the My Tab.
 */
export function clearMyTabCache(): void {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(MY_TAB_ETAG_KEY);
  storage.removeItem(MY_TAB_DATA_KEY);
  storage.removeItem(MY_TAB_TIMESTAMP_KEY);
}
