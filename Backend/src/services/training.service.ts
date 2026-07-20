import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';
import { EntityType, Sport } from '@prisma/client';
import { cleanupInviteParticipantsForEndedGame } from '../utils/gameInviteCleanup';
import {
  ensureSportInEnabled,
  resolveUserSportSnapshot,
} from './user/userSportProfile.service';
import { createSetEvent, revertForGame, clearSetEventsForUserInGame } from './levelChange';
import {
  mergeRatingUncertaintyMetadata,
  readRatingUncertaintyMetadata,
} from './results/outcomeStatsSnapshot';

export async function finishTraining(gameId: string, _userId: string): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      entityType: true,
      resultsStatus: true,
      sport: true,
      participants: {
        where: { status: 'PLAYING' },
        select: { userId: true },
      },
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  if (game.entityType !== EntityType.TRAINING) {
    throw new ApiError(400, 'This endpoint is only for training games');
  }

  const isFirstTimeFinal = game.resultsStatus !== 'FINAL';
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.game.update({
      where: { id: gameId },
      data: {
        resultsStatus: 'FINAL',
        status: 'FINISHED',
        ...(isFirstTimeFinal && { finishedDate: now }),
      },
    });

    for (const p of game.participants) {
      await tx.userSportProfile.upsert({
        where: { userId_sport: { userId: p.userId, sport: game.sport } },
        create: {
          userId: p.userId,
          sport: game.sport,
          lastRatingActivityAt: now,
        },
        update: {
          lastRatingActivityAt: now,
        },
      });
    }
  });
  await cleanupInviteParticipantsForEndedGame(gameId);
}

export async function updateParticipantLevel(
  gameId: string,
  userId: string,
  participantUserId: string,
  level: number,
  reliability: number
): Promise<void> {
  const [user, game] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isTrainer: true, isAdmin: true },
    }),
    prisma.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        entityType: true,
        sport: true,
        resultsStatus: true,
        status: true,
        trainerId: true,
        participants: true,
      },
    }),
  ]);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const userParticipant = game?.participants.find(p => p.userId === userId);
  const isTrainerOrOwner = userParticipant?.role === 'OWNER' || userParticipant?.role === 'ADMIN';
  if (!user.isTrainer && !user.isAdmin && !isTrainerOrOwner) {
    throw new ApiError(403, 'Only trainers or admins can update participant levels');
  }

  if (game?.trainerId === participantUserId) {
    throw new ApiError(400, 'Cannot update trainer level');
  }

  const gameWithTarget = game
    ? { ...game, participants: game.participants.filter(p => p.userId === participantUserId && p.status === 'PLAYING') }
    : null;

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  if (game.entityType !== EntityType.TRAINING) {
    throw new ApiError(400, 'This endpoint is only for training games');
  }

  if (game.status === 'ARCHIVED') {
    throw new ApiError(400, 'Cannot update participant levels for archived games');
  }

  if (game.resultsStatus !== 'FINAL') {
    throw new ApiError(400, 'Training must be finished before updating participant levels');
  }

  if (gameWithTarget!.participants.length === 0) {
    throw new ApiError(404, 'Participant not found in this game');
  }

  const participant = await prisma.user.findUnique({
    where: { id: participantUserId },
    select: {
      id: true,
      sportProfiles: {
        where: { sport: game.sport },
        select: {
          sport: true,
          level: true,
          reliability: true,
          ratingUncertainty: true,
          lastRatingActivityAt: true,
          gamesPlayed: true,
          gamesWon: true,
        },
      },
    },
  });

  if (!participant) {
    throw new ApiError(404, 'Participant not found');
  }

  const existingOutcome = await prisma.gameOutcome.findUnique({
    where: {
      gameId_userId: {
        gameId,
        userId: participantUserId,
      },
    },
  });

  const sportSnapshot = resolveUserSportSnapshot(participant, game.sport);
  const levelBefore = existingOutcome ? existingOutcome.levelBefore : sportSnapshot.level;
  const reliabilityBefore = existingOutcome ? existingOutcome.reliabilityBefore : sportSnapshot.reliability;
  const levelAfter = Math.max(1.0, Math.min(7.0, level));
  const reliabilityAfter = Math.max(reliabilityBefore, Math.min(100.0, reliability));
  const actualLevelChange = levelAfter - levelBefore;
  const actualReliabilityChange = reliabilityAfter - reliabilityBefore;
  const activityMeta = mergeRatingUncertaintyMetadata(existingOutcome?.metadata, {
    ratingUncertaintyBefore: sportSnapshot.ratingUncertainty,
    ratingUncertaintyUsed: sportSnapshot.ratingUncertainty,
    ratingUncertaintyAfter: sportSnapshot.ratingUncertainty,
    lastRatingActivityAtBefore: sportSnapshot.lastRatingActivityAt
      ? sportSnapshot.lastRatingActivityAt.toISOString()
      : null,
  });
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await clearSetEventsForUserInGame(gameId, participantUserId, tx);

    const confirmationPatch =
      user.isTrainer || user.isAdmin || isTrainerOrOwner
        ? {
            approvedLevel: true,
            approvedById: userId,
            approvedWhen: now,
          }
        : null;

    await tx.userSportProfile.upsert({
      where: { userId_sport: { userId: participantUserId, sport: game.sport } },
      create: {
        userId: participantUserId,
        sport: game.sport,
        level: levelAfter,
        reliability: reliabilityAfter,
        lastRatingActivityAt: now,
        ...(confirmationPatch ?? {}),
      },
      update: {
        level: levelAfter,
        reliability: reliabilityAfter,
        lastRatingActivityAt: now,
        ...(confirmationPatch ?? {}),
      },
    });

    await ensureSportInEnabled(participantUserId, game.sport, tx);

    // ADR-008: User.approved* is a PADEL-only denormalized mirror for older clients.
    if (confirmationPatch && game.sport === Sport.PADEL) {
      await tx.user.update({
        where: { id: participantUserId },
        data: confirmationPatch,
      });
    }

    await tx.gameOutcome.upsert({
      where: {
        gameId_userId: {
          gameId,
          userId: participantUserId,
        },
      },
      create: {
        gameId,
        userId: participantUserId,
        levelBefore,
        levelAfter,
        levelChange: actualLevelChange,
        reliabilityBefore,
        reliabilityAfter,
        reliabilityChange: actualReliabilityChange,
        pointsEarned: 0,
        isWinner: false,
        wins: 0,
        ties: 0,
        losses: 0,
        scoresMade: 0,
        scoresLost: 0,
        metadata: activityMeta,
      },
      update: {
        levelBefore,
        levelAfter,
        levelChange: actualLevelChange,
        reliabilityBefore,
        reliabilityAfter,
        reliabilityChange: actualReliabilityChange,
        metadata: activityMeta,
      },
    });

    if (actualLevelChange !== 0) {
      await createSetEvent(tx, {
        userId: participantUserId,
        gameId,
        sport: game.sport,
        linkEntityType: EntityType.TRAINING,
        levelBefore,
        levelAfter,
        levelChange: actualLevelChange,
      });
    }
  });
}

