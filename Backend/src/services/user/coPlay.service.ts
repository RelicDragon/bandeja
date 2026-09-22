/**
 * Co-play (PRD 361) — "people I have actually played with".
 *
 * One predicate, written once, reused by the invite Search zero-query state
 * today and by the profile "last played together" line later:
 *
 *   both users `GameParticipant.status = PLAYING` in the same game,
 *   the game has `resultsStatus = FINAL`,
 *   the game started inside the last `CO_PLAY_WINDOW_MONTHS`,
 *   the entity type is not BAR / LEAGUE_SEASON / EVENT.
 *
 * IN_QUEUE, INVITED, GUEST and NON_PLAYING never count, so a queued or invited
 * seat is not "played with", and a trainer (NON_PLAYING) is not a co-player.
 * BAR is listed alongside the two unscored types the PRD names because it can
 * never reach FINAL either (`entityCapabilities.hasResults === false`); keeping
 * it explicit means a future BAR scoring change cannot silently widen the list.
 *
 * `UserInteraction` (tap count) is only a tiebreaker. It is not evidence of
 * having played together.
 */
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';

/** Shared finished games older than this never count. */
export const CO_PLAY_WINDOW_MONTHS = 12;

/** How many recent co-players the invite Search zero-query state guarantees. */
export const CO_PLAY_TOP_LIMIT = 10;

export interface CoPlayRow {
  userId: string;
  gamesTogetherCount: number;
  lastPlayedTogetherAt: Date;
}

/**
 * Every co-player of `viewerId` inside the window, most recent shared game
 * first, then by number of shared games.
 */
export async function loadCoPlayers(viewerId: string): Promise<CoPlayRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{ userId: string; count: number; lastPlayedTogetherAt: Date }>
  >(
    Prisma.sql`
      SELECT gp2."userId" AS "userId",
             COUNT(DISTINCT g.id)::int AS count,
             MAX(g."startTime") AS "lastPlayedTogetherAt"
      FROM "GameParticipant" gp1
      INNER JOIN "GameParticipant" gp2 ON gp1."gameId" = gp2."gameId"
      INNER JOIN "Game" g ON g.id = gp1."gameId"
      WHERE gp1."userId" = ${viewerId}
        AND gp1.status = 'PLAYING'::"ParticipantStatus"
        AND gp2.status = 'PLAYING'::"ParticipantStatus"
        AND gp2."userId" <> gp1."userId"
        AND g."resultsStatus" = 'FINAL'::"ResultsStatus"
        AND g."startTime" >= now() - (${CO_PLAY_WINDOW_MONTHS}::int * interval '1 month')
        AND g."entityType" NOT IN ('BAR'::"EntityType", 'LEAGUE_SEASON'::"EntityType", 'EVENT'::"EntityType")
      GROUP BY gp2."userId"
      ORDER BY MAX(g."startTime") DESC, COUNT(DISTINCT g.id) DESC
    `,
  );
  return rows.map((row) => ({
    userId: row.userId,
    gamesTogetherCount: row.count,
    lastPlayedTogetherAt: row.lastPlayedTogetherAt,
  }));
}

/** Users blocked by the viewer plus users who blocked the viewer. */
export async function loadBlockedUserIds(viewerId: string): Promise<Set<string>> {
  const edges = await prisma.blockedUser.findMany({
    where: { OR: [{ userId: viewerId }, { blockedUserId: viewerId }] },
    select: { userId: true, blockedUserId: true },
  });
  const ids = new Set<string>();
  for (const edge of edges) {
    ids.add(edge.userId === viewerId ? edge.blockedUserId : edge.userId);
  }
  return ids;
}

/**
 * The first `limit` co-players (already ordered by recency) that are still
 * invitable. Pure; used to decide which co-players must be loaded even when
 * they live outside the Browse city.
 */
export function pickTopCoPlayerIds(
  rows: ReadonlyArray<Pick<CoPlayRow, 'userId'>>,
  excludedIds: ReadonlySet<string>,
  limit: number = CO_PLAY_TOP_LIMIT,
): string[] {
  const out: string[] = [];
  for (const row of rows) {
    if (excludedIds.has(row.userId)) continue;
    out.push(row.userId);
    if (out.length >= limit) break;
  }
  return out;
}

export interface CoPlayRankable {
  lastPlayedTogetherAt: Date | string | null | undefined;
  gamesTogetherCount: number;
  interactionCount: number;
}

function recencyMs(value: CoPlayRankable['lastPlayedTogetherAt']): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Empty-query order for the invite list (PRD 361):
 * `lastPlayedTogetherAt DESC NULLS LAST, gamesTogetherCount DESC, interactionCount DESC`.
 * Pure and stable: equal rows keep their input order.
 */
export function rankInvitablePlayers<T extends CoPlayRankable>(players: readonly T[]): T[] {
  return players
    .map((player, index) => ({ player, index }))
    .sort((a, b) => {
      const aRecency = recencyMs(a.player.lastPlayedTogetherAt);
      const bRecency = recencyMs(b.player.lastPlayedTogetherAt);
      if (aRecency !== bRecency) {
        if (aRecency == null) return 1;
        if (bRecency == null) return -1;
        return bRecency - aRecency;
      }
      if (a.player.gamesTogetherCount !== b.player.gamesTogetherCount) {
        return b.player.gamesTogetherCount - a.player.gamesTogetherCount;
      }
      if (a.player.interactionCount !== b.player.interactionCount) {
        return b.player.interactionCount - a.player.interactionCount;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.player);
}
