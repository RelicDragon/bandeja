/**
 * Novice mode (PRD #358) — organizer credit.
 *
 * - Talent Scout (`HABIT_TALENT_SCOUT`): newcomers whose debut (first counted
 *   game) was in a game this user owns — `User.noviceDebutHostUserId`.
 * - Ambassador (`HABIT_AMBASSADOR`): those newcomers who reached Regular.
 *
 * Counts are recomputed from `User` rows (idempotent), every due MILESTONE tier
 * is granted with `sourceKey: ''` (lifetime uniqueness) and `ON CONFLICT DO
 * NOTHING`, so a repeat call or a race can never double-grant or abort the
 * caller's transaction.
 */
import { Prisma } from '@prisma/client';
import {
  ACHIEVEMENT_CATALOG,
  filterThresholdDefinitionsDue,
  type AchievementDefinition,
} from '@bandeja/shared/achievements';
import { NOVICE_MAX_RANK } from '@bandeja/shared/novice';
import prisma from '../../config/database';

type DbClient = Prisma.TransactionClient | typeof prisma;

export type NoviceHostRuleKind = 'HABIT_TALENT_SCOUT' | 'HABIT_AMBASSADOR';

export async function countNewcomersDebutedBy(hostUserId: string, tx?: DbClient): Promise<number> {
  const db = tx ?? prisma;
  return db.user.count({ where: { noviceDebutHostUserId: hostUserId } });
}

export async function countDebutedNewcomersWhoReachedRegular(
  hostUserId: string,
  tx?: DbClient,
): Promise<number> {
  const db = tx ?? prisma;
  return db.user.count({
    where: { noviceDebutHostUserId: hostUserId, noviceRank: { gte: NOVICE_MAX_RANK } },
  });
}

export async function loadNoviceHostHabitCounters(
  userId: string,
  tx?: DbClient,
): Promise<{ talentScoutCount: number; ambassadorCount: number }> {
  const [talentScoutCount, ambassadorCount] = await Promise.all([
    countNewcomersDebutedBy(userId, tx),
    countDebutedNewcomersWhoReachedRegular(userId, tx),
  ]);
  return { talentScoutCount, ambassadorCount };
}

/** Grant every due tier of one ladder for `hostUserId`. Returns the newly due definitions. */
export async function grantNoviceHostLadder(params: {
  hostUserId: string;
  ruleKind: NoviceHostRuleKind;
  /** The newcomer whose debut / Regular triggered this grant. */
  newcomerUserId: string;
  sourceGameId?: string | null;
  tx: Prisma.TransactionClient;
}): Promise<AchievementDefinition[]> {
  const after =
    params.ruleKind === 'HABIT_TALENT_SCOUT'
      ? await countNewcomersDebutedBy(params.hostUserId, params.tx)
      : await countDebutedNewcomersWhoReachedRegular(params.hostUserId, params.tx);
  if (after <= 0) return [];

  const owned = await params.tx.userAchievement.findMany({
    where: { userId: params.hostUserId },
    select: { definitionId: true },
  });
  const due = filterThresholdDefinitionsDue({
    definitions: ACHIEVEMENT_CATALOG,
    ruleKind: params.ruleKind,
    before: 0,
    after,
    ownedDefinitionIds: new Set(owned.map((row) => row.definitionId)),
  });
  if (due.length === 0) return [];

  const earnedAt = new Date();
  await params.tx.userAchievement.createMany({
    data: due.map((definition) => ({
      userId: params.hostUserId,
      definitionId: definition.id,
      sourceKey: '',
      sourceEntityId: params.newcomerUserId,
      sourceGameId: params.sourceGameId ?? null,
      earnedAt,
      isActive: true,
    })),
    skipDuplicates: true,
  });
  return due;
}
