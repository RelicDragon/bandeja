import { ChatContextType, Prisma } from '@prisma/client';
import {
  ACHIEVEMENT_CATALOG,
  filterThresholdDefinitionsDue,
  isBugEligibleForShippedAchievement,
  type AchievementDefinition,
} from '@bandeja/shared/achievements';
import prisma from '../../config/database';

type DbClient = Prisma.TransactionClient | typeof prisma;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export type BugShippedRow = {
  id: string;
  senderId: string;
  bugType: string;
  status: string;
  inProgressReachedAt: Date | null;
  testingStartedAt: Date | null;
  finishedAt: Date | null;
  updatedAt: Date;
};

export function pickBugShippedEarnedAt(bug: BugShippedRow): Date {
  return bug.finishedAt ?? bug.updatedAt;
}

export async function bugEverReachedWorkflowMiddleFromChat(params: {
  groupChannelId: string | null | undefined;
  tx?: DbClient;
}): Promise<boolean> {
  if (!params.groupChannelId) return false;
  const db = params.tx ?? prisma;
  const msg = await db.chatMessage.findFirst({
    where: {
      chatContextType: ChatContextType.GROUP,
      contextId: params.groupChannelId,
      content: { contains: 'BUG_STATUS_CHANGED' },
      OR: [
        { content: { contains: '"status":"in_progress"' } },
        { content: { contains: '"status":"test"' } },
      ],
    },
    select: { id: true },
  });
  return msg != null;
}

export async function isBugEligibleForShippedAchievementResolved(
  bug: BugShippedRow & { groupChannelId?: string | null },
  tx?: DbClient,
): Promise<boolean> {
  if (isBugEligibleForShippedAchievement(bug)) return true;
  if (!bugTerminalNeedsChatFallback(bug)) return false;
  return bugEverReachedWorkflowMiddleFromChat({
    groupChannelId: bug.groupChannelId,
    tx,
  });
}

function bugTerminalNeedsChatFallback(bug: BugShippedRow): boolean {
  if (bug.bugType === 'QUESTION') return false;
  if (bug.status !== 'FINISHED' && bug.status !== 'ARCHIVED') return false;
  return !bug.inProgressReachedAt && !bug.testingStartedAt;
}

/** Count shipped bugs for a user (sticky workflow flags only — backfill chat into flags first). */
export async function countBugShippedForUser(params: {
  userId: string;
  tx?: DbClient;
}): Promise<number> {
  const db = params.tx ?? prisma;
  return db.bug.count({
    where: {
      senderId: params.userId,
      bugType: { not: 'QUESTION' },
      status: { in: ['FINISHED', 'ARCHIVED'] },
      OR: [{ inProgressReachedAt: { not: null } }, { testingStartedAt: { not: null } }],
    },
  });
}

export async function loadBugShippedHabitCounters(
  userId: string,
  tx?: DbClient,
): Promise<{ bugShippedCount: number }> {
  return { bugShippedCount: await countBugShippedForUser({ userId, tx }) };
}

export async function loadBugShippedChronological(params: {
  userId: string;
  tx?: DbClient;
}): Promise<Array<{ bugId: string; at: Date }>> {
  const db = params.tx ?? prisma;
  const rows = await db.bug.findMany({
    where: {
      senderId: params.userId,
      bugType: { not: 'QUESTION' },
      status: { in: ['FINISHED', 'ARCHIVED'] },
      OR: [{ inProgressReachedAt: { not: null } }, { testingStartedAt: { not: null } }],
    },
    select: {
      id: true,
      finishedAt: true,
      updatedAt: true,
    },
  });
  return rows
    .map((row) => ({
      bugId: row.id,
      at: pickBugShippedEarnedAt({
        id: row.id,
        senderId: params.userId,
        bugType: 'BUG',
        status: 'FINISHED',
        inProgressReachedAt: null,
        testingStartedAt: null,
        finishedAt: row.finishedAt,
        updatedAt: row.updatedAt,
      }),
    }))
    .sort((a, b) => {
      const t = a.at.getTime() - b.at.getTime();
      if (t !== 0) return t;
      return a.bugId.localeCompare(b.bugId);
    });
}

