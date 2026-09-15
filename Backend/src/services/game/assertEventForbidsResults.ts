import { EntityType } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';

export async function assertEventForbidsResults(gameId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { entityType: true },
  });
  if (!game) throw new ApiError(404, 'Game not found');
  if (game.entityType === EntityType.EVENT) {
    throw new ApiError(400, 'Events do not have results');
  }
}
