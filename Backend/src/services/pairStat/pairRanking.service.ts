/**
 * PRD 352 — reads for the Pairs tab, the pair sheet and Profile → Your partners.
 *
 * Two paths, one DTO:
 *
 * - `period = 'all'` reads the materialized `PairStat` table and sorts, pages
 *   and ranks **in Postgres**. Only one page is ever materialized in Node.
 * - `period = '10' | '30'` cannot come from `PairStat` (it stores all-time
 *   totals), so it re-derives the window from the games themselves, batch by
 *   batch. The scan is bounded by city × sport × window, which is a small slice
 *   of one city's recent play, and it reuses the exact same pure detection
 *   rules so the two paths can never disagree about what a pair is.
 *
 * Paging is by opaque cursor. The list is a *ranking*, so the cursor carries an
 * offset into the ordering plus a fingerprint of the filters it was produced
 * for: a client that changes sort or period mid-scroll gets a 400 instead of a
 * silently interleaved page. `/rankings/user-context` returns the whole
 * leaderboard unpaginated; this endpoint deliberately does not copy that.
 */

import { Prisma, type Sport } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { computeChemistry, winRatePercent } from './chemistry';
import { decodePairCursor, encodePairCursor, pairCursorFingerprint } from './pairCursor';
import { formatPairParam, orderPairIds, pairKey, type PairIds } from './pairKey';
import {
  PAIR_MIN_GAMES,
  PARTNER_MIN_GAMES,
  combinedLevelOf,
  orderPairCandidates,
  pairPeriodSince,
  type PairPeriod,
  type PairSort,
} from './pairRankingOrder';
import { aggregatePairFacts, type PairStatAggregate } from './pairStatAggregate';
import { detectPairGameFacts, isPairCountedGame, type PairGameFact } from './partnerDetection';
import {
  PAIR_STAT_GAME_SELECT,
  forEachPairDetectionGameBatch,
  pairCountedGameWhere,
  pairVisibleGameWhere,
  toPairDetectionGame,
} from './pairStatGameLoad';

export const PAIR_PAGE_SIZE = 20;
export const PAIR_PAGE_SIZE_MAX = 50;

const PAIR_MEMBER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
  isPremium: true,
  showPremiumStatus: true,
} as const;

export interface PairMemberDto {
  id: string;
  firstName: string;
  lastName: string | null;
  avatar: string | null;
  isPremium: boolean;
  showPremiumStatus: boolean;
  level: number | null;
}

export interface PairEntryDto {
  /** The `?pair=a,b` value — always in `userAId < userBId` order. */
  pairId: string;
  rank: number;
  userA: PairMemberDto;
  userB: PairMemberDto;
  games: number;
  wins: number;
  /** 0–100, one decimal. */
  winRate: number;
  combinedLevel: number | null;
  /** Percentage points above the members' mean solo win rate, or `null`. */
  chemistry: number | null;
  lastPlayedAt: string | null;
  isViewerPair: boolean;
  /** Existing two-person `UserTeam`, when the pair already formalized one. */
  teamId: string | null;
}

export interface PairLeaderboardResult {
  pairs: PairEntryDto[];
  nextCursor: string | null;
  total: number;
  /** Mirrors `/rankings/user-context`'s `userRank`: the viewer's best pair. */
  me: { rank: number; pairId: string } | null;
}

export interface PairLeaderboardQuery {
  viewerId: string;
  cityId: string;
  sport: Sport;
  period: PairPeriod;
  sort: PairSort;
  cursor?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

function fingerprintOf(
  query: Pick<PairLeaderboardQuery, 'cityId' | 'sport' | 'period' | 'sort'>,
): string {
  return pairCursorFingerprint(query);
}

function resolveOffset(query: PairLeaderboardQuery): number {
  if (!query.cursor) return 0;
  const decoded = decodePairCursor(query.cursor);
  if (!decoded || decoded.fingerprint !== fingerprintOf(query)) {
    throw new ApiError(400, 'errors.pairs.invalidCursor');
  }
  return decoded.offset;
}

function resolveLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit) || limit <= 0) return PAIR_PAGE_SIZE;
  return Math.min(Math.trunc(limit), PAIR_PAGE_SIZE_MAX);
}