async function grantDueForUser(params: {
  userId: string;
  before: number;
  after: number;
  sourceBugId: string;
  earnedAt: Date;
  tx: Prisma.TransactionClient;
}): Promise<AchievementDefinition[]> {
  if (params.after <= params.before) return [];
  const existing = await params.tx.userAchievement.findMany({
    where: { userId: params.userId },
    select: { definitionId: true },
  });
  const due = filterThresholdDefinitionsDue({
    definitions: ACHIEVEMENT_CATALOG,
    ruleKind: 'HABIT_BUG_SHIPPED',
    before: Math.max(0, params.before),
    after: params.after,
    ownedDefinitionIds: new Set(existing.map((r) => r.definitionId)),
  });
  const granted: AchievementDefinition[] = [];
  for (const definition of due) {
    try {
      await params.tx.userAchievement.create({
        data: {
          userId: params.userId,
          definitionId: definition.id,
          sourceKey: '',
          sourceEntityId: params.sourceBugId,
          earnedAt: params.earnedAt,
          isActive: true,
        },
      });
      granted.push(definition);
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }
  return granted;
}

/**
 * Grant newly crossed bug-shipped ladder tiers after a bug reaches FINISHED/ARCHIVED.
 * Returns true if any tier was granted.
 */
export async function tryGrantBugShippedAchievement(params: {
  bug: BugShippedRow & { groupChannelId?: string | null };
  tx?: Prisma.TransactionClient;
}): Promise<boolean> {
  if (!params.tx) {
    return prisma.$transaction((tx) =>
      tryGrantBugShippedAchievement({ bug: params.bug, tx }),
    );
  }
  const eligible = await isBugEligibleForShippedAchievementResolved(params.bug, params.tx);
  if (!eligible) return false;

  // Ensure sticky flags so flag-based counts include chat-fallback historical bugs.
  if (!params.bug.inProgressReachedAt && !params.bug.testingStartedAt) {
    const stamped = pickBugShippedEarnedAt(params.bug);
    await params.tx.bug.update({
      where: { id: params.bug.id },
      data: { testingStartedAt: stamped },
    });
    params.bug.testingStartedAt = stamped;
  }

  const after = await countBugShippedForUser({
    userId: params.bug.senderId,
    tx: params.tx,
  });
  // This bug is included in `after`; prior count is after - 1 when it newly qualifies.
  const before = Math.max(0, after - 1);
  const granted = await grantDueForUser({
    userId: params.bug.senderId,
    before,
    after,
    sourceBugId: params.bug.id,
    earnedAt: pickBugShippedEarnedAt(params.bug),
    tx: params.tx,
  });
  return granted.length > 0;
}

export async function tryGrantBugShippedAchievementById(
  bugId: string,
  tx?: Prisma.TransactionClient,
): Promise<boolean> {
  const db = tx ?? prisma;
  const bug = await db.bug.findUnique({
    where: { id: bugId },
    select: {
      id: true,
      senderId: true,
      bugType: true,
      status: true,
      inProgressReachedAt: true,
      testingStartedAt: true,
      finishedAt: true,
      updatedAt: true,
      groupChannel: { select: { id: true } },
    },
  });
  if (!bug) return false;
  return tryGrantBugShippedAchievement({
    bug: { ...bug, groupChannelId: bug.groupChannel?.id ?? null },
    tx,
  });
}

/** Backfill: grant every due ladder tier for a user from current count (idempotent). */
export async function backfillBugShippedLadderForUser(params: {
  userId: string;
  tx?: Prisma.TransactionClient;
}): Promise<AchievementDefinition[]> {
  if (!params.tx) {
    return prisma.$transaction((tx) =>
      backfillBugShippedLadderForUser({ userId: params.userId, tx }),
    );
  }
  const after = await countBugShippedForUser({ userId: params.userId, tx: params.tx });
  if (after <= 0) return [];
  const existing = await params.tx.userAchievement.findMany({
    where: { userId: params.userId },
    select: { definitionId: true },
  });
  const due = filterThresholdDefinitionsDue({
    definitions: ACHIEVEMENT_CATALOG,
    ruleKind: 'HABIT_BUG_SHIPPED',
    before: 0,
    after,
    ownedDefinitionIds: new Set(existing.map((r) => r.definitionId)),
  });
  if (due.length === 0) return [];

  const chrono = await loadBugShippedChronological({
    userId: params.userId,
    tx: params.tx,
  });
  const granted: AchievementDefinition[] = [];
  for (const definition of due) {
    const threshold = definition.threshold ?? 0;
    const crossing = chrono[threshold - 1];
    const earnedAt = crossing?.at ?? new Date();
    const sourceBugId = crossing?.bugId ?? chrono[chrono.length - 1]?.bugId ?? '';
    try {
      await params.tx.userAchievement.create({
        data: {
          userId: params.userId,
          definitionId: definition.id,
          sourceKey: '',
          sourceEntityId: sourceBugId || null,
          earnedAt,
          isActive: true,
        },
      });
      granted.push(definition);
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }
  return granted;
}
