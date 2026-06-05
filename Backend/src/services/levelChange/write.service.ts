import {
  EntityType,
  LevelChangeEventType,
  Prisma,
  Sport,
} from '@prisma/client';
import {
  resolveGameLevelChangeEventLevels,
  shouldCreateGameLevelChangeEvent,
} from '../results/outcomeStatsSnapshot';

export type CreateGameEventInput = {
  userId: string;
  gameId: string;
  sport: Sport;
  linkEntityType: EntityType;
  affectsRating: boolean;
  levelBefore: number;
  levelAfter: number;
  levelChange: number;
  createdAt?: Date;
};

export async function createGameEvent(
  tx: Prisma.TransactionClient,
  input: CreateGameEventInput,
): Promise<boolean> {
  if (!shouldCreateGameLevelChangeEvent(input.affectsRating, input.levelChange)) {
    return false;
  }

  const levels = resolveGameLevelChangeEventLevels(
    input.affectsRating,
    input.levelBefore,
    input.levelAfter,
  );

  await tx.levelChangeEvent.create({
    data: {
      userId: input.userId,
      levelBefore: levels.levelBefore,
      levelAfter: levels.levelAfter,
      eventType: LevelChangeEventType.GAME,
      linkEntityType: input.linkEntityType,
      gameId: input.gameId,
      sport: input.sport,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    },
  });
  return true;
}

export async function createSetEvent(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    gameId: string;
    sport: Sport;
    linkEntityType: EntityType;
    levelBefore: number;
    levelAfter: number;
    levelChange: number;
  },
): Promise<boolean> {
  if (Math.abs(input.levelChange) <= 1e-9) {
    return false;
  }

  await tx.levelChangeEvent.create({
    data: {
      userId: input.userId,
      levelBefore: input.levelBefore,
      levelAfter: input.levelAfter,
      eventType: LevelChangeEventType.SET,
      linkEntityType: input.linkEntityType,
      gameId: input.gameId,
      sport: input.sport,
    },
  });
  return true;
}

export async function createSocialEvent(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    gameId: string;
    linkEntityType: EntityType;
    levelBefore: number;
    levelAfter: number;
  },
): Promise<void> {
  await tx.levelChangeEvent.create({
    data: {
      userId: input.userId,
      levelBefore: input.levelBefore,
      levelAfter: input.levelAfter,
      eventType: LevelChangeEventType.SOCIAL_PARTICIPANT,
      linkEntityType: input.linkEntityType,
      gameId: input.gameId,
    },
  });
}

export async function createBarEvent(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    gameId: string;
    linkEntityType: EntityType;
    levelBefore: number;
    levelAfter: number;
  },
): Promise<void> {
  await tx.levelChangeEvent.create({
    data: {
      userId: input.userId,
      levelBefore: input.levelBefore,
      levelAfter: input.levelAfter,
      eventType: LevelChangeEventType.SOCIAL_BAR,
      linkEntityType: input.linkEntityType,
      gameId: input.gameId,
    },
  });
}

export async function createQuestionnaireEvent(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    sport: Sport;
    levelBefore: number;
    levelAfter: number;
  },
): Promise<void> {
  await tx.levelChangeEvent.create({
    data: {
      userId: input.userId,
      levelBefore: input.levelBefore,
      levelAfter: input.levelAfter,
      eventType: LevelChangeEventType.QUESTIONNAIRE,
      sport: input.sport,
      gameId: null,
      linkEntityType: null,
    },
  });
}
