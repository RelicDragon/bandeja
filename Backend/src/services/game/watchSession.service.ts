import { GameStatus, ResultsStatus } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';

export async function patchMyWatchSession(gameId: string, userId: string, activeMatchId: string | null) {
  const game = await prisma.game.findFirst({
    where: { id: gameId },
    select: { id: true, status: true, resultsStatus: true },
  });
  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const participant = await prisma.gameParticipant.findFirst({
    where: { gameId, userId },
  });
  if (!participant) {
    throw new ApiError(404, 'Not a participant of this game');
  }

  if (activeMatchId !== null) {
    if (game.status !== GameStatus.STARTED || game.resultsStatus !== ResultsStatus.IN_PROGRESS) {
      throw new ApiError(400, 'Game is not in scoring');
    }
    const match = await prisma.match.findFirst({
      where: { id: activeMatchId, round: { gameId } },
      select: { id: true },
    });
    if (!match) {
      throw new ApiError(400, 'Match not found for this game');
    }
  }

  const updated = await prisma.gameParticipant.update({
    where: { id: participant.id },
    data: { activeMatchId },
    select: { id: true, activeMatchId: true },
  });
  return updated;
}
