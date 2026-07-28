import type { ChatType } from '@/types';
import { dropPendingOutboxForContext } from './chatThreadLifecycle';
import { purgeLocalDexieThread } from './chatLocalThreadPurge';
import { clearGameChatSyncContext } from './resolveGameChatSyncTypes';
import { socketService } from '@/services/socketService';

export async function purgeGameChatLocal(gameId: string): Promise<void> {
  // Dynamic import avoids cycle with chatSyncScheduler → purgeGameChatLocal.
  const { cancelChatSyncPull } = await import('./chatSyncScheduler');
  cancelChatSyncPull('GAME', gameId);
  socketService.leaveChatRoom('GAME', gameId);
  clearGameChatSyncContext(gameId);
  await dropPendingOutboxForContext('GAME', gameId);
  await purgeLocalDexieThread('GAME', gameId);
}

export { archiveGameChatLocal } from './chatThreadLifecycle';

function httpStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } }).response?.status;
}

function httpErrorCode(error: unknown): string | undefined {
  const code = (error as { response?: { data?: { code?: unknown } } }).response?.data?.code;
  return typeof code === 'string' ? code : undefined;
}

/** Archived write-deny — must not wipe local history. */
function isThreadArchivedForbidden(error: unknown): boolean {
  return httpStatus(error) === 403 && httpErrorCode(error) === 'chat.threadArchived';
}

/** Game missing (404) or viewer no longer a participant (403 on game-scoped access). */
export function isGameChatContextGoneHttpError(error: unknown): boolean {
  if (isThreadArchivedForbidden(error)) return false;
  const status = httpStatus(error);
  return status === 404 || status === 403;
}

/**
 * Whether a failed pull should wipe the whole local GAME thread.
 * Channel-scoped 403 (PRIVATE/ADMINS while still a participant) must not purge PUBLIC history.
 */
export function shouldPurgeGameChatOnHttpError(
  error: unknown,
  gameChatType?: ChatType
): boolean {
  if (isThreadArchivedForbidden(error)) return false;
  const status = httpStatus(error);
  if (status === 404) return true;
  if (status !== 403) return false;
  if (gameChatType === 'PRIVATE' || gameChatType === 'ADMINS') return false;
  return true;
}

/** Channel-scoped deny: stop this pull without wiping the game thread. */
export function isGameChatChannelDeniedHttpError(
  error: unknown,
  gameChatType?: ChatType
): boolean {
  return (
    httpStatus(error) === 403 &&
    !isThreadArchivedForbidden(error) &&
    (gameChatType === 'PRIVATE' || gameChatType === 'ADMINS')
  );
}

export function isGameChatArchivedHttpError(error: unknown): boolean {
  const err = error as {
    response?: { status?: number; data?: { cancelled?: boolean } };
  };
  return err.response?.status === 410 && err.response?.data?.cancelled === true;
}
