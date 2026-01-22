import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';
import { EntityType, LevelChangeEventType } from '@prisma/client';

export async function finishTraining(gameId: string, _userId: string): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, entityType: true, resultsStatus: true },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  if (game.entityType !== EntityType.TRAINING) {
    throw new ApiError(400, 'This endpoint is only for training games');
  }

  const isFirstTimeFinal = game.resultsStatus !== 'FINAL';
  
  await prisma.game.update({
    where: { id: gameId },
    data: {
      resultsStatus: 'FINAL',
      status: 'FINISHED',
      ...(isFirstTimeFinal && { finishedDate: new Date() }),
    },
  });
}

export async function updateParticipantLevel(
  gameId: string,
  userId: string,
  participantUserId: string,
  level: number,
  reliability: number
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isTrainer: true,
      isAdmin: true,
    },
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (!user.isTrainer && !user.isAdmin) {
    throw new ApiError(403, 'Only trainers or admins can update participant levels');
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      participants: {
        where: {
          userId: participantUserId,
          isPlaying: true,
        },
      },
    },
  });

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

  if (game.participants.length === 0) {
    throw new ApiError(404, 'Participant not found in this game');
  }

  const participant = await prisma.user.findUnique({
    where: { id: participantUserId },
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

  const levelBefore = existingOutcome ? existingOutcome.levelBefore : participant.level;
  const reliabilityBefore = existingOutcome ? existingOutcome.reliabilityBefore : participant.reliability;
  const levelAfter = Math.max(1.0, Math.min(7.0, level));
  const reliabilityAfter = Math.max(0.0, Math.min(100.0, reliability));
  const actualLevelChange = levelAfter - levelBefore;
  const actualReliabilityChange = reliabilityAfter - reliabilityBefore;

  await prisma.$transaction(async (tx) => {
    await tx.levelChangeEvent.deleteMany({
      where: {
        userId: participantUserId,
        gameId: gameId,
        eventType: LevelChangeEventType.SET,
      },
    });

    const updateData: {
      level: number;
      reliability: number;
      approvedLevel?: boolean;
      approvedById?: string;
      approvedWhen?: Date;
    } = {
      level: levelAfter,
      reliability: reliabilityAfter,
    };

    if (user.isTrainer || user.isAdmin) {
      updateData.approvedLevel = true;
      updateData.approvedById = userId;
      updateData.approvedWhen = new Date();
    }

    await tx.user.update({
      where: { id: participantUserId },
      data: updateData,
    });

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
      },
      update: {
        levelBefore,
        levelAfter,
        levelChange: actualLevelChange,
        reliabilityBefore,
        reliabilityAfter,
        reliabilityChange: actualReliabilityChange,
      },
    });

    if (actualLevelChange !== 0) {
      await tx.levelChangeEvent.create({
        data: {
          userId: participantUserId,
          levelBefore,
          levelAfter,
          eventType: LevelChangeEventType.SET,
          linkEntityType: EntityType.TRAINING,
          gameId: gameId,
        },
      });
    }
  });
}

export async function undoTraining(gameId: string, userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isTrainer: true,
      isAdmin: true,
    },
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (!user.isTrainer && !user.isAdmin) {
    throw new ApiError(403, 'Only trainers or admins can undo training changes');
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      outcomes: true,
    },
  });

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
        await tx.user.update({
          where: { id: outcome.userId },
          data: {
            level: Math.max(1.0, Math.min(7.0, outcome.levelBefore)),
            reliability: outcome.reliabilityBefore,
          },
        });
      }
    }

    await tx.gameOutcome.deleteMany({
      where: { gameId },
    });

    await tx.levelChangeEvent.deleteMany({
      where: {
        gameId: gameId,
        eventType: LevelChangeEventType.SET,
      },
    });
  });
}
