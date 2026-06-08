import prisma from '../../config/database';
import { gameWithRoundsAndOutcomes } from '../game/gamePrismaIncludes';

export async function loadGameForResultsSummary(gameId: string) {
  return prisma.game.findUnique({
    where: { id: gameId },
    include: {
      ...gameWithRoundsAndOutcomes,
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
