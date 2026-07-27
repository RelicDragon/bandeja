import type { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import {
  mergeHabitUnlocksMetadata,
  type HabitUnlockMeta,
} from './habitGrant.service';

type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Persist habit unlocks onto an existing GameOutcome for Results celebration.
 * Never creates stub outcomes (those poison standings / undo / leaderboard).
 * Missing outcomes (BAR / non-playing OWNER): unlocks still exist on UserAchievement;
 * Rare/Legendary surface via profile pendingCelebrations.
 */
export async function attachHabitUnlocksToGameOutcome(params: {
  db: DbClient;
  gameId: string;
  userId: string;
  unlocks: HabitUnlockMeta[];
}): Promise<void> {
  if (params.unlocks.length === 0) return;

  const existing = await params.db.gameOutcome.findUnique({
    where: {
      gameId_userId: { gameId: params.gameId, userId: params.userId },
    },
    select: { id: true, metadata: true },
  });
  if (!existing) return;

  await params.db.gameOutcome.update({
    where: { id: existing.id },
    data: {
      metadata: mergeHabitUnlocksMetadata(existing.metadata, params.unlocks),
    },
  });
}
