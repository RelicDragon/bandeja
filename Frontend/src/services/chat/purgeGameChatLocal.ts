import { purgeLocalDexieThread } from './chatLocalThreadPurge';
import { socketService } from '@/services/socketService';

export async function purgeGameChatLocal(gameId: string): Promise<void> {
  socketService.leaveChatRoom('GAME', gameId);
  await purgeLocalDexieThread('GAME', gameId);
}

export { archiveGameChatLocal } from './chatThreadLifecycle';

export function isGameChatContextGoneHttpError(error: unknown): boolean {
  const err = error as { response?: { status?: number } };
  return err.response?.status === 404;
}

export function isGameChatArchivedHttpError(error: unknown): boolean {
  const err = error as {
    response?: { status?: number; data?: { cancelled?: boolean } };
  };
  return err.response?.status === 410 && err.response?.data?.cancelled === true;
}
