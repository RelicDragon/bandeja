import { api } from './index';

// Types for My Tab aggregated endpoint
export interface MyTabData {
  games: MyTabGame[];
  invites: MyTabInvite[];
  teams: MyTabTeam[];
  unreadCounts: Record<string, number>;
  storiesCount?: number | null;
  booktimeConnected?: boolean | null;
  _meta?: {
    etag?: string;
    timestamp: string;
  };
}

export interface MyTabGame {
  id: string;
  status: string;
  startTime: string;
  endTime: string;
  sport: string;
  gameType: string;
  entityType: string;
  clubId: string | null;
  courtId: string | null;
  club: {
    id: string;
    name: string;
    avatar: string | null;
  } | null;
  court: {
    id: string;
    name: string;
  } | null;
  participants: MyTabGameParticipant[];
  _count?: {
    messages?: number;
  };
}

export interface MyTabGameParticipant {
  userId: string;
  status: string;
  role: string;
  user: {
    id: string;
    name: string;
    avatar: string | null;
  };
}

export interface MyTabInvite {
  id: string;
  userId: string;
  gameId: string;
  status: string;
  joinedAt: string;
  inviteExpiresAt: string | null;
  invitedByUser: {
    id: string;
    name: string;
    avatar: string | null;
  } | null;
  game: {
    id: string;
    name: string | null;
    gameType: string;
    startTime: string;
    endTime: string;
    sport: string;
    status: string;
    club: {
      id: string;
      name: string;
      avatar: string | null;
    } | null;
    court: {
      id: string;
      name: string;
    } | null;
    participants: MyTabGameParticipant[];
  };
}

export interface MyTabTeam {
  id: string;
  name: string;
  avatar: string | null;
  sport: string;
  ownerId: string;
  members: MyTabTeamMember[];
  _count: {
    members: number;
  };
}

export interface MyTabTeamMember {
  id: string;
  userId: string;
  status: string;
  user: {
    id: string;
    name: string;
    avatar: string | null;
  };
}

// Local storage keys for caching
const MY_TAB_ETAG_KEY = 'my_tab_etag';
const MY_TAB_DATA_KEY = 'my_tab_data';
const MY_TAB_TIMESTAMP_KEY = 'my_tab_timestamp';

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
  const cachedETag = localStorage.getItem(MY_TAB_ETAG_KEY);
  const cachedData = localStorage.getItem(MY_TAB_DATA_KEY);
  const cachedTimestamp = localStorage.getItem(MY_TAB_TIMESTAMP_KEY);

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
    if (data._meta?.etag) {
      localStorage.setItem(MY_TAB_ETAG_KEY, data._meta.etag);
      localStorage.setItem(MY_TAB_DATA_KEY, JSON.stringify(data));
      localStorage.setItem(MY_TAB_TIMESTAMP_KEY, Date.now().toString());
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

  // Transform the response to match the MyTabData structure
  return {
    games: gamesData.games.map((game: any) => ({
      id: game.id,
      status: game.status,
      startTime: game.startTime,
      endTime: game.endTime,
      sport: game.sport,
      gameType: game.gameType,
      entityType: game.entityType,
      clubId: game.clubId,
      courtId: game.courtId,
      club: game.club,
      court: game.court,
      participants: game.participants || [],
      _count: { messages: game.unreadMessageCount || 0 },
    })),
    invites: gamesData.invites.map((invite: any) => ({
      id: invite.id,
      userId: invite.userId,
      gameId: invite.gameId,
      status: invite.status,
      joinedAt: invite.joinedAt,
      inviteExpiresAt: invite.inviteExpiresAt,
      invitedByUser: invite.invitedByUser,
      game: invite.game,
    })),
    teams: teamsResponse.map((team: any) => ({
      id: team.id,
      name: team.name,
      avatar: team.avatar,
      sport: team.sport,
      ownerId: team.ownerId,
      members: team.members || [],
      _count: { members: team.memberCount || team.members?.length || 0 },
    })),
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
  localStorage.removeItem(MY_TAB_ETAG_KEY);
  localStorage.removeItem(MY_TAB_DATA_KEY);
  localStorage.removeItem(MY_TAB_TIMESTAMP_KEY);
}
