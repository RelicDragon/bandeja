import prisma from '../../config/database';
import { GameReadService } from '../game/read.service';

async function resolveGameUpdateActorId(gameId: string): Promise<string | null> {
  const owner = await prisma.gameParticipant.findFirst({
    where: { gameId, status: 'PLAYING', role: 'OWNER' },
    select: { userId: true },
    orderBy: { joinedAt: 'asc' },
  });
  if (owner) return owner.userId;

  const participant = await prisma.gameParticipant.findFirst({
    where: { gameId, status: 'PLAYING' },
    select: { userId: true },
    orderBy: { joinedAt: 'asc' },
  });
  return participant?.userId ?? null;
}

export async function emitGameUpdateAfterArtifactsChange(
  gameId: string,
  forceUpdate = false
): Promise<void> {
  try {
    const socketService = (
      global as {
        socketService?: {
          emitGameUpdate: (
            gameId: string,
            senderId: string,
            game?: unknown,
            forceUpdate?: boolean
          ) => Promise<void>;
        };
      }
    ).socketService;
    if (!socketService) return;

    const actorUserId = await resolveGameUpdateActorId(gameId);
    if (!actorUserId) return;

    const fullGame = await GameReadService.getGameById(gameId, actorUserId);
    if (fullGame) {
      await socketService.emitGameUpdate(gameId, actorUserId, fullGame, forceUpdate);
    }
  } catch (error) {
    console.error('Failed to emit game update after artifacts change:', error);
  }
}