// ---------------------------------------------------------------------------
// SQL ordering (materialized path)
// ---------------------------------------------------------------------------

const WIN_RATE_SQL = Prisma.sql`(CASE WHEN "games" > 0 THEN "wins"::float / "games" ELSE 0 END)`;

/**
 * The SQL twin of `comparePairCandidates`. Both chains end on the pair ids, so
 * the order — and therefore every cursor offset — is total and stable.
 */
function pairOrderBySql(sort: PairSort): Prisma.Sql {
  const tail = Prisma.sql`"lastPlayedAt" DESC NULLS LAST, "userAId" ASC, "userBId" ASC`;
  if (sort === 'games') {
    return Prisma.sql`"games" DESC, ${WIN_RATE_SQL} DESC, ${tail}`;
  }
  if (sort === 'level') {
    return Prisma.sql`"combinedLevel" DESC NULLS LAST, ${WIN_RATE_SQL} DESC, "games" DESC, ${tail}`;
  }
  return Prisma.sql`${WIN_RATE_SQL} DESC, "games" DESC, ${tail}`;
}

interface PairStatRow {
  userAId: string;
  userBId: string;
  games: number;
  wins: number;
  lastPlayedAt: Date | null;
  combinedLevel: number | null;
}

// ---------------------------------------------------------------------------
// Shared hydration
// ---------------------------------------------------------------------------

interface RankedPair extends PairStatRow {
  rank: number;
}

interface SoloCounts {
  games: number;
  wins: number;
}

async function loadMembers(userIds: readonly string[], sport: Sport): Promise<Map<string, PairMemberDto>> {
  const out = new Map<string, PairMemberDto>();
  if (userIds.length === 0) return out;

  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
    select: {
      ...PAIR_MEMBER_SELECT,
      sportProfiles: { where: { sport }, select: { level: true } },
    },
  });

  for (const user of users) {
    out.set(user.id, {
      id: user.id,
      firstName: user.firstName ?? '',
      lastName: user.lastName,
      avatar: user.avatar,
      isPremium: user.isPremium,
      showPremiumStatus: user.showPremiumStatus,
      level: user.sportProfiles[0]?.level ?? null,
    });
  }
  return out;
}

/** All-time solo win/loss counters, straight off `UserSportProfile`. */
async function loadSoloCounts(
  userIds: readonly string[],
  sport: Sport,
): Promise<Map<string, SoloCounts>> {
  const out = new Map<string, SoloCounts>();
  if (userIds.length === 0) return out;

  const profiles = await prisma.userSportProfile.findMany({
    where: { userId: { in: [...userIds] }, sport },
    select: { userId: true, gamesPlayed: true, gamesWon: true },
  });
  for (const profile of profiles) {
    out.set(profile.userId, { games: profile.gamesPlayed, wins: profile.gamesWon });
  }
  return out;
}

/**
 * Two-person `UserTeam` ids for the given pairs. A pair with a formal team
 * routes straight to `/user-team/:id` instead of the ad-hoc pair sheet.
 */
