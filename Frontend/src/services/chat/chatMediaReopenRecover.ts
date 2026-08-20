import { chatApi } from '@/api/chat';
import type { ChatMessage } from '@/api/chat';
import { persistChatMessagesFromApi } from './chatLocalApplyWrite';
import { isEmptyMediaMessage, mediaUrlCount } from './chatMediaPersistTombstone';

export async function recoverEmptyMediaMessages(messages: readonly ChatMessage[]): Promise<void> {
  for (const message of messages) {
    if (!isEmptyMediaMessage(message)) continue;
    try {
      const fresh = await chatApi.getChatMessageById(message.id);
      if (mediaUrlCount(fresh) === 0) continue;
      await persistChatMessagesFromApi([fresh]);
    } catch {
      /* keep durable empty/tombstone */
    }
  }
}
