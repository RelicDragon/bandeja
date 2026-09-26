/**
 * PRD 349 — "Live now" rail data source.
 *
 * Consumers:
 *   • `GET /api/live/games` (the Find / Home rail) — {@link listCityRailGames}:
 *     live games first, then league fixtures and followed players' tournaments
 *     in progress without a live score, then games whose results went final
 *     **today** (city day), so a score entered the normal way still shows up
 *   • the Telegram `/live` command (PRD 356) — it calls {@link listLiveGames}
 *     **directly** (live only); the bot must never HTTP round-trip to its own API
 *   • the spectator-token mint, which reuses {@link findLiveRailGame} so the
 *     token can only ever be issued for a game the rail would have shown live.
 *
 * The privacy gate (`LIVE_RAIL_VISIBLE_WHERE`: public or a public season's
 * league fixture, + showOnLiveRail; `LIVE_RAIL_WHERE` adds IN_PROGRESS) lives
 * in `availableGamesStructuralWhere.ts`, so there is exactly one definition of
 * "may a stranger see this".
 */
import type { Prisma, Sport } from '@prisma/client';
import prisma from '../../config/database';
import type { BasicUser } from '../../types/user.types';
import type { LiveGameSummary } from './availableGamesEnrichmentTypes';
import { getUserTimezoneFromCityId } from '../user-timezone.service';
import {
  appendStructuralFiltersToWhere,
  LIVE_RAIL_VISIBLE_WHERE,
  LIVE_RAIL_WHERE,
} from './availableGamesStructuralWhere';
import { startOfCalendarDate } from './calendarDateBounds';
import { formatCalendarDayKey } from './calendarDayKey';
import {
  buildFinalGameSummary,
  buildLiveGameSummary,
  buildProgressGameSummary,
  liveEnvelopeUpdatedAtMs,
} from './liveGameSummary';
import {
  clampLiveRailLimit,
  selectLiveRailGames,
  LIVE_RAIL_FIND_LIMIT,
  LIVE_RAIL_MAX_LIMIT,
  type LiveRailPhase,
} from './liveRailOrder';
import {
  earnsRailCard,
  isStandingsFormat,
  pickFinishedRailMatch,
  pickProgressRailMatch,
  railMatchPosition,
  type RailMatchCandidate,
  type RailMatchPosition,
} from './liveRailMatchPick';

