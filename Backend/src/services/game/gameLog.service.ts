import prisma from '../../config/database';
import type { GameLogType, Prisma } from '@prisma/client';

export async function appendGameLog(params: {
  gameId: string;
  type: GameLogType;
  actorId?: string | null;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.gameLog.create({
      data: {
        gameId: params.gameId,
        type: params.type,
        actorId: params.actorId ?? null,
        targetId: params.targetId ?? null,
        metadata: params.metadata ?? undefined,
      },
    });
  } catch (e) {
    console.warn('[GameLog] insert failed', {
      gameId: params.gameId,
      type: params.type,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
