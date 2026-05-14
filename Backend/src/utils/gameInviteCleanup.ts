import { ParticipantRole, Prisma } from '@prisma/client';
import prisma from '../config/database';
import { ParticipantMessageHelper } from '../services/game/participantMessageHelper';

export const INVITE_CLEANUP_STATUSES = ['INVITED', 'INVITE_DECLINED', 'INVITE_CANCELLED'] as const;

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
  const client = tx ?? prisma;
  const rows = await client.gameParticipant.findMany({
    where: {
      gameId,
      status: { in: [...INVITE_CLEANUP_STATUSES] },
    },
    select: { id: true, userId: true, invitedByUserId: true, role: true },
  });
  if (rows.length === 0) return;

  const ownerIds = rows.filter((p) => p.role === ParticipantRole.OWNER).map((p) => p.id);
  const nonOwner = rows.filter((p) => p.role !== ParticipantRole.OWNER);

  if (nonOwner.length > 0) {
    await client.gameParticipant.deleteMany({
      where: { id: { in: nonOwner.map((p) => p.id) } },
    });
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

  if (!tx) {
    emitInviteCleanupSockets(gameId, nonOwner);
    const firstNotify = rows[0]?.userId;
    if (firstNotify) {
      await ParticipantMessageHelper.emitGameUpdate(gameId, firstNotify);
    }
  }
}
