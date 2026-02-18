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
  options?: { role?: ParticipantRole; status?: string }
): Promise<ParticipantOperationResult> {
  const existingParticipant = await tx.gameParticipant.findFirst({
    where: { gameId, userId },
  });

  const targetStatus = options?.status || 'PLAYING';

  if (existingParticipant) {
    if (existingParticipant.status === targetStatus) {
      return {
        created: false,
        updated: false,
        participant: existingParticipant,
      };
    }

    await tx.gameParticipant.update({
      where: { id: existingParticipant.id },
      data: {
        status: targetStatus,
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
      status: targetStatus,
    },
  });

  return {
    created: true,
    updated: false,
    participant: newParticipant,
  };
}
