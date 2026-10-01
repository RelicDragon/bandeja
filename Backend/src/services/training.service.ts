import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';
import { EntityType, ParticipantRole, Sport } from '@prisma/client';
import { canModifyResults, hasParentGamePermission } from '../utils/parentGamePermissions';
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

/**
 * Who may touch ratings through a training (level edits, confirmations, undo,
 * and the rating-activity stamp on finish): a platform admin, or a user with
 * `User.isTrainer` who is also this game's trainer (`Game.trainerId`) or an
 * OWNER/ADMIN of the game or its parent. A global `isTrainer` alone grants
 * nothing, and neither does owning a training without the flag (anyone may
 * create a TRAINING as a playing creator).
 */
async function canManageTrainingRatings(
  gameId: string,
  trainerId: string | null,
  actor: { id: string; isTrainer: boolean; isAdmin: boolean },
): Promise<boolean> {
  if (actor.isAdmin) return true;
  if (!actor.isTrainer) return false;
  if (trainerId === actor.id) return true;
  return hasParentGamePermission(gameId, actor.id, [ParticipantRole.OWNER, ParticipantRole.ADMIN], false);
}

async function loadActor(userId: string): Promise<{ id: string; isTrainer: boolean; isAdmin: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isTrainer: true, isAdmin: true },
  });
  if (!user) throw new ApiError(404, 'User not found');
  return user;
}

/**
 * "Finish Training" — same rule as the button (`canUserEditResults`): results
 * editors per `canModifyResults` (owner/admin incl. parent, platform admin,
 * PLAYING participant when `resultsByAnyone`) plus the game's trainer.
 * ARCHIVED is refused for everyone. The only rating effect — stamping
 * `UserSportProfile.lastRatingActivityAt`, which resets rating-uncertainty
 * accrual — happens only when the actor passes `canManageTrainingRatings`.
 */
export async function finishTraining(gameId: string, userId: string): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      entityType: true,
      resultsStatus: true,
      status: true,
      trainerId: true,
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

  if (game.status === 'ARCHIVED') {
    throw new ApiError(403, 'Cannot modify results for archived games');
  }

  const actor = await loadActor(userId);
  if (game.trainerId !== userId) {
    await canModifyResults(gameId, userId, actor.isAdmin);
  }
  const stampRatingActivity = await canManageTrainingRatings(gameId, game.trainerId, actor);

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

    for (const p of stampRatingActivity ? game.participants : []) {
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

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  if (!(await canManageTrainingRatings(gameId, game.trainerId, user))) {
    throw new ApiError(403, 'Only trainers running this training or platform admins can update participant levels');
  }

  if (game.trainerId === participantUserId) {
    throw new ApiError(400, 'Cannot update trainer level');
  }

  const targetParticipants = game.participants.filter(
    (p) => p.userId === participantUserId && p.status === 'PLAYING',
  );

  if (game.entityType !== EntityType.TRAINING) {
    throw new ApiError(400, 'This endpoint is only for training games');
  }

  if (game.status === 'ARCHIVED') {
    throw new ApiError(400, 'Cannot update participant levels for archived games');
  }

  if (game.resultsStatus !== 'FINAL') {
    throw new ApiError(400, 'Training must be finished before updating participant levels');
  }

  if (targetParticipants.length === 0) {
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

    // Every caller past the gate above may confirm levels, so the edit is a confirmation.
    const confirmationPatch = {
      approvedLevel: true,
      approvedById: userId,
      approvedWhen: now,
      approvedAtLevel: levelAfter,
    };

    await tx.userSportProfile.upsert({
      where: { userId_sport: { userId: participantUserId, sport: game.sport } },
      create: {
        userId: participantUserId,
        sport: game.sport,
        level: levelAfter,
        reliability: reliabilityAfter,
        lastRatingActivityAt: now,
        ...confirmationPatch,
      },
      update: {
        level: levelAfter,
        reliability: reliabilityAfter,
        lastRatingActivityAt: now,
        ...confirmationPatch,
      },
    });

    await ensureSportInEnabled(participantUserId, game.sport, tx);

  // User.approved* is a PADEL-only denormalized mirror for older clients (see docs/APP_FUNCTIONALITY.md §2.2).
  // It has no `approvedAtLevel` column — the snapshot lives on the sport profile only.
    if (game.sport === Sport.PADEL) {
      await tx.user.update({
        where: { id: participantUserId },
        data: {
          approvedLevel: confirmationPatch.approvedLevel,
          approvedById: confirmationPatch.approvedById,
          approvedWhen: confirmationPatch.approvedWhen,
        },
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
        isWinForStreak: true,
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
        isWinForStreak: true,
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

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  if (!(await canManageTrainingRatings(gameId, game.trainerId, user))) {
    throw new ApiError(403, 'Only trainers running this training or platform admins can undo training changes');
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
