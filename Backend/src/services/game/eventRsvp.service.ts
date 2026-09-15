import { EntityType, EventApprovalStatus, ParticipantRole, ParticipantStatus } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { gameWithRoundsAndOutcomes } from './gamePrismaIncludes';
import { performPostJoinOperations } from '../../utils/postJoinOperations';
import { ParticipantMessageHelper } from './participantMessageHelper';
import { GameReadinessService } from './readiness.service';

export type EventRsvpIntent = 'going' | 'looking';

function isEventRsvpIntent(value: unknown): value is EventRsvpIntent {
  return value === 'going' || value === 'looking';
}

export class EventRsvpService {
  static async setIntent(
    gameId: string,
    userId: string,
    intentRaw: unknown,
    lookingNoteRaw?: unknown,
  ) {
    if (!isEventRsvpIntent(intentRaw)) {
      throw new ApiError(400, 'intent must be going or looking');
    }
    const lookingNote =
      intentRaw === 'looking' && typeof lookingNoteRaw === 'string'
        ? lookingNoteRaw.trim().slice(0, 280) || null
        : null;

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, entityType: true, status: true, eventApprovalStatus: true },
    });
    if (!game) throw new ApiError(404, 'Event not found');
    if (game.entityType !== EntityType.EVENT) {
      throw new ApiError(400, 'Not an event listing');
    }
    if (game.eventApprovalStatus !== EventApprovalStatus.APPROVED) {
      throw new ApiError(403, 'Event is not public yet');
    }
    if (game.status === 'ARCHIVED' || game.status === 'FINISHED') {
      throw new ApiError(400, 'This event has ended');
    }

    const existing = await prisma.gameParticipant.findUnique({
      where: { userId_gameId: { userId, gameId } },
    });

    const status =
      intentRaw === 'going' ? ParticipantStatus.PLAYING : ParticipantStatus.NON_PLAYING;
    const lookingForPartner = intentRaw === 'looking';

    if (existing) {
      await prisma.gameParticipant.update({
        where: { id: existing.id },
        data: {
          status,
          lookingForPartner,
          lookingNote: intentRaw === 'looking' ? lookingNote : null,
        },
      });
    } else {
      await prisma.gameParticipant.create({
        data: {
          userId,
          gameId,
          role: ParticipantRole.PARTICIPANT,
          status,
          lookingForPartner,
          lookingNote,
        },
      });
      await performPostJoinOperations(gameId, userId);
    }

    await GameReadinessService.updateGameReadiness(gameId);
    await ParticipantMessageHelper.emitGameUpdate(gameId, userId);

    return prisma.game.findUniqueOrThrow({
      where: { id: gameId },
      include: gameWithRoundsAndOutcomes,
    });
  }

  static async setLookingNote(gameId: string, userId: string, lookingNoteRaw: unknown) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { entityType: true },
    });
    if (!game || game.entityType !== EntityType.EVENT) {
      throw new ApiError(400, 'Not an event listing');
    }
    const existing = await prisma.gameParticipant.findUnique({
      where: { userId_gameId: { userId, gameId } },
    });
    if (!existing?.lookingForPartner) {
      throw new ApiError(400, 'Post on the partner board first');
    }
    const lookingNote =
      typeof lookingNoteRaw === 'string' ? lookingNoteRaw.trim().slice(0, 280) || null : null;
    await prisma.gameParticipant.update({
      where: { id: existing.id },
      data: { lookingNote },
    });
    return prisma.game.findUniqueOrThrow({
      where: { id: gameId },
      include: gameWithRoundsAndOutcomes,
    });
  }

  static async leave(gameId: string, userId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { entityType: true },
    });
    if (!game || game.entityType !== EntityType.EVENT) {
      throw new ApiError(400, 'Not an event listing');
    }
    const existing = await prisma.gameParticipant.findUnique({
      where: { userId_gameId: { userId, gameId } },
    });
    if (!existing) return prisma.game.findUniqueOrThrow({
      where: { id: gameId },
      include: gameWithRoundsAndOutcomes,
    });
    if (existing.role === ParticipantRole.OWNER) {
      await prisma.gameParticipant.update({
        where: { id: existing.id },
        data: {
          status: ParticipantStatus.NON_PLAYING,
          lookingForPartner: false,
          lookingNote: null,
        },
      });
    } else {
      await prisma.gameParticipant.delete({ where: { id: existing.id } });
    }
    await GameReadinessService.updateGameReadiness(gameId);
    await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
    return prisma.game.findUniqueOrThrow({
      where: { id: gameId },
      include: gameWithRoundsAndOutcomes,
    });
  }
}
