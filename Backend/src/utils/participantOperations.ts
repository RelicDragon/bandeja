import { ParticipantRole } from '@prisma/client';

export interface ParticipantOperationResult {
  created: boolean;
  updated: boolean;
  participant: any;
}

export async function addOrUpdateParticipant(
  tx: any,
  gameId: string,
  userId: string,
  options?: { role?: ParticipantRole }
): Promise<ParticipantOperationResult> {
  const existingParticipant = await tx.gameParticipant.findFirst({
    where: { gameId, userId },
  });

  if (existingParticipant) {
    if (existingParticipant.status === 'PLAYING') {
      return {
        created: false,
        updated: false,
        participant: existingParticipant,
      };
    }

    await tx.gameParticipant.update({
      where: { id: existingParticipant.id },
      data: {
        status: 'PLAYING',
        invitedByUserId: null,
        inviteMessage: null,
        inviteExpiresAt: null,
      },
    });

    return {
      created: false,
      updated: true,
      participant: existingParticipant,
    };
  }

  const newParticipant = await tx.gameParticipant.create({
    data: {
      gameId,
      userId,
      role: options?.role || ParticipantRole.PARTICIPANT,
      status: 'PLAYING',
    },
  });

  return {
    created: true,
    updated: false,
    participant: newParticipant,
  };
}

export async function performPostJoinOperations(
  gameId: string,
  userId: string
): Promise<void> {
  const { InviteService } = await import('../services/invite.service');
  const { ParticipantMessageHelper } = await import('../services/game/participantMessageHelper');
  const { GameService } = await import('../services/game/game.service');

  await Promise.all([
    InviteService.deleteInvitesForUserInGame(gameId, userId),
    ParticipantMessageHelper.sendJoinMessage(gameId, userId),
  ]);

  await GameService.updateGameReadiness(gameId);
  await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
}
