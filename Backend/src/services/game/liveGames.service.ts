/**
 * PRD 349 — "Live now" rail data source.
 *
 * One query, three consumers:
 *   • `GET /api/live/games` (the Find / Home rail)
 *   • the Telegram `/live` command (PRD 356) — it calls {@link listLiveGames}
 *     **directly**; the bot must never HTTP round-trip to its own API
 *   • the spectator-token mint, which reuses {@link findLiveRailGame} so the
 *     token can only ever be issued for a game the rail would have shown.
 *
 * The privacy gate (`LIVE_RAIL_WHERE`: IN_PROGRESS + isPublic + showOnLiveRail)
 * lives in `availableGamesStructuralWhere.ts` and is applied through
 * `appendStructuralFiltersToWhere({ liveOnly: true })` so there is exactly one
 * definition of "may a stranger watch this".
 */
import type { Prisma, Sport } from '@prisma/client';
import prisma from '../../config/database';
import type { BasicUser } from '../../types/user.types';
import type { LiveGameSummary } from './availableGamesEnrichmentTypes';
import {
  appendStructuralFiltersToWhere,
  LIVE_RAIL_WHERE,
} from './availableGamesStructuralWhere';
import { buildLiveGameSummary, liveEnvelopeUpdatedAtMs } from './liveGameSummary';
import {
  clampLiveRailLimit,
  sortLiveRailGames,
  LIVE_RAIL_FIND_LIMIT,
  LIVE_RAIL_MAX_LIMIT,
} from './liveRailOrder';

export {
  clampLiveRailLimit,
  sortLiveRailGames,
  LIVE_RAIL_FIND_LIMIT,
  LIVE_RAIL_HOME_LIMIT,
  LIVE_RAIL_MAX_LIMIT,
} from './liveRailOrder';

const liveMatchSelect = {
  id: true,
  matchNumber: true,
  metadata: true,
  timerStartedAt: true,
  updatedAt: true,
  court: { select: { id: true, name: true } },
  teams: {
    select: {
      teamNumber: true,
      players: {
        select: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              gender: true,
              approvedLevel: true,
              isTrainer: true,
              sportProfiles: { select: { sport: true, level: true } },
            },
          },
        },
      },
    },
  },
} as const;

const liveGameSelect = {
  id: true,
  name: true,
  sport: true,
  entityType: true,
  affectsRating: true,
  isPublic: true,
  showOnLiveRail: true,
  resultsStatus: true,
  startTime: true,
  endTime: true,
  cityId: true,
  clubId: true,
  courtId: true,
  maxParticipants: true,
  club: { select: { id: true, name: true, avatar: true } },
  court: {
    select: {
      id: true,
      name: true,
      club: { select: { id: true, name: true, avatar: true } },
    },
  },
  city: { select: { id: true, name: true, timezone: true } },
  parent: { select: { id: true, leagueSeason: { select: { id: true } } } },
  participants: {
    where: { status: 'PLAYING' as const },
    select: { userId: true },
  },
  rounds: {
    select: {
      id: true,
      matches: { select: liveMatchSelect },
    },
  },
} as const;

type LiveGameRow = Prisma.GameGetPayload<{ select: typeof liveGameSelect }>;

/** A rail card: slim game facts plus the live score payload. */
export type LiveRailGame = {
  id: string;
  name: string | null;
  sport: Sport;
  entityType: LiveGameRow['entityType'];
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
  /** Fixture of a league season the viewer takes part in — sorted first. */
  followedSeason: boolean;
  liveSummary: LiveGameSummary;
};

function toBasicUser(
  user: LiveGameRow['rounds'][number]['matches'][number]['teams'][number]['players'][number]['user'],
  sport: Sport,
): BasicUser {
  const profile = user.sportProfiles.find((p) => p.sport === sport);
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    avatar: user.avatar,
    level: profile?.level ?? 0,
    /**
     * Never projected to spectators — the rail renders avatar + name only, and
     * `socialLevel` is on the Find-card forbidden list for the same reason.
     */
    socialLevel: 0,
    gender: user.gender,
    approvedLevel: user.approvedLevel,
    isTrainer: user.isTrainer,
  };
}

/**
 * The match a spectator should watch: the one whose live-scoring envelope was
 * touched most recently, falling back to the highest match number so a game
 * with several boards still resolves deterministically.
 */
function pickLiveMatch(game: LiveGameRow): {
  summary: LiveGameSummary;
} | null {
  const candidates = game.rounds.flatMap((round) => round.matches);
  let best: { summary: LiveGameSummary; freshness: number; matchNumber: number } | null = null;

  for (const match of candidates) {
    const summary = buildLiveGameSummary({
      matchId: match.id,
      metadata: match.metadata,
      courtName: match.court?.name ?? game.court?.name ?? null,
      startedAt: match.timerStartedAt ?? game.startTime,
      teams: match.teams.map((team) => ({
        teamNumber: team.teamNumber,
        players: team.players.map((p) => toBasicUser(p.user, game.sport)),
      })),
    });
    if (!summary) continue;

    const freshness = liveEnvelopeUpdatedAtMs(match.metadata);
    if (
      !best ||
      freshness > best.freshness ||
      (freshness === best.freshness && match.matchNumber > best.matchNumber)
    ) {
      best = { summary, freshness, matchNumber: match.matchNumber };
    }
  }

  return best ? { summary: best.summary } : null;
}

