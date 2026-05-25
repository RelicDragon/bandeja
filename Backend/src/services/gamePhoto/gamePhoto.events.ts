import { GameReadService } from '../game/read.service';
import type { GamePhotoDto } from './gamePhoto.read.service';

function getIo() {
  const socketService = (global as { socketService?: { io?: { to: (room: string) => { emit: (event: string, payload: unknown) => void } } } })
    .socketService;
  return socketService?.io ?? null;
}

export async function emitGamePhotoAdded(gameId: string, photo: GamePhotoDto, actorUserId: string) {
  const io = getIo();
  if (!io) return;
  io.to(`game-${gameId}`).emit('game_photo:added', { gameId, photo });
  await emitGameUpdateForPhotos(gameId, actorUserId);
}

export async function emitGamePhotoDeleted(
  gameId: string,
  payload: { photoId: string; mainPhotoId: string | null; photosCount: number },
  actorUserId: string
) {
  const io = getIo();
  if (!io) return;
  io.to(`game-${gameId}`).emit('game_photo:deleted', { gameId, ...payload });
  await emitGameUpdateForPhotos(gameId, actorUserId);
}

export async function emitGamePhotoMainChanged(
  gameId: string,
  mainPhotoId: string | null,
  actorUserId: string
) {
  const io = getIo();
  if (!io) return;
  io.to(`game-${gameId}`).emit('game_photo:main_changed', { gameId, mainPhotoId });
  await emitGameUpdateForPhotos(gameId, actorUserId);
}

async function emitGameUpdateForPhotos(gameId: string, actorUserId: string) {
  try {
    const socketService = (global as { socketService?: { emitGameUpdate: (a: string, b: string, c?: unknown) => Promise<void> } })
      .socketService;
    if (!socketService) return;
    const fullGame = await GameReadService.getGameById(gameId, actorUserId);
    if (fullGame) {
      await socketService.emitGameUpdate(gameId, actorUserId, fullGame);
    }
  } catch (error) {
    console.error('Failed to emit game update after photo change:', error);
  }
}
