/**
 * PRD 350 — "People to follow", step 5 of first-run onboarding.
 *
 * Ranks players in the viewer's city who actually turn up: finished games in the
 * last 60 days, most first. Blocked users are excluded **in both directions**,
 * as is the viewer and anyone they already follow. The projection is the same
 * safe public user shape every other public list uses
 * (`USER_SELECT_WITH_SPORT_PROFILES`) — no phone, email, wallet or preferences.
 */
import { GameStatus, ParticipantStatus, type Sport } from '@prisma/client';
import prisma from '../../config/database';
import { USER_SELECT_WITH_SPORT_PROFILES } from '../../utils/constants';

/** Onboarding shows 6–8 rows; the PRD's upper bound is the default. */
export const SUGGESTED_USERS_DEFAULT_LIMIT = 8;
export const SUGGESTED_USERS_MAX_LIMIT = 20;
/** Ranking window. */
export const SUGGESTED_USERS_WINDOW_DAYS = 60;
/** Display window behind "{{count}} games this month". */
export const SUGGESTED_USERS_RECENT_DAYS = 30;
/**
 * How many ranked ids to pull before the user rows are loaded. Some candidates
 * drop out (deactivated, sport disabled), so over-fetch rather than under-fill
 * the step.
 */
export const SUGGESTED_USERS_CANDIDATE_MULTIPLIER = 4;

export type SuggestedUser = {
  user: unknown;
  gamesThisMonth: number;
  gamesInWindow: number;
};

export function clampSuggestedLimit(raw: unknown): number {
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return SUGGESTED_USERS_DEFAULT_LIMIT;
  return Math.min(Math.trunc(parsed), SUGGESTED_USERS_MAX_LIMIT);
}

export function windowStart(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

type RankableCandidate = { userId: string; gamesInWindow: number };

/**
 * Pure ranking step: drop excluded ids, order by games desc then by id so the
 * list is stable between two calls with the same data, and cut to `limit`.
 */
export function rankSuggestedCandidates(
  candidates: RankableCandidate[],
  options: { excludeUserIds: Iterable<string>; limit: number },
): RankableCandidate[] {
  const excluded = new Set(options.excludeUserIds);
  return candidates
    .filter((candidate) => !excluded.has(candidate.userId))
    .slice()
    .sort((a, b) =>
      b.gamesInWindow !== a.gamesInWindow
        ? b.gamesInWindow - a.gamesInWindow
        : a.userId.localeCompare(b.userId),
    )
    .slice(0, Math.max(0, options.limit));
}

/** Blocks in either direction, plus the viewer and everyone already followed. */
export async function collectExcludedUserIds(viewerId: string): Promise<Set<string>> {
  const [blocks, follows] = await Promise.all([
    prisma.blockedUser.findMany({
      where: {
        OR: [{ userId: viewerId }, { blockedUserId: viewerId }],
      },
      select: { userId: true, blockedUserId: true },
    }),
    prisma.userFavoriteUser.findMany({
      where: { userId: viewerId },
      select: { favoriteUserId: true },
    }),
  ]);

  const excluded = new Set<string>([viewerId]);
  for (const block of blocks) {
    excluded.add(block.userId === viewerId ? block.blockedUserId : block.userId);
  }
  for (const follow of follows) {
    excluded.add(follow.favoriteUserId);
  }
  return excluded;
}

async function countFinishedGamesByUser(
  cityId: string,
  sport: Sport,
  since: Date,
  take: number,
): Promise<RankableCandidate[]> {
  const rows = await prisma.gameParticipant.groupBy({
    by: ['userId'],
    where: {
      status: ParticipantStatus.PLAYING,
      game: {
        cityId,
        sport,
        // `FINISHED` only: the PRD ranks on games that actually happened, and a
        // 60-day window is far shorter than the archiving horizon.
        status: GameStatus.FINISHED,
        // The window is "games **finished** in the last N days", so the bound is
        // `endTime`, not `startTime`. For a 90-minute match the two agree; for a
        // long-running entity (a league season, a multi-day tournament) that
        // started before the window and ended inside it, only `endTime` is
        // right. `endTime >= startTime`, so this can only ever add such a game,
        // never drop one `startTime` would have matched.
        endTime: { gte: since },
      },
    },
    _count: { _all: true },
    orderBy: { _count: { userId: 'desc' } },
    take,
  });

  return rows.map((row) => ({ userId: row.userId, gamesInWindow: row._count._all }));
}

async function countRecentGames(
  userIds: string[],
  cityId: string,
  sport: Sport,
  since: Date,
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.gameParticipant.groupBy({
    by: ['userId'],
    where: {
      userId: { in: userIds },
      status: ParticipantStatus.PLAYING,
      // Same bound as the ranking window, one row shorter — see above.
      game: { cityId, sport, status: GameStatus.FINISHED, endTime: { gte: since } },
    },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.userId, row._count._all]));
}

/**
 * Backfill when the city has no recent finished games yet (a brand-new city, or
 * a sport nobody has played there). Without this the step would be empty for
 * exactly the users who need it most.
 */
async function fallbackCityPlayers(
  cityId: string,
  sport: Sport,
  excluded: Set<string>,
  limit: number,
): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: {
      currentCityId: cityId,
      isActive: true,
      sportsEnabled: { has: sport },
      id: { notIn: [...excluded] },
    },
    select: { id: true },
    orderBy: [{ createdAt: 'desc' }],
    take: limit,
  });
  return rows.map((row) => row.id);
}

export async function getSuggestedUsers(options: {
  viewerId: string;
  cityId: string;
  sport: Sport;
  limit?: number;
  now?: Date;
}): Promise<SuggestedUser[]> {
  const limit = clampSuggestedLimit(options.limit);
  const now = options.now ?? new Date();
  const rankingSince = windowStart(now, SUGGESTED_USERS_WINDOW_DAYS);
  const recentSince = windowStart(now, SUGGESTED_USERS_RECENT_DAYS);

  const excluded = await collectExcludedUserIds(options.viewerId);

  const candidates = await countFinishedGamesByUser(
    options.cityId,
    options.sport,
    rankingSince,
    limit * SUGGESTED_USERS_CANDIDATE_MULTIPLIER + excluded.size,
  );

  const ranked = rankSuggestedCandidates(candidates, { excludeUserIds: excluded, limit });

  if (ranked.length < limit) {
    const known = new Set([...excluded, ...ranked.map((row) => row.userId)]);
    const filler = await fallbackCityPlayers(
      options.cityId,
      options.sport,
      known,
      limit - ranked.length,
    );
    for (const userId of filler) {
      ranked.push({ userId, gamesInWindow: 0 });
    }
  }

  if (ranked.length === 0) return [];

  const orderedIds = ranked.map((row) => row.userId);
  const [users, recentCounts] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: orderedIds }, isActive: true, sportsEnabled: { has: options.sport } },
      select: USER_SELECT_WITH_SPORT_PROFILES,
    }),
    countRecentGames(orderedIds, options.cityId, options.sport, recentSince),
  ]);

  const byId = new Map(users.map((user) => [user.id, user]));
  const result: SuggestedUser[] = [];
  for (const candidate of ranked) {
    const user = byId.get(candidate.userId);
    if (!user) continue;
    result.push({
      user,
      gamesInWindow: candidate.gamesInWindow,
      gamesThisMonth: recentCounts.get(candidate.userId) ?? 0,
    });
    if (result.length >= limit) break;
  }
  return result;
}
