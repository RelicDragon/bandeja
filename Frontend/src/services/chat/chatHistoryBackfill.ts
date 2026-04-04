import type { ChatContextType, ChatMessage } from '@/api/chat';
import { chatApi } from '@/api/chat';
import type { ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { persistChatMessagesFromApi } from '@/services/chat/chatLocalApply';

const PAGE_SIZE = 50;
const DEFAULT_MAX_PAGES = 4;

export async function backfillChatHistoryPages(
  contextType: ChatContextType,
  contextId: string,
  chatType: ChatType,
  oldestMessageId: string,
  maxPages: number = DEFAULT_MAX_PAGES
): Promise<void> {
  let cursor = oldestMessageId;
  for (let i = 0; i < maxPages; i++) {
    let batch: ChatMessage[];
    if (contextType === 'USER') {
      batch = await chatApi.getUserChatMessages(contextId, 1, PAGE_SIZE, cursor);
    } else if (contextType === 'GROUP') {
      batch = await chatApi.getGroupChannelMessages(contextId, 1, PAGE_SIZE, cursor);
    } else if (contextType === 'BUG') {
      batch = await chatApi.getBugMessages(contextId, 1, PAGE_SIZE, cursor);
    } else {
      batch = await chatApi.getMessages(
        contextType,
        contextId,
        1,
        PAGE_SIZE,
        normalizeChatType(chatType),
        cursor
      );
    }
    if (batch.length === 0) break;
    await persistChatMessagesFromApi(batch);
    cursor = batch[0]!.id;
    if (batch.length < PAGE_SIZE) break;
  }
}
