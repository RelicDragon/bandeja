import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';

export async function assertMatchBelongsToGame(gameId: string, matchId: string): Promise<void> {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, round: { select: { gameId: true } } },
  });
  if (!m) {
    throw new ApiError(404, 'Match not found');
  }
  if (m.round.gameId !== gameId) {
    throw new ApiError(400, 'Match does not belong to the specified game');
  }
}