export {
  clampLiveRailLimit,
  selectLiveRailGames,
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
  winnerId: true,
  court: { select: { id: true, name: true } },
  /** Final cards read the stored sets; live cards read the envelope. */
  sets: {
    where: { role: 'OFFICIAL' as const },
    orderBy: { setNumber: 'asc' as const },
    select: { teamAScore: true, teamBScore: true },
  },
  teams: {
    select: {
      id: true,
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
  gameType: true,
  affectsRating: true,
  isPublic: true,
  showOnLiveRail: true,
  resultsStatus: true,
  startTime: true,
  endTime: true,
  finishedDate: true,
  parentId: true,
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
  parent: {
    select: {
      id: true,
      isPublic: true,
      leagueSeason: { select: { id: true, league: { select: { name: true } } } },
    },
  },
  leagueRound: { select: { orderIndex: true, roundType: true } },
  participants: {
    where: { status: 'PLAYING' as const },
    select: { userId: true },
  },
  rounds: {
    orderBy: { roundNumber: 'asc' as const },
    select: {
      id: true,
      roundNumber: true,
      matches: { orderBy: { matchNumber: 'asc' as const }, select: liveMatchSelect },
    },
  },
} as const;

type LiveGameRow = Prisma.GameGetPayload<{ select: typeof liveGameSelect }>;
type LiveMatchRow = LiveGameRow['rounds'][number]['matches'][number];

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
  /** Someone the viewer follows is PLAYING in it. */
  followingPlaying: boolean;
  /**
   * `live` is being scored now (watchable); `inProgress` is a league fixture or
   * a followed player's tournament whose results are typed in as it goes (not
   * watchable — opens the game); `finished` went final today (city day).
   * `inProgress` is only sent to clients that ask for it.
   */
  phase: LiveRailPhase;
  /** ISO time results went final; `null` until then. */
  finishedAt: string | null;
  /** Where the shown match sits in a multi-match game; `null` for one match. */
  matchPosition: RailMatchPosition | null;
  /**
   * League fixtures are private by construction: the client sends a stranger
   * to the season page instead of a results page that would 404.
   */
  isPublic: boolean;
  /** Present only on league fixtures; the card is accented. */
  league: LiveRailLeague | null;
  liveSummary: LiveGameSummary;
};

export type LiveRailLeague = {
  /** The LEAGUE_SEASON game id (also the `LeagueSeason` id). */
  seasonGameId: string;
  name: string;
  /** 1-based regular-season round; `null` for playoff fixtures. */
  roundNumber: number | null;
  isPlayoff: boolean;
};

function toBasicUser(
  user: LiveMatchRow['teams'][number]['players'][number]['user'],
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
function pickLiveMatch(game: LiveGameRow): PickedRailMatch | null {
  const candidates = game.rounds.flatMap((round) => round.matches);
  let best: { summary: LiveGameSummary; freshness: number; matchNumber: number } | null = null;

  for (const match of candidates) {
    const summary = buildLiveGameSummary({
      matchId: match.id,
      metadata: match.metadata,
      courtName: match.court?.name ?? game.court?.name ?? null,
      startedAt: match.timerStartedAt ?? game.startTime,
      teams: sportTeams(match, game.sport),
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

  return best ? { summary: best.summary, matchPosition: positionOf(game, best.summary.matchId) } : null;
}

function sportTeams(match: LiveMatchRow, sport: Sport) {
  return match.teams.map((team) => ({
    teamNumber: team.teamNumber,
    players: team.players.map((p) => toBasicUser(p.user, sport)),
  }));
}

function allMatches(game: LiveGameRow): Array<{ match: LiveMatchRow; roundNumber: number }> {
  return game.rounds.flatMap((round) =>
    round.matches.map((match) => ({ match, roundNumber: round.roundNumber })),
  );
}

function railMatchCandidates(game: LiveGameRow): RailMatchCandidate[] {
  return allMatches(game).map(({ match, roundNumber }) => ({
    id: match.id,
    roundNumber,
    matchNumber: match.matchNumber,
    hasBothTeams:
      match.teams.some((team) => team.teamNumber === 1) &&
      match.teams.some((team) => team.teamNumber === 2),
    scored: match.sets.some((set) => set.teamAScore > 0 || set.teamBScore > 0),
    playerIds: match.teams.flatMap((team) => team.players.map((p) => p.user.id)),
  }));
}

function findMatch(game: LiveGameRow, matchId: string): LiveMatchRow | null {
  return allMatches(game).find(({ match }) => match.id === matchId)?.match ?? null;
}

type PickedRailMatch = { summary: LiveGameSummary; matchPosition: RailMatchPosition | null };

function positionOf(game: LiveGameRow, matchId: string): RailMatchPosition | null {
  return railMatchPosition(railMatchCandidates(game), matchId, isStandingsFormat(game));
}

/**
 * The scoreboard of a finished game: its last scored match — for a standings
 * format, the last one the viewer or a followed player took part in.
 */
function pickFinalMatch(game: LiveGameRow, focusUserIds: ReadonlySet<string>): PickedRailMatch | null {
  const candidates = railMatchCandidates(game);
  const picked = pickFinishedRailMatch(candidates, focusUserIds);
  const match = picked ? findMatch(game, picked.id) : null;
  if (!match) return null;
  const summary = buildFinalGameSummary({
    matchId: match.id,
    courtName: match.court?.name ?? game.court?.name ?? null,
    startedAt: match.timerStartedAt ?? game.startTime,
    teams: sportTeams(match, game.sport),
    sets: match.sets,
    winnerTeamNumber: match.teams.find((team) => team.id === match.winnerId)?.teamNumber ?? null,
  });
  if (!summary) return null;
  return { summary, matchPosition: railMatchPosition(candidates, match.id, isStandingsFormat(game)) };
}

/** A game in progress without a live score: the latest entered (or next) match. */
function pickProgressMatch(
  game: LiveGameRow,
  focusUserIds: ReadonlySet<string>,
): PickedRailMatch | null {
  const candidates = railMatchCandidates(game);
  const picked = pickProgressRailMatch(candidates, focusUserIds);
  const match = picked ? findMatch(game, picked.id) : null;
  if (!match) return null;
  const summary = buildProgressGameSummary({
    matchId: match.id,
    courtName: match.court?.name ?? game.court?.name ?? null,
    startedAt: match.timerStartedAt ?? game.startTime,
    teams: sportTeams(match, game.sport),
    sets: match.sets,
  });
  if (!summary) return null;
  return { summary, matchPosition: railMatchPosition(candidates, match.id, isStandingsFormat(game)) };
}

function leagueOf(game: LiveGameRow): LiveRailLeague | null {
  if (game.entityType !== 'LEAGUE' || !game.parentId) return null;
  const season = game.parent?.leagueSeason;
  if (!season) return null;
  const isPlayoff = game.leagueRound?.roundType === 'PLAYOFF';
  return {
    seasonGameId: season.id,
    name: season.league.name,
    roundNumber: !isPlayoff && game.leagueRound ? game.leagueRound.orderIndex + 1 : null,
    isPlayoff,
  };
}

/** Everything per-viewer the rail needs, loaded once per request. */
export type RailViewer = {
  userId: string | null;
  /** Seasons the viewer is a non-withdrawn participant of. */
  seasonIds: Set<string>;
  /** Users the viewer follows (`UserFavoriteUser`). */
  followedUserIds: Set<string>;
};

const ANONYMOUS_VIEWER: RailViewer = {
  userId: null,
  seasonIds: new Set(),
  followedUserIds: new Set(),
};

export async function loadRailViewer(viewerUserId: string | null | undefined): Promise<RailViewer> {
  if (!viewerUserId) return ANONYMOUS_VIEWER;
  const [seasons, follows] = await Promise.all([
    prisma.leagueParticipant.findMany({
      where: { userId: viewerUserId, withdrawnAt: null },
      select: { leagueSeasonId: true },
    }),
    prisma.userFavoriteUser.findMany({
      where: { userId: viewerUserId },
      select: { favoriteUserId: true },
    }),
  ]);
  return {
    userId: viewerUserId,
    seasonIds: new Set(seasons.map((r) => r.leagueSeasonId)),
    followedUserIds: new Set(follows.map((r) => r.favoriteUserId)),
  };
}

/** The viewer and everyone they follow — whose matches a card prefers to show. */
function focusUserIdsOf(viewer: RailViewer): Set<string> {
  const ids = new Set(viewer.followedUserIds);
  if (viewer.userId) ids.add(viewer.userId);
  return ids;
}

function railAudience(game: LiveGameRow, viewer: RailViewer) {
  const playing = game.participants.map((p) => p.userId);
  const viewerIsPlaying = Boolean(viewer.userId && playing.includes(viewer.userId));
  const followingPlaying = playing.some((id) => viewer.followedUserIds.has(id));
  return {
    viewerIsPlaying,
    followingPlaying,
    isLeagueFixture: leagueOf(game) !== null,
    standingsFormat: isStandingsFormat(game),
    focusPlaying: viewerIsPlaying || followingPlaying,
  };
}

function toRailGame(
  game: LiveGameRow,
  picked: PickedRailMatch,
  viewer: RailViewer,
  phase: LiveRailPhase = 'live',
): LiveRailGame {
  const club = game.club ?? game.court?.club ?? null;
  const seasonId = game.parent?.leagueSeason?.id ?? null;
  const audience = railAudience(game, viewer);
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
    courtName: picked.summary.courtName ?? game.court?.name ?? null,
    viewerIsPlaying: audience.viewerIsPlaying,
    followedSeason: Boolean(seasonId && viewer.seasonIds.has(seasonId)),
    followingPlaying: audience.followingPlaying,
    phase,
    finishedAt: phase === 'finished' ? (game.finishedDate?.toISOString() ?? null) : null,
    matchPosition: picked.matchPosition,
    isPublic: game.isPublic,
    league: leagueOf(game),
    liveSummary: picked.summary,
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
export async function listLiveGames(
  params: ListLiveGamesParams,
  preloadedViewer?: RailViewer,
): Promise<LiveRailGame[]> {
  const limit = clampLiveRailLimit(params.limit ?? LIVE_RAIL_FIND_LIMIT);

  const where = appendStructuralFiltersToWhere({ cityId: params.cityId }, { liveOnly: true });

  const [rows, viewer] = await Promise.all([
    prisma.game.findMany({
      where,
      select: liveGameSelect,
      orderBy: { startTime: 'asc' },
      // Over-fetch a little: games without a usable live envelope drop out below.
      take: LIVE_RAIL_MAX_LIMIT * 2,
    }),
    preloadedViewer ?? loadRailViewer(params.viewerUserId),
  ]);

  const cards: LiveRailGame[] = [];
  for (const row of rows) {
    const picked = pickLiveMatch(row);
    if (!picked) continue;
    cards.push(toRailGame(row, picked, viewer));
  }

  return selectLiveRailGames(cards, limit);
}

/** Scoreboards only: a season shell or a bar night has no match to show. */
const FINISHED_RAIL_EXCLUDED_TYPES = ['LEAGUE_SEASON', 'BAR', 'EVENT'] as const;

/**
 * League fixtures, and standings games (tournaments, Americano, …) the viewer
 * or someone they follow is playing, that are in progress **without** a live
 * score — results typed in as they go, which is how every league fixture and
 * most tournaments are scored. Only games that started today (city day): a
 * forgotten `IN_PROGRESS` from last month is not "now".
 */
async function listProgressRailGames(
  cityId: string,
  dayStart: Date,
  viewer: RailViewer,
  skipIds: ReadonlySet<string>,
): Promise<LiveRailGame[]> {
  const focusUserIds = focusUserIdsOf(viewer);
  const rows = await prisma.game.findMany({
    where: {
      cityId,
      resultsStatus: 'IN_PROGRESS',
      startTime: { gte: dayStart },
      entityType: { notIn: [...FINISHED_RAIL_EXCLUDED_TYPES] },
      AND: [
        LIVE_RAIL_VISIBLE_WHERE,
        {
          OR: [
            { entityType: 'LEAGUE' },
            ...(focusUserIds.size > 0
              ? [
                  {
                    participants: {
                      some: { status: 'PLAYING' as const, userId: { in: [...focusUserIds] } },
                    },
                  },
                ]
              : []),
          ],
        },
      ],
    },
    select: liveGameSelect,
    orderBy: { startTime: 'asc' },
    take: LIVE_RAIL_MAX_LIMIT * 2,
  });

  const cards: LiveRailGame[] = [];
  for (const row of rows) {
    // Live-scored: already a watchable card.
    if (skipIds.has(row.id) || pickLiveMatch(row)) continue;
    const audience = railAudience(row, viewer);
    // A casual game in progress waits for its final result.
    if (!audience.isLeagueFixture && !(audience.standingsFormat && audience.focusPlaying)) continue;
    const picked = pickProgressMatch(row, focusUserIds);
    if (!picked) continue;
    cards.push(toRailGame(row, picked, viewer, 'inProgress'));
  }
  return cards;
}

/**
 * The Find / Home rail: {@link listLiveGames}, then (for clients that render
 * them) {@link listProgressRailGames}, then the city's games whose results
 * went final **today** in the city's own timezone, so a score entered after
 * the match — not live — is still seen around town until midnight.
 *
 * A finished game shows its last scored match (`matchPosition` says which).
 * Standings formats — tournaments, Americano and the like — only earn a
 * finished card when the viewer or someone they follow played; league
 * fixtures always do, and the cap never drops them ({@link selectLiveRailGames}).
 *
 * `finishedDate` is the finalisation time (re-stamped on re-finalise, cleared
 * on reopen). Walkovers and technical results never set it, so an unplayed
 * "result" never reaches the rail. Same privacy gate as live.
 */
export async function listCityRailGames(
  params: ListLiveGamesParams & {
    now?: Date;
    /** The client renders `inProgress` cards; older app builds would offer "Watch". */
    includeInProgress?: boolean;
  },
): Promise<LiveRailGame[]> {
  const limit = clampLiveRailLimit(params.limit ?? LIVE_RAIL_FIND_LIMIT);
  const now = params.now ?? new Date();
  const timezone = await getUserTimezoneFromCityId(params.cityId);
  const dayStart = startOfCalendarDate(formatCalendarDayKey(now, timezone), timezone);

  const viewer = await loadRailViewer(params.viewerUserId);
  const focusUserIds = focusUserIdsOf(viewer);

  const [live, finishedRows] = await Promise.all([
    listLiveGames({ ...params, limit: LIVE_RAIL_MAX_LIMIT }, viewer),
    prisma.game.findMany({
      where: {
        cityId: params.cityId,
        resultsStatus: 'FINAL',
        finishedDate: { gte: dayStart, lte: now },
        entityType: { notIn: [...FINISHED_RAIL_EXCLUDED_TYPES] },
        AND: [LIVE_RAIL_VISIBLE_WHERE],
      },
      select: liveGameSelect,
      orderBy: { finishedDate: 'desc' },
      take: LIVE_RAIL_MAX_LIMIT * 2,
    }),
  ]);

  const inProgress = params.includeInProgress
    ? await listProgressRailGames(params.cityId, dayStart, viewer, new Set(live.map((g) => g.id)))
    : [];

  const finished: LiveRailGame[] = [];
  for (const row of finishedRows) {
    if (!earnsRailCard(railAudience(row, viewer))) continue;
    const picked = pickFinalMatch(row, focusUserIds);
    if (!picked) continue;
    finished.push(toRailGame(row, picked, viewer, 'finished'));
  }

  return selectLiveRailGames([...live, ...inProgress, ...finished], limit);
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
  return toRailGame(row, picked, ANONYMOUS_VIEWER);
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
