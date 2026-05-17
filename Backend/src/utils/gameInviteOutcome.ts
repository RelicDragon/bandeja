import { GameInviteOutcomeType, Prisma } from '@prisma/client';
import prisma from '../config/database';

export type GameInviteOutcomeRecord = {
  id: string;
  gameId: string;
  userId: string;
  outcome: GameInviteOutcomeType;
  invitedByUserId: string | null;
  closedAt: Date;
};

export function mapOutcomeToLegacyStatus(outcome: GameInviteOutcomeType): 'INVITE_DECLINED' | 'INVITE_CANCELLED' {
  return outcome === GameInviteOutcomeType.DECLINED ? 'INVITE_DECLINED' : 'INVITE_CANCELLED';
}

export async function upsertGameInviteOutcome(
  data: {
    gameId: string;
    userId: string;
    outcome: GameInviteOutcomeType;
    invitedByUserId?: string | null;
    closedAt?: Date;
  },
  tx?: Prisma.TransactionClient
): Promise<GameInviteOutcomeRecord> {
  const client = tx ?? prisma;
  const closedAt = data.closedAt ?? new Date();
  return client.gameInviteOutcome.upsert({
    where: { gameId_userId: { gameId: data.gameId, userId: data.userId } },
    create: {
      gameId: data.gameId,
      userId: data.userId,
      outcome: data.outcome,
      invitedByUserId: data.invitedByUserId ?? null,
      closedAt,
    },
    update: {
      outcome: data.outcome,
      invitedByUserId: data.invitedByUserId ?? null,
      closedAt,
    },
  });
}

export async function deleteGameInviteOutcome(
  gameId: string,
  userId: string,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx ?? prisma;
  await client.gameInviteOutcome.deleteMany({ where: { gameId, userId } });
}

export async function deleteGameInviteOutcomesForGame(gameId: string, tx?: Prisma.TransactionClient): Promise<void> {
  const client = tx ?? prisma;
  await client.gameInviteOutcome.deleteMany({ where: { gameId } });
}

export async function findGameInviteOutcome(gameId: string, userId: string, tx?: Prisma.TransactionClient) {
  const client = tx ?? prisma;
  return client.gameInviteOutcome.findUnique({
    where: { gameId_userId: { gameId, userId } },
  });
}
