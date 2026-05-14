import { Prisma } from '@prisma/client';
import { resolvePrismaMatchWinnerTeamId } from './matchStandingsPrisma';

export async function updateMatchWinners(
  gameId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  const game = await tx.game.findUnique({
    where: { id: gameId },
    include: {
      rounds: {
        include: {
          matches: {
            include: {
              teams: true,
              sets: { orderBy: { setNumber: 'asc' } },
            },
          },
        },
      },
    },
  });

  if (!game) return;

  for (const round of game.rounds) {
    for (const match of round.matches) {
      const winnerId = resolvePrismaMatchWinnerTeamId(match, game);
      await tx.match.update({
        where: { id: match.id },
        data: { winnerId },
      });
    }
  }
}
