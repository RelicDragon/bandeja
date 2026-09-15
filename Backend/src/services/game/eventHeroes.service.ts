import prisma from '../../config/database';
import { EntityType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { EVENT_MAX_HEROES } from '@bandeja/shared/entityCapabilities';
import { eventHeroCreates, type EventHeroInput } from './eventCreateDefaults';
import { gameWithRoundsAndOutcomes } from './gamePrismaIncludes';

export async function replaceEventHeroes(gameId: string, heroes: EventHeroInput[]) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { entityType: true },
  });
  if (!game || game.entityType !== EntityType.EVENT) {
    throw new ApiError(400, 'Not an event listing');
  }
  if (heroes.length < 1) {
    throw new ApiError(400, 'At least one event image is required');
  }
  if (heroes.length > EVENT_MAX_HEROES) {
    throw new ApiError(400, `At most ${EVENT_MAX_HEROES} event images are allowed`);
  }
  await prisma.$transaction([
    prisma.gameEventHero.deleteMany({ where: { gameId } }),
    ...(heroes.length
      ? [
          prisma.gameEventHero.createMany({
            data: eventHeroCreates(heroes).map((row) => ({ ...row, gameId })),
          }),
        ]
      : []),
  ]);
  return prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    include: gameWithRoundsAndOutcomes,
  });
}
