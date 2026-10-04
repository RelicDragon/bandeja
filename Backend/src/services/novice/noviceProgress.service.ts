/**
 * Novice mode (PRD #358) — counted games, rank, debut host, organizer credit.
 *
 * Every entry point **recounts from the DB** (never increments), so calling it
 * twice, from two hooks, or after a result edit is safe. Rank is monotonic.
 *
 * Hooks call {@link onGameEndedForNovice} **post-commit**, in its own
 * transaction per user: the counted-game rule reads committed FINAL status /
 * GameOutcome rows, and — like the attendance, pair-stat and referral hooks next
 * to it — a derived counter must never be able to roll back or slow down
 * result finalization. Each per-user transaction first takes `FOR UPDATE` on
 * the user row, so two games finalizing at once serialize per user and the
 * later recount sees both games (READ COMMITTED re-snapshots per statement).
 */
import { EntityType, ParticipantRole, Prisma } from '@prisma/client';
import { NOVICE_MAX_RANK } from '@bandeja/shared/novice';
import prisma from '../../config/database';
import notificationService from '../notification.service';
import { NotificationType } from '../../types/notifications.types';
import { grantNoviceHostLadder } from '../achievements/noviceHostGrant.service';
import {
  NOVICE_ENDED_GAME_STATUSES,
  NOVICE_NON_COUNTING_ENTITY_TYPES,
  countedGamesWhere,
  nextMilestoneSeenRank,
  planNoviceRecount,
} from './noviceRules';
import { buildNoviceRankUpPushPayload } from './novicePushCopy';

export type NoviceRecountResult = {
  userId: string;
  countedGames: number;
  previousRank: number;
  newRank: number;
  unlockedAll: boolean;
  /** Set when this recount established the debut. */
  debutGameId: string | null;
  /** Host credited by this recount's debut (null: no debut now, or self-hosted). */
  debutHostUserId: string | null;
  /** The user's (possibly older) debut host — credited with Ambassador on Regular. */
  storedDebutHostUserId: string | null;
};

/**
 * Recompute one user's counted games and raise their rank. Must run inside a
 * transaction; locks the user row first.
 */
export async function recountNoviceProgress(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<NoviceRecountResult | null> {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      noviceCountedGames: true,
      noviceRank: true,
      noviceDebutGameId: true,
      noviceDebutHostUserId: true,
      noviceUnlockedAllAt: true,
    },
  });
  if (!user) return null;

  const where = countedGamesWhere(userId);
  const countedGames = await tx.gameParticipant.count({ where });

  const needsDebut =
    user.noviceDebutGameId == null && user.noviceCountedGames <= 0 && countedGames >= 1;
  let firstCountedGame: { gameId: string; ownerUserId: string | null } | null = null;
  if (needsDebut) {
    const first = await tx.gameParticipant.findFirst({
      where,
      orderBy: [{ game: { startTime: 'asc' } }, { gameId: 'asc' }],
      select: {
        gameId: true,
        game: {
          select: {
            participants: {
              where: { role: ParticipantRole.OWNER },
              select: { userId: true },
              orderBy: { joinedAt: 'asc' },
              take: 1,
            },
          },
        },
      },
    });
    if (first) {
      firstCountedGame = {
        gameId: first.gameId,
        ownerUserId: first.game.participants[0]?.userId ?? null,
      };
    }
  }

  const plan = planNoviceRecount({ userId, stored: user, countedGames, firstCountedGame });
  if (plan.changed) {
    await tx.user.update({
      where: { id: userId },
      data: {
        noviceCountedGames: plan.countedGames,
        noviceRank: plan.newRank,
        ...(plan.debut
          ? {
              noviceDebutGameId: plan.debut.gameId,
              noviceDebutHostUserId: plan.debut.hostUserId,
            }
          : {}),
      },
    });
  }

  return {
    userId,
    countedGames: plan.countedGames,
    previousRank: plan.previousRank,
    newRank: plan.newRank,
    unlockedAll: user.noviceUnlockedAllAt != null,
    debutGameId: plan.debut?.gameId ?? null,
    debutHostUserId: plan.debut?.hostUserId ?? null,
    storedDebutHostUserId: plan.debut ? plan.debut.hostUserId : user.noviceDebutHostUserId,
  };
}

/**
 * Organizer credit for one recount (same transaction): Talent Scout to the host
 * of a debut established now; Ambassador to the debut host when the newcomer
 * crosses into Regular. Both ladders recount and are idempotent.
 */
export async function grantNoviceOrganizerCredit(
  tx: Prisma.TransactionClient,
  result: NoviceRecountResult,
): Promise<void> {
  if (result.debutHostUserId) {
    await grantNoviceHostLadder({
      hostUserId: result.debutHostUserId,
      ruleKind: 'HABIT_TALENT_SCOUT',
      newcomerUserId: result.userId,
      sourceGameId: result.debutGameId,
      tx,
    });
  }
  const reachedRegular =
    result.previousRank < NOVICE_MAX_RANK && result.newRank >= NOVICE_MAX_RANK;
  if (reachedRegular && result.storedDebutHostUserId) {
    await grantNoviceHostLadder({
      hostUserId: result.storedDebutHostUserId,
      ruleKind: 'HABIT_AMBASSADOR',
      newcomerUserId: result.userId,
      tx,
    });
  }
}

