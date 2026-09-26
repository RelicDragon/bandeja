import api from './axios';
import type { EntityType, LiveGameSummary, Sport } from '@/types';

/**
 * PRD 349 — the "Live now" rail.
 *
 * `GET /live/games` is a narrow read: games being scored right now plus games
 * whose results went final today (city day), limited to rail-visible games —
 * public, or a fixture of a public league season — and not opted out. The
 * backend applies that gate, so a private game can never appear here no matter
 * what the client asks for.
 */

/** Present only on league fixtures; drives the accented card. */
export interface LiveRailLeague {
  /** The LEAGUE_SEASON game — where a non-participant lands on tap. */
  seasonGameId: string;
  name: string;
  /** 1-based regular-season round; `null` for playoff fixtures. */
  roundNumber: number | null;
  isPlayoff: boolean;
}

export interface LiveRailGame {
  id: string;
  name: string | null;
  sport: Sport;
  entityType: EntityType;
  /** Rated match → the card shows the tiny rating icon. */
  affectsRating: boolean;
  startTime: string;
  cityId: string;
  cityName: string;
  clubId: string | null;
  clubName: string | null;
  clubAvatar: string | null;
  courtName: string | null;
  /** The viewer is PLAYING in this one — Find pins it first with a "You" tag. */
  viewerIsPlaying: boolean;
  /** Fixture of a league season the viewer plays in — sorted before the rest. */
  followedSeason: boolean;
  /** `live` is being scored now; `finished` went final today. */
  phase: 'live' | 'finished';
  /** ISO time the results went final; `null` while live. */
  finishedAt: string | null;
  /** League fixtures are created private; a stranger cannot read their results page. */
  isPublic: boolean;
  league: LiveRailLeague | null;
  /**
   * Live: the running score. Finished: the final sets, `currentGameScore` empty
   * and `leading` marking the winner.
   */
  liveSummary: LiveGameSummary;
}

export interface LiveSpectatorTokenResponse {
  token: string;
  matchId: string;
  gameId: string;
}

export const liveApi = {
  /** `cityId` defaults to the viewer's current city on the server. */
  list: (params?: { cityId?: string; limit?: number }) =>
    api.get<{ data: { games: LiveRailGame[] } }>('/live/games', { params }),

  /**
   * One watchable game. 404s for anything the rail would not show, so the
   * caller must treat a rejection as "nothing to watch", not an error state.
   */
  get: (gameId: string) =>
    api.get<{ data: { game: LiveRailGame } }>(`/live/games/${gameId}`),

  /**
   * Mint a public broadcast token for a live, public, rail-visible game.
   * 404s for anything else — private, finished, or hidden from the rail.
   */
  spectatorToken: (gameId: string) =>
    api.post<{ data: LiveSpectatorTokenResponse }>(`/live/games/${gameId}/spectator-token`),
};
