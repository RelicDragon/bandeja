import { isAxiosError } from 'axios';
import { chatApi } from '@/api/chat';
import type { ChatMessage } from '@/api/chat';
import { persistChatMessagesFromApi } from './chatLocalApplyWrite';
import { isRetryableMutationError, shouldQueueChatMutation } from './chatMutationNetwork';
import { isEmptyMediaMessage, mediaUrlCount } from './chatMediaPersistTombstone';

export const MAX_MEDIA_REOPEN_GETS_PER_PASS = 8;

const conclusiveRecoverIds = new Set<string>();

export function resetMediaReopenRecoverForTests(): void {
  conclusiveRecoverIds.clear();
}

function isConclusiveMissing(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 404 || status === 410;
}

export async function recoverEmptyMediaMessages(messages: readonly ChatMessage[]): Promise<void> {
  if (shouldQueueChatMutation()) return;
  let gets = 0;
  for (const message of messages) {
    if (gets >= MAX_MEDIA_REOPEN_GETS_PER_PASS) break;
    if (!isEmptyMediaMessage(message) || conclusiveRecoverIds.has(message.id)) continue;
    gets += 1;
    try {
      const fresh = await chatApi.getChatMessageById(message.id);
      if (mediaUrlCount(fresh) === 0) {
        conclusiveRecoverIds.add(message.id);
        continue;
      }
      try {
        await persistChatMessagesFromApi([fresh]);
      } catch {
        /* keep durable empty/tombstone; do not GET again this session */
      }
      conclusiveRecoverIds.add(message.id);
    } catch (error) {
      if (isConclusiveMissing(error) || !isRetryableMutationError(error)) {
        conclusiveRecoverIds.add(message.id);
      }
    }
  }
}
