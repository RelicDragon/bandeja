import {
  GameInviteOutcomeType,
  PlayIntentStatus,
  Prisma,
} from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { intentWindowIsReachable } from './playIntentFreshness';

type TransactionClient = Prisma.TransactionClient;

type LinkedInviteParticipant = {
  id: string;
  gameId: string;
  userId: string;
  invitedByUserId: string | null;
  playIntentId: string | null;
};

export class PlayIntentGameLifecycleService {
  static async reserve(
    tx: TransactionClient,
    intentId: string,
    userId: string,
    now: Date,
  ): Promise<void> {
    const reserved = await tx.playIntent.updateMany({
      where: {
        id: intentId,
        userId,
        status: { in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED] },
        expiresAt: { gt: now },
        gameParticipants: { none: {} },
      },
      data: { status: PlayIntentStatus.MATCHED },
    });
    if (reserved.count !== 1) {
      throw new ApiError(409, 'Play intent is no longer available', true, {
        code: 'playIntent.unavailable',
      });
    }
  }

  static async consume(
    tx: TransactionClient,
    intentId: string,
    userId: string,
    now: Date,
  ): Promise<void> {
    const consumed = await tx.playIntent.updateMany({
      where: {
        id: intentId,
        userId,
        status: { in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED] },
        expiresAt: { gt: now },
      },
      data: { status: PlayIntentStatus.CONSUMED },
    });
    if (consumed.count !== 1) {
      throw new ApiError(409, 'Play intent is no longer available', true, {
        code: 'playIntent.unavailable',
      });
    }
  }

  static async release(
    tx: TransactionClient,
    intentId: string,
    now: Date,
  ): Promise<'OPEN' | 'EXPIRED' | null> {
    const intent = await tx.playIntent.findUnique({
      where: { id: intentId },
      select: {
        status: true,
        expiresAt: true,
        dateKeys: true,
        timeOfDay: true,
        startTime: true,
        endTime: true,
        city: { select: { timezone: true } },
      },
    });
    if (!intent || intent.status !== PlayIntentStatus.MATCHED) return null;

    const nextStatus =
      intent.expiresAt > now &&
      intentWindowIsReachable(intent, intent.city.timezone, now)
        ? PlayIntentStatus.OPEN
        : PlayIntentStatus.EXPIRED;
    const updated = await tx.playIntent.updateMany({
      where: {
        id: intentId,
        status: PlayIntentStatus.MATCHED,
      },
      data: { status: nextStatus },
    });
    return updated.count === 1 ? nextStatus : null;
  }

  static async closeLinkedInvite(
    tx: TransactionClient,
    participant: LinkedInviteParticipant,
    outcome: GameInviteOutcomeType,
    now: Date,
  ) {
    if (participant.playIntentId) {
      await this.release(tx, participant.playIntentId, now);
    }
    const record = await tx.gameInviteOutcome.upsert({
      where: {
        gameId_userId: {
          gameId: participant.gameId,
          userId: participant.userId,
        },
      },
      create: {
        gameId: participant.gameId,
        userId: participant.userId,
        outcome,
        invitedByUserId: participant.invitedByUserId,
        playIntentId: participant.playIntentId,
        closedAt: now,
      },
      update: {
        outcome,
        invitedByUserId: participant.invitedByUserId,
        playIntentId: participant.playIntentId,
        closedAt: now,
      },
    });
    const deleted = await tx.gameParticipant.deleteMany({
      where: { id: participant.id, status: 'INVITED' },
    });
    if (deleted.count === 0) return null;
    return record;
  }
}