async function followedSeasonIds(viewerUserId: string | null | undefined): Promise<Set<string>> {
  if (!viewerUserId) return new Set();
  const rows = await prisma.leagueParticipant.findMany({
    where: { userId: viewerUserId, withdrawnAt: null },
    select: { leagueSeasonId: true },
  });
  return new Set(rows.map((r) => r.leagueSeasonId));
}

function toRailGame(
  game: LiveGameRow,
  summary: LiveGameSummary,
  viewerUserId: string | null | undefined,
  seasonIds: Set<string>,
): LiveRailGame {
  const club = game.club ?? game.court?.club ?? null;
  const seasonId = game.parent?.leagueSeason?.id ?? null;
  return {
    id: game.id,
    name: game.name,
    sport: game.sport,
    entityType: game.entityType,
    affectsRating: game.affectsRating,
    startTime: game.startTime.toISOString(),
    cityId: game.cityId,
    cityName: game.city.name,
    clubId: club?.id ?? null,
    clubName: club?.name ?? null,
    clubAvatar: club?.avatar ?? null,
    courtName: summary.courtName ?? game.court?.name ?? null,
    viewerIsPlaying: Boolean(
      viewerUserId && game.participants.some((p) => p.userId === viewerUserId),
    ),
    followedSeason: Boolean(seasonId && seasonIds.has(seasonId)),
    liveSummary: summary,
  };
}

export type ListLiveGamesParams = {
  cityId: string;
  viewerUserId?: string | null;
  /** Defaults to the Find cap; clamped to {@link LIVE_RAIL_MAX_LIMIT}. */
  limit?: number;
};

/**
 * Live, public, rail-visible games in one city, newest-scored first.
 *
 * Order: the viewer's own game, then fixtures of seasons the viewer plays in,
 * then by start time ascending (the longest-running match first).
 */
export async function listLiveGames(params: ListLiveGamesParams): Promise<LiveRailGame[]> {
  const limit = clampLiveRailLimit(params.limit ?? LIVE_RAIL_FIND_LIMIT);

  const where = appendStructuralFiltersToWhere({ cityId: params.cityId }, { liveOnly: true });

  const [rows, seasonIds] = await Promise.all([
    prisma.game.findMany({
      where,
      select: liveGameSelect,
      orderBy: { startTime: 'asc' },
      // Over-fetch a little: games without a usable live envelope drop out below.
      take: LIVE_RAIL_MAX_LIMIT * 2,
    }),
    followedSeasonIds(params.viewerUserId),
  ]);

  const cards: LiveRailGame[] = [];
  for (const row of rows) {
    const picked = pickLiveMatch(row);
    if (!picked) continue;
    cards.push(toRailGame(row, picked.summary, params.viewerUserId, seasonIds));
  }

  return sortLiveRailGames(cards).slice(0, limit);
}

/**
 * The single game behind a spectator-token request.
 *
 * Returns `null` for anything the rail would not show — private, not live, or
 * opted out — so the caller can 404 without ever revealing which of the three
 * it was.
 */
export async function findLiveRailGame(gameId: string): Promise<LiveRailGame | null> {
  const row = await prisma.game.findFirst({
    where: { id: gameId, ...LIVE_RAIL_WHERE },
    select: liveGameSelect,
  });
  if (!row) return null;
  const picked = pickLiveMatch(row);
  if (!picked) return null;
  return toRailGame(row, picked.summary, null, new Set());
}

/**
 * Batched `liveSummary` for a page of Find / Home / My-tab cards.
 *
 * Only rail-visible games get a payload: a private game in the viewer's own
 * list is still live, but its score is not public, so the card stays plain.
 */
export async function liveSummariesForGameIds(
  gameIds: string[],
): Promise<Record<string, LiveGameSummary>> {
  if (gameIds.length === 0) return {};
  const rows = await prisma.game.findMany({
    where: { id: { in: gameIds }, ...LIVE_RAIL_WHERE },
    select: liveGameSelect,
  });

  const out: Record<string, LiveGameSummary> = {};
  for (const row of rows) {
    const picked = pickLiveMatch(row);
    if (picked) out[row.id] = picked.summary;
  }
  return out;
}

/** Ids of every live, rail-visible game a set of users is currently PLAYING in. */
export async function liveRailGameIdsForUsers(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await prisma.game.findMany({
    where: {
      ...LIVE_RAIL_WHERE,
      participants: { some: { userId: { in: userIds }, status: 'PLAYING' } },
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
