import prisma from '../../config/database';
import { getGameInclude } from '../game/read.service';

export async function loadGameForResultsSummary(gameId: string) {
  return prisma.game.findUnique({
    where: { id: gameId },
    include: {
      ...getGameInclude(),
      city: {
        select: {
          id: true,
          name: true,
          telegramPinnedLanguage: true,
        },
      },
    } as any,
  });
}