/** Recount + organizer credit for one user in its own transaction. */
export async function refreshNoviceProgressForUser(
  userId: string,
): Promise<NoviceRecountResult | null> {
  return prisma.$transaction(async (tx) => {
    const result = await recountNoviceProgress(tx, userId);
    if (result) await grantNoviceOrganizerCredit(tx, result);
    return result;
  });
}

/** Rank-up push. Never for unlock-all users (they get no more celebrations). */
export async function sendNoviceRankUpNotification(result: NoviceRecountResult): Promise<void> {
  if (result.unlockedAll) return;
  if (result.newRank <= result.previousRank) return;
  const user = await prisma.user.findUnique({
    where: { id: result.userId },
    select: { language: true },
  });
  if (!user) return;
  await notificationService.sendNotification({
    userId: result.userId,
    type: NotificationType.NOVICE_RANK_UP,
    payload: buildNoviceRankUpPushPayload({ rank: result.newRank, language: user.language }),
  });
}

/**
 * Recount several users (sorted, one transaction each) and push rank-ups.
 * Never throws: novice progress is a derived counter and must not break the
 * finalization / status sweep that calls it.
 */
export async function refreshNoviceProgressForUsers(
  userIds: readonly string[],
): Promise<NoviceRecountResult[]> {
  const results: NoviceRecountResult[] = [];
  for (const userId of [...new Set(userIds)].sort()) {
    try {
      const result = await refreshNoviceProgressForUser(userId);
      if (result) results.push(result);
    } catch (error) {
      console.error(`[novice] recount failed for user ${userId}:`, error);
    }
  }
  for (const result of results) {
    await sendNoviceRankUpNotification(result).catch((error: unknown) => {
      console.error(`[novice] rank-up push failed for user ${result.userId}:`, error);
    });
  }
  return results;
}

async function recountGameParticipants(
  gameId: string,
  options: { requireEnded: boolean },
): Promise<NoviceRecountResult[]> {
  try {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        status: true,
        entityType: true,
        participants: { where: { status: 'PLAYING' }, select: { userId: true } },
      },
    });
    if (!game) return [];
    if (options.requireEnded && !NOVICE_ENDED_GAME_STATUSES.includes(game.status)) return [];
    if (NOVICE_NON_COUNTING_ENTITY_TYPES.includes(game.entityType as EntityType)) return [];
    return await refreshNoviceProgressForUsers(game.participants.map((p) => p.userId));
  } catch (error) {
    console.error(`[novice] recount failed for game ${gameId}:`, error);
    return [];
  }
}

/**
 * Hook: a game reached (or was re-finalized in) FINISHED / ARCHIVED. Recounts
 * every PLAYING participant. Safe to call for any game and any number of times.
 */
export async function onGameEndedForNovice(gameId: string): Promise<NoviceRecountResult[]> {
  return recountGameParticipants(gameId, { requireEnded: true });
}

/**
 * Hook: results were deleted / reset / reopened. Recounts so
 * `noviceCountedGames` stays honest; the rank and the debut never move back.
 */
export async function onGameResultsUndoneForNovice(
  gameId: string,
): Promise<NoviceRecountResult[]> {
  return recountGameParticipants(gameId, { requireEnded: false });
}

export type NoviceState = {
  noviceCountedGames: number;
  noviceRank: number;
  noviceMilestoneSeenRank: number;
  noviceUnlockedAllAt: Date | null;
};

const NOVICE_STATE_SELECT = {
  noviceCountedGames: true,
  noviceRank: true,
  noviceMilestoneSeenRank: true,
  noviceUnlockedAllAt: true,
} as const;

export async function getNoviceState(userId: string): Promise<NoviceState | null> {
  return prisma.user.findUnique({ where: { id: userId }, select: NOVICE_STATE_SELECT });
}

/** "Show me everything". Idempotent: the first timestamp is kept. */
export async function unlockAllNoviceFeatures(userId: string): Promise<NoviceState | null> {
  await prisma.user.updateMany({
    where: { id: userId, noviceUnlockedAllAt: null },
    data: { noviceUnlockedAllAt: new Date() },
  });
  return getNoviceState(userId);
}

/**
 * Celebration ack: `seen = max(seen, min(rank, noviceRank))` — never lowered,
 * never ahead of what the server recorded.
 */
export async function markNoviceMilestoneSeen(
  userId: string,
  rank: number,
): Promise<NoviceState | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const state = await tx.user.findUnique({ where: { id: userId }, select: NOVICE_STATE_SELECT });
    if (!state) return null;
    const next = nextMilestoneSeenRank({
      currentSeenRank: state.noviceMilestoneSeenRank,
      noviceRank: state.noviceRank,
      ackRank: rank,
    });
    if (next === state.noviceMilestoneSeenRank) return state;
    return tx.user.update({
      where: { id: userId },
      data: { noviceMilestoneSeenRank: next },
      select: NOVICE_STATE_SELECT,
    });
  });
}
