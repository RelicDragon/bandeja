import api from './axios';
import type { EntityType, LiveGameSummary, Sport } from '@/types';

/**
 * PRD 349 — the "Live now" rail.
 *
 * `GET /live/games` is a narrow read: games being scored right now, league
 * fixtures and followed players' tournaments in progress without a live score,
 * and games whose results went final today (city day), limited to rail-visible
 * games — public, or a fixture of a public league season — and not opted out.
 * The backend applies that gate, so a private game can never appear here no
 * matter what the client asks for.
 */

/** `live` is watchable; `inProgress` is typed in as it goes; `finished` went final today. */
export type LiveRailPhase = 'live' | 'inProgress' | 'finished';

/**
 * Where the shown match sits in a multi-match game: `match` for a game with a
 * scoreline ("Match 3/3"), `round` for a standings format ("Round 4").
 */
export type LiveRailMatchPosition =
  | { kind: 'match'; index: number; count: number }
  | { kind: 'round'; round: number };

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
  /** Someone the viewer follows is PLAYING in it. */
  followingPlaying: boolean;
  /** Only `live` joins a socket room or opens the watch board. */
  phase: LiveRailPhase;
  /** ISO time the results went final; `null` until then. */
  finishedAt: string | null;
  /** `null` for a single-match game. */
  matchPosition: LiveRailMatchPosition | null;
  /** League fixtures are created private; a stranger cannot read their results page. */
  isPublic: boolean;
  league: LiveRailLeague | null;
  /**
   * Live: the running score. Finished: the final sets, `currentGameScore` empty
   * and `leading` marking the winner. In progress: the sets entered so far
   * (possibly none), `leading` = ahead on them.
   */
  liveSummary: LiveGameSummary;
}

export interface LiveSpectatorTokenResponse {
  token: string;
  matchId: string;
  gameId: string;
}

export const liveApi = {
  /**
   * `cityId` defaults to the viewer's current city on the server. `inProgress`
   * cards are opt-in server-side (older app builds would offer "Watch" on them),
   * so this client always asks for them.
   */
  list: (params?: { cityId?: string; limit?: number }) =>
    api.get<{ data: { games: LiveRailGame[] } }>('/live/games', {
      params: { ...params, include: 'inProgress' },
    }),

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
