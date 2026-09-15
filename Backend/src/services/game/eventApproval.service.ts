import { EntityType, EventApprovalStatus } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { EVENT_APPROVAL_STATUS } from '@bandeja/shared/eventApproval';
import { gameWithRoundsAndOutcomes } from './gamePrismaIncludes';
import { ParticipantMessageHelper } from './participantMessageHelper';

function isApproveDecision(value: unknown): value is 'APPROVE' | 'DECLINE' {
  return value === 'APPROVE' || value === 'DECLINE';
}

export class EventApprovalService {
  static async decide(gameId: string, adminUserId: string, decisionRaw: unknown) {
    if (!isApproveDecision(decisionRaw)) {
      throw new ApiError(400, 'decision must be APPROVE or DECLINE');
    }

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, entityType: true, eventApprovalStatus: true },
    });
    if (!game || game.entityType !== EntityType.EVENT) {
      throw new ApiError(404, 'Event not found');
    }
    if (game.eventApprovalStatus !== EventApprovalStatus.ON_APPROVE) {
      throw new ApiError(400, 'Event is not awaiting approval');
    }

    const eventApprovalStatus =
      decisionRaw === 'APPROVE'
        ? EVENT_APPROVAL_STATUS.APPROVED
        : EVENT_APPROVAL_STATUS.DECLINED;

    await prisma.game.update({
      where: { id: gameId },
      data: { eventApprovalStatus },
    });

    await ParticipantMessageHelper.emitGameUpdate(gameId, adminUserId);

    return prisma.game.findUniqueOrThrow({
      where: { id: gameId },
      include: gameWithRoundsAndOutcomes,
    });
  }
}
