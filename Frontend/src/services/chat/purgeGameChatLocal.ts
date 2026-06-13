import { purgeLocalDexieThread } from './chatLocalThreadPurge';
import { socketService } from '@/services/socketService';

export async function purgeGameChatLocal(gameId: string): Promise<void> {
  socketService.leaveChatRoom('GAME', gameId);
  await purgeLocalDexieThread('GAME', gameId);
}

export function isGameChatContextGoneHttpError(error: unknown): boolean {
  const err = error as {
    response?: { status?: number; data?: { cancelled?: boolean } };
  };
  const status = err.response?.status;
  if (status === 404) return true;
  if (status === 410 && err.response?.data?.cancelled === true) return true;
  return false;
}
