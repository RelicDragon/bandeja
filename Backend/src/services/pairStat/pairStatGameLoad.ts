/**
 * PRD 352 — the only place that turns Prisma rows into {@link PairDetectionGame}.
 *
 * Kept separate from `partnerDetection.ts` so the detection rules stay pure and
 * testable without a database, and separate from `pairStat.service.ts` so the
 * batch rebuild and the per-game refresh share one select.
 */

import { EntityType, Prisma, ResultsStatus } from '@prisma/client';
import prisma from '../../config/database';
import {
  PAIR_COUNTED_ENTITY_TYPES,
  isTechnicalGameMetadata,
  type PairDetectionGame,
} from './partnerDetection';

/**
 * Games loaded in slices of this many. Rosters make each row fat (rounds →
 * matches → teams → players), so this is deliberately small: the rebuild must
 * never hold more than one slice in memory.
 */
export const PAIR_STAT_GAME_BATCH = 100;

export const PAIR_STAT_GAME_SELECT = {
  id: true,
  sport: true,
  cityId: true,
  startTime: true,
  entityType: true,
  resultsStatus: true,
  hasFixedTeams: true,
  metadata: true,
  fixedTeams: { select: { players: { select: { userId: true } } } },
  rounds: {
    select: {
      matches: {
        select: { teams: { select: { players: { select: { userId: true } } } } },
      },
    },
  },
  outcomes: { select: { userId: true, isWinner: true } },
} satisfies Prisma.GameSelect;

export type PairStatGameRow = Prisma.GameGetPayload<{ select: typeof PAIR_STAT_GAME_SELECT }>;

/**
 * Structural `where` for every game the pair leaderboard is allowed to read.
 * Mirrors rules 1–2 of `partnerDetection.ts`; rule 3 (neutral technical) lives
 * in `Game.metadata` and is filtered in {@link toPairDetectionGame}.
 */
export function pairCountedGameWhere(): Prisma.GameWhereInput {
  return {
    resultsStatus: ResultsStatus.FINAL,
    entityType: { in: [...PAIR_COUNTED_ENTITY_TYPES] as EntityType[] },
  };
}

/**
 * Re-exported so callers keep one import for "how do I filter pair games".
 * `pairCountedGameWhere` stays visibility-blind on purpose — see
 * `pairGameVisibility.ts`.
 */
export { pairVisibleGameWhere } from './pairGameVisibility';

export function toPairDetectionGame(row: PairStatGameRow): PairDetectionGame {
  return {
    gameId: row.id,
    entityType: row.entityType,
    resultsStatus: row.resultsStatus,
    sport: row.sport,
    cityId: row.cityId,
    playedAt: row.startTime,
    hasFixedTeams: row.hasFixedTeams,
    fixedTeams: row.fixedTeams.map((team) => ({
      playerIds: team.players.map((player) => player.userId),
    })),
    matches: row.rounds.flatMap((round) =>
      round.matches.map((match) => ({
        teams: match.teams.map((team) => ({
          playerIds: team.players.map((player) => player.userId),
        })),
      })),
    ),
    outcomeUserIds: row.outcomes.map((outcome) => outcome.userId),
    winnerUserIds: row.outcomes.filter((o) => o.isWinner).map((o) => o.userId),
    technical: isTechnicalGameMetadata(row.metadata),
  };
}

/** Load one slice of games by id, in the order the caller asked for. */
export async function loadPairDetectionGames(
  gameIds: readonly string[],
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<PairDetectionGame[]> {
  if (gameIds.length === 0) return [];
  const rows = await client.game.findMany({
    where: { id: { in: [...gameIds] }, ...pairCountedGameWhere() },
    select: PAIR_STAT_GAME_SELECT,
  });
  return rows.map(toPairDetectionGame);
}

/**
 * Walk every counted game in id order, `PAIR_STAT_GAME_BATCH` at a time, and
 * hand each slice to `onBatch`. Nothing accumulates here — the caller decides
 * what to keep, which is what makes the admin rebuild memory-safe.
 */
export async function forEachPairDetectionGameBatch(
  where: Prisma.GameWhereInput,
  onBatch: (games: PairDetectionGame[]) => Promise<void>,
): Promise<number> {
  let cursor: string | undefined;
  let seen = 0;

  for (;;) {
    const rows: PairStatGameRow[] = await prisma.game.findMany({
      where: { ...pairCountedGameWhere(), ...where },
      select: PAIR_STAT_GAME_SELECT,
      orderBy: { id: 'asc' },
      take: PAIR_STAT_GAME_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;

    seen += rows.length;
    cursor = rows[rows.length - 1]!.id;
    await onBatch(rows.map(toPairDetectionGame));

    if (rows.length < PAIR_STAT_GAME_BATCH) break;
  }

  return seen;
}
