import prisma from '../../../config/database';
import { ReadReceiptService } from '../readReceipt.service';

export async function batchGameUnreadCountsForUser(
  userId: string
): Promise<Record<string, number>> {
  const minimalGames = await prisma.game.findMany({
    where: { status: { not: 'ARCHIVED' }, participants: { some: { userId } } },
    select: {
      id: true,
      status: true,
      participants: {
        where: { userId },
        select: { status: true, role: true },
      },
    },
  });

  if (minimalGames.length === 0) return {};

  return ReadReceiptService.getGamesUnreadCountsFromGames(
    minimalGames.map((game) => ({
      id: game.id,
      status: String(game.status),
      participants: game.participants.map((participant) => ({
        status: String(participant.status),
        role: String(participant.role),
      })),
    })),
    userId
  );
}

export async function batchGameUnreadCounts(
  userId: string,
  gameIds: string[]
): Promise<Record<string, number>> {
  if (gameIds.length === 0) return {};

  const games = await prisma.game.findMany({
    where: { id: { in: gameIds }, participants: { some: { userId } } },
    select: {
      id: true,
      status: true,
      participants: {
        where: { userId },
        select: { status: true, role: true },
      },
    },
  });

  if (games.length === 0) return {};

  return ReadReceiptService.getGamesUnreadCountsFromGames(
    games.map((game) => ({
      id: game.id,
      status: String(game.status),
      participants: game.participants.map((participant) => ({
        status: String(participant.status),
        role: String(participant.role),
      })),
    })),
    userId
  );
}