export async function undoTraining(gameId: string, userId: string): Promise<void> {
  const [user, game] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isTrainer: true, isAdmin: true },
    }),
    prisma.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        entityType: true,
        sport: true,
        resultsStatus: true,
        status: true,
        trainerId: true,
        outcomes: true,
        participants: true,
      },
    }),
  ]);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const userParticipant = game?.participants.find(p => p.userId === userId);
  const isTrainerOrOwner = userParticipant?.role === 'OWNER' || userParticipant?.role === 'ADMIN';
  if (!user.isTrainer && !user.isAdmin && !isTrainerOrOwner) {
    throw new ApiError(403, 'Only trainers or admins can undo training changes');
  }

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  if (game.entityType !== EntityType.TRAINING) {
    throw new ApiError(400, 'This endpoint is only for training games');
  }

  if (game.status === 'ARCHIVED') {
    throw new ApiError(400, 'Cannot undo training changes for archived games');
  }

  if (game.resultsStatus !== 'FINAL') {
    throw new ApiError(400, 'Can only undo training changes when resultsStatus is FINAL');
  }

  await prisma.$transaction(async (tx) => {
    if (game.outcomes.length > 0) {
      for (const outcome of game.outcomes) {
        const levelBefore = Math.max(1.0, Math.min(7.0, outcome.levelBefore));
        const activityMeta = readRatingUncertaintyMetadata(outcome.metadata);
        await tx.userSportProfile.upsert({
          where: { userId_sport: { userId: outcome.userId, sport: game.sport } },
          create: {
            userId: outcome.userId,
            sport: game.sport,
            level: levelBefore,
            reliability: outcome.reliabilityBefore,
            ...(activityMeta
              ? {
                  lastRatingActivityAt: activityMeta.lastRatingActivityAtBefore
                    ? new Date(activityMeta.lastRatingActivityAtBefore)
                    : null,
                }
              : {}),
          },
          update: {
            level: levelBefore,
            reliability: outcome.reliabilityBefore,
            ...(activityMeta
              ? {
                  lastRatingActivityAt: activityMeta.lastRatingActivityAtBefore
                    ? new Date(activityMeta.lastRatingActivityAtBefore)
                    : null,
                }
              : {}),
          },
        });
      }
    }

    await tx.gameOutcome.deleteMany({
      where: { gameId },
    });

    await revertForGame(gameId, 'outcomes', tx);
  });
}
