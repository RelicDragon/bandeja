import { GameInviteOutcomeType, ParticipantRole, Prisma } from '@prisma/client';
import prisma from '../config/database';
import { ParticipantMessageHelper } from '../services/game/participantMessageHelper';
import { PlayIntentGameLifecycleService } from '../services/playIntent/playIntentGameLifecycle.service';

export const INVITE_CLEANUP_STATUSES = ['INVITED'] as const;

type Tx = Prisma.TransactionClient;

function emitInviteCleanupSockets(
  gameId: string,
  removed: { id: string; userId: string; invitedByUserId: string | null }[]
) {
  const socketService = (global as any).socketService as
    | { emitInviteDeleted: (a: string, b: string, c?: string) => void }
    | undefined;
  if (!socketService) return;
  for (const p of removed) {
    socketService.emitInviteDeleted(p.userId, p.id, gameId);
    if (p.invitedByUserId) {
      socketService.emitInviteDeleted(p.invitedByUserId, p.id, gameId);
    }
  }
}

export async function cleanupInviteParticipantsForEndedGame(
  gameId: string,
  tx?: Tx
): Promise<void> {
  const rows = await (tx ?? prisma).gameParticipant.findMany({
    where: { gameId, status: { in: [...INVITE_CLEANUP_STATUSES] } },
    select: {
      id: true,
      gameId: true,
      userId: true,
      invitedByUserId: true,
      role: true,
      playIntentId: true,
    },
  });
  if (rows.length === 0) return;

  const ownerIds = rows.filter((p) => p.role === ParticipantRole.OWNER).map((p) => p.id);
  const nonOwner = rows.filter((p) => p.role !== ParticipantRole.OWNER);

  const cleanup = async (client: Tx) => {
    for (const participant of nonOwner) {
      await PlayIntentGameLifecycleService.closeLinkedInvite(
        client,
        participant,
        GameInviteOutcomeType.CANCELLED,
        new Date(),
      );
    }
    if (ownerIds.length > 0) {
      await client.gameParticipant.updateMany({
        where: { id: { in: ownerIds } },
        data: {
          status: 'NON_PLAYING',
          invitedByUserId: null,
          inviteMessage: null,
          inviteExpiresAt: null,
          inviteUserTeamId: null,
          inviteClosedAt: null,
        },
      });
    }
  };
  if (tx) {
    await cleanup(tx);
  } else {
    await prisma.$transaction(cleanup);
  }

  if (!tx) {
    emitInviteCleanupSockets(gameId, nonOwner);
    const firstNotify = rows[0]?.userId;
    if (firstNotify) {
      await ParticipantMessageHelper.emitGameUpdate(gameId, firstNotify);
    }
  }
}
