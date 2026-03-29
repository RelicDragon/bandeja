import type { Prisma } from '@prisma/client';

export async function removeUserFromGameFixedTeams(
  tx: Prisma.TransactionClient,
  gameId: string,
  userId: string,
): Promise<void> {
  await tx.gameTeamPlayer.deleteMany({
    where: {
      userId,
      gameTeam: { gameId },
    },
  });

  await tx.gameTeam.deleteMany({
    where: {
      gameId,
      players: { none: {} },
    },
  });
}
