import api from './axios';
import type { EntityType, LiveGameSummary, Sport } from '@/types';

/**
 * PRD 349 — the "Live now" rail.
 *
 * `GET /live/games` is a narrow read: only games that are public, being scored
 * right now, and not opted out of the rail. The backend applies that gate, so a
 * private game can never appear here no matter what the client asks for.
 */

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