async function loadTeamIds(pairs: readonly PairIds[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (pairs.length === 0) return out;

  const userIds = [...new Set(pairs.flatMap((pair) => [pair.userAId, pair.userBId]))];
  const rows = await prisma.userTeamMember.findMany({
    where: { userId: { in: userIds }, team: { size: 2 } },
    select: { teamId: true, userId: true },
  });

  const membersByTeam = new Map<string, string[]>();
  for (const row of rows) {
    const list = membersByTeam.get(row.teamId);
    if (list) list.push(row.userId);
    else membersByTeam.set(row.teamId, [row.userId]);
  }

  const wanted = new Set(pairs.map((pair) => pairKey(pair.userAId, pair.userBId)));
  for (const [teamId, members] of membersByTeam) {
    if (members.length !== 2) continue;
    const key = pairKey(members[0]!, members[1]!);
    if (!wanted.has(key) || out.has(key)) continue;
    out.set(key, teamId);
  }
  return out;
}

function roundWinRate(wins: number, games: number): number {
  const rate = winRatePercent(wins, games) ?? 0;
  return Math.round(rate * 10) / 10;
}

async function hydratePairs(
  ranked: readonly RankedPair[],
  sport: Sport,
  viewerId: string,
  soloOverride?: Map<string, SoloCounts>,
): Promise<PairEntryDto[]> {
  if (ranked.length === 0) return [];

  const pairs: PairIds[] = ranked.map((row) => orderPairIds(row.userAId, row.userBId));
  const userIds = [...new Set(pairs.flatMap((pair) => [pair.userAId, pair.userBId]))];

  const [members, solo, teamIds] = await Promise.all([
    loadMembers(userIds, sport),
    soloOverride ? Promise.resolve(soloOverride) : loadSoloCounts(userIds, sport),
    loadTeamIds(pairs),
  ]);

  const fallbackMember = (id: string): PairMemberDto => ({
    id,
    firstName: '',
    lastName: null,
    avatar: null,
    isPremium: false,
    showPremiumStatus: false,
    level: null,
  });

  return ranked.map((row) => {
    const key = pairKey(row.userAId, row.userBId);
    const { chemistry } = computeChemistry({
      pair: { games: row.games, wins: row.wins },
      soloA: solo.get(row.userAId) ?? { games: 0, wins: 0 },
      soloB: solo.get(row.userBId) ?? { games: 0, wins: 0 },
    });

    return {
      pairId: formatPairParam(row.userAId, row.userBId),
      rank: row.rank,
      userA: members.get(row.userAId) ?? fallbackMember(row.userAId),
      userB: members.get(row.userBId) ?? fallbackMember(row.userBId),
      games: row.games,
      wins: row.wins,
      winRate: roundWinRate(row.wins, row.games),
      combinedLevel: row.combinedLevel,
      chemistry,
      lastPlayedAt: row.lastPlayedAt ? row.lastPlayedAt.toISOString() : null,
      isViewerPair: row.userAId === viewerId || row.userBId === viewerId,
      teamId: teamIds.get(key) ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Materialized path (period = all)
// ---------------------------------------------------------------------------

async function readMaterializedPage(
  query: PairLeaderboardQuery,
  offset: number,
  limit: number,
): Promise<{ ranked: RankedPair[]; total: number; meRank: number | null; mePairId: string | null }> {
  const where = Prisma.sql`"sport" = ${query.sport}::"Sport" AND "cityId" = ${query.cityId} AND "games" >= ${PAIR_MIN_GAMES}`;

  const [rows, totalRows] = await Promise.all([
    prisma.$queryRaw<PairStatRow[]>(Prisma.sql`
      SELECT "userAId", "userBId", "games", "wins", "lastPlayedAt", "combinedLevel"
      FROM "PairStat"
      WHERE ${where}
      ORDER BY ${pairOrderBySql(query.sort)}
      LIMIT ${limit} OFFSET ${offset}
    `),
    prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT COUNT(*)::integer AS count FROM "PairStat" WHERE ${where}
    `),
  ]);

  const ranked = rows.map((row, index) => ({ ...row, rank: offset + index + 1 }));
  const total = totalRows[0]?.count ?? 0;

  // The viewer's best pair, and where it sits in the *whole* ordering. Only
  // resolved for the first page — later pages already carry the context.
  let meRank: number | null = null;
  let mePairId: string | null = null;
  if (offset === 0) {
    const meRows = await prisma.$queryRaw<{ rn: number; userAId: string; userBId: string }[]>(
      Prisma.sql`
        WITH ranked AS (
          SELECT
            "userAId",
            "userBId",
            ROW_NUMBER() OVER (ORDER BY ${pairOrderBySql(query.sort)})::integer AS rn
          FROM "PairStat"
          WHERE ${where}
        )
        SELECT * FROM ranked
        WHERE "userAId" = ${query.viewerId} OR "userBId" = ${query.viewerId}
        ORDER BY rn ASC
        LIMIT 1
      `,
    );
    const best = meRows[0];
    if (best) {
      meRank = best.rn;
      mePairId = formatPairParam(best.userAId, best.userBId);
    }
  }

  return { ranked, total, meRank, mePairId };
}

// ---------------------------------------------------------------------------
// Windowed path (period = 10 | 30)
// ---------------------------------------------------------------------------

interface WindowScan {
  aggregates: PairStatAggregate[];
  solo: Map<string, SoloCounts>;
}

/**
 * Re-derive pair totals and solo totals for one city, sport and window.
 *
 * Solo counts come from the same scan rather than `UserSportProfile` — the
 * profile counters are all-time, and a 30-day chemistry number computed against
 * an all-time baseline would compare two different things.
 */
async function scanWindow(cityId: string, sport: Sport, since: Date): Promise<WindowScan> {
  const facts: PairGameFact[] = [];
  const solo = new Map<string, SoloCounts>();

  await forEachPairDetectionGameBatch(
    { cityId, sport, startTime: { gte: since } },
    async (games) => {
      for (const game of games) {
        if (!isPairCountedGame(game)) continue;
        const winners = new Set(game.winnerUserIds);
        for (const userId of game.outcomeUserIds) {
          const current = solo.get(userId);
          if (current) {
            current.games += 1;
            if (winners.has(userId)) current.wins += 1;
          } else {
            solo.set(userId, { games: 1, wins: winners.has(userId) ? 1 : 0 });
          }
        }
        facts.push(...detectPairGameFacts(game));
      }
    },
  );

  return { aggregates: aggregatePairFacts(facts), solo };
}

async function readWindowedPage(
  query: PairLeaderboardQuery,
  offset: number,
  limit: number,
  since: Date,
): Promise<{
  ranked: RankedPair[];
  total: number;
  meRank: number | null;
  mePairId: string | null;
  solo: Map<string, SoloCounts>;
}> {
  const { aggregates, solo } = await scanWindow(query.cityId, query.sport, since);

  const userIds = [...new Set(aggregates.flatMap((a) => [a.userAId, a.userBId]))];
  const levels = new Map<string, number>();
  if (userIds.length > 0) {
    const profiles = await prisma.userSportProfile.findMany({
      where: { userId: { in: userIds }, sport: query.sport },
      select: { userId: true, level: true },
    });
    for (const profile of profiles) levels.set(profile.userId, profile.level);
  }

  const ordered = orderPairCandidates(
    aggregates.map((aggregate) => ({
      userAId: aggregate.userAId,
      userBId: aggregate.userBId,
      games: aggregate.games,
      wins: aggregate.wins,
      lastPlayedAt: aggregate.lastPlayedAt,
      combinedLevel: combinedLevelOf(
        levels.get(aggregate.userAId) ?? null,
        levels.get(aggregate.userBId) ?? null,
      ),
    })),
    query.sort,
  );

  const page = ordered.slice(offset, offset + limit).map((candidate, index) => ({
    userAId: candidate.userAId,
    userBId: candidate.userBId,
    games: candidate.games,
    wins: candidate.wins,
    lastPlayedAt: candidate.lastPlayedAt,
    combinedLevel: candidate.combinedLevel,
    rank: offset + index + 1,
  }));

  const meIndex = ordered.findIndex(
    (candidate) => candidate.userAId === query.viewerId || candidate.userBId === query.viewerId,
  );

  return {
    ranked: page,
    total: ordered.length,
    meRank: meIndex >= 0 ? meIndex + 1 : null,
    mePairId:
      meIndex >= 0
        ? formatPairParam(ordered[meIndex]!.userAId, ordered[meIndex]!.userBId)
        : null,
    solo,
  };
}

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

export async function getPairLeaderboard(
  query: PairLeaderboardQuery,
): Promise<PairLeaderboardResult> {
  const offset = resolveOffset(query);
  const limit = resolveLimit(query.limit);
  const since = pairPeriodSince(query.period);

  // Only the windowed path carries solo counts (the materialized table holds
  // all-time totals), so keep the two branches distinct rather than narrowing a
  // union whose members differ by one optional field.
  const windowed = since ? await readWindowedPage(query, offset, limit, since) : null;
  const result = windowed ?? (await readMaterializedPage(query, offset, limit));
  const solo = windowed?.solo;
  const pairs = await hydratePairs(result.ranked, query.sport, query.viewerId, solo);

  const consumed = offset + pairs.length;
  return {
    pairs,
    nextCursor:
      consumed < result.total
        ? encodePairCursor({ offset: consumed, fingerprint: fingerprintOf(query) })
        : null,
    total: result.total,
    me:
      result.meRank !== null && result.mePairId
        ? { rank: result.meRank, pairId: result.mePairId }
        : null,
  };
}

export interface PairRecentGameDto {
  id: string;
  name: string | null;
  entityType: string;
  sport: Sport;
  startTime: string;
  clubName: string | null;
  won: boolean;
}

export interface PairDetailDto extends Omit<PairEntryDto, 'rank'> {
  recentGames: PairRecentGameDto[];
}

const PAIR_RECENT_GAME_LIMIT = 5;
/** Both-players-present candidates scanned to find {@link PAIR_RECENT_GAME_LIMIT} real ones. */
const PAIR_RECENT_GAME_CANDIDATES = 20;

/**
 * The pair sheet payload: totals across every city for the sport, plus the last
 * five games the two actually played on the same side.
 */
export async function getPairDetail(
  ids: PairIds,
  sport: Sport,
  viewerId: string,
): Promise<PairDetailDto> {
  const stats = await prisma.pairStat.findMany({
    where: { sport, userAId: ids.userAId, userBId: ids.userBId },
    select: { games: true, wins: true, lastPlayedAt: true, combinedLevel: true },
  });

  const totals = stats.reduce(
    (acc, row) => ({
      games: acc.games + row.games,
      wins: acc.wins + row.wins,
      lastPlayedAt:
        row.lastPlayedAt && (!acc.lastPlayedAt || row.lastPlayedAt > acc.lastPlayedAt)
          ? row.lastPlayedAt
          : acc.lastPlayedAt,
      combinedLevel: acc.combinedLevel ?? row.combinedLevel,
    }),
    { games: 0, wins: 0, lastPlayedAt: null as Date | null, combinedLevel: null as number | null },
  );

  const [entry] = await hydratePairs([{ ...ids, ...totals, rank: 0 }], sport, viewerId);
  if (!entry) throw new ApiError(404, 'errors.pairs.notFound');

  const recentGames = await loadRecentPairGames(ids, sport, viewerId);
  return {
    pairId: entry.pairId,
    userA: entry.userA,
    userB: entry.userB,
    games: entry.games,
    wins: entry.wins,
    winRate: entry.winRate,
    combinedLevel: entry.combinedLevel,
    chemistry: entry.chemistry,
    lastPlayedAt: entry.lastPlayedAt,
    isViewerPair: entry.isViewerPair,
    teamId: entry.teamId,
    recentGames,
  };
}

/**
 * The last games the two actually played **on the same side**.
 *
 * Both-players-present is only a prefilter: in a rotating format they may have
 * been opponents. The candidates are re-run through the same detection rules
 * the leaderboard uses, so the sheet can never show a game that did not count.
 *
 * Scoped to `pairVisibleGameWhere(viewerId)`: the totals above may count a
 * private game, but this list **names** games, so it only ever shows the ones
 * the viewer could already open.
 */
async function loadRecentPairGames(
  ids: PairIds,
  sport: Sport,
  viewerId: string,
): Promise<PairRecentGameDto[]> {
  const candidates = await prisma.game.findMany({
    where: {
      sport,
      ...pairCountedGameWhere(),
      outcomes: { some: { userId: ids.userAId } },
      AND: [
        { outcomes: { some: { userId: ids.userBId } } },
        pairVisibleGameWhere(viewerId),
      ],
    },
    select: {
      ...PAIR_STAT_GAME_SELECT,
      name: true,
      club: { select: { name: true } },
    },
    orderBy: { startTime: 'desc' },
    take: PAIR_RECENT_GAME_CANDIDATES,
  });

  const wanted = pairKey(ids.userAId, ids.userBId);
  const out: PairRecentGameDto[] = [];

  for (const candidate of candidates) {
    if (out.length >= PAIR_RECENT_GAME_LIMIT) break;
    const fact = detectPairGameFacts(toPairDetectionGame(candidate)).find(
      (item) => pairKey(item.userAId, item.userBId) === wanted,
    );
    if (!fact) continue;
    out.push({
      id: candidate.id,
      name: candidate.name,
      entityType: candidate.entityType,
      sport: candidate.sport,
      startTime: candidate.startTime.toISOString(),
      clubName: candidate.club?.name ?? null,
      won: fact.won,
    });
  }

  return out;
}

export interface PartnerDto {
  pairId: string;
  partner: PairMemberDto;
  games: number;
  wins: number;
  winRate: number;
  chemistry: number | null;
  lastPlayedAt: string | null;
  teamId: string | null;
}

/**
 * Profile → Statistics → Your partners. Totals across every city for the sport,
 * floor of {@link PARTNER_MIN_GAMES} games together, ordered by win rate.
 */
export async function getUserPartners(userId: string, sport: Sport): Promise<PartnerDto[]> {
  const rows = await prisma.pairStat.findMany({
    where: { sport, OR: [{ userAId: userId }, { userBId: userId }] },
    select: {
      userAId: true,
      userBId: true,
      games: true,
      wins: true,
      lastPlayedAt: true,
      combinedLevel: true,
    },
  });

  const byPartner = new Map<string, PairStatRow>();
  for (const row of rows) {
    const partnerId = row.userAId === userId ? row.userBId : row.userAId;
    const existing = byPartner.get(partnerId);
    if (!existing) {
      byPartner.set(partnerId, { ...row });
      continue;
    }
    existing.games += row.games;
    existing.wins += row.wins;
    if (row.lastPlayedAt && (!existing.lastPlayedAt || row.lastPlayedAt > existing.lastPlayedAt)) {
      existing.lastPlayedAt = row.lastPlayedAt;
    }
    existing.combinedLevel = existing.combinedLevel ?? row.combinedLevel;
  }

  const qualified = [...byPartner.entries()].filter(([, row]) => row.games >= PARTNER_MIN_GAMES);
  if (qualified.length === 0) return [];

  const ranked: RankedPair[] = qualified.map(([, row]) => ({ ...row, rank: 0 }));
  const entries = await hydratePairs(ranked, sport, userId);

  return entries
    .map((entry) => {
      const partner = entry.userA.id === userId ? entry.userB : entry.userA;
      return {
        pairId: entry.pairId,
        partner,
        games: entry.games,
        wins: entry.wins,
        winRate: entry.winRate,
        chemistry: entry.chemistry,
        lastPlayedAt: entry.lastPlayedAt,
        teamId: entry.teamId,
      };
    })
    .sort((a, b) => {
      if (a.winRate !== b.winRate) return b.winRate - a.winRate;
      if (a.games !== b.games) return b.games - a.games;
      return a.partner.id < b.partner.id ? -1 : 1;
    });
}
