import type { ChatContextType } from '@/api/chat';
import type { ChatItem } from '@/utils/chatListSort';
import {
  enqueueChatSyncPull,
  SYNC_PRIORITY_COOP,
  SYNC_PRIORITY_WARM,
} from '@/services/chat/chatSyncScheduler';

const DEFAULT_LIMIT = 22;
const HOT_COUNT = 6;

export function prefetchTopChatsSync(chats: ChatItem[], limit = DEFAULT_LIMIT): void {
  let n = 0;
  for (const item of chats) {
    if (n >= limit) break;
    if (item.type === 'contact') continue;
    let contextType: ChatContextType;
    let contextId: string;
    if (item.type === 'user') {
      contextType = 'USER';
      contextId = item.data.id;
    } else if (item.type === 'group' || item.type === 'channel') {
      contextType = 'GROUP';
      contextId = item.data.id;
    } else if (item.type === 'game') {
      contextType = 'GAME';
      contextId = item.data.id;
    } else {
      continue;
    }
    const priority = n < HOT_COUNT ? SYNC_PRIORITY_COOP : SYNC_PRIORITY_WARM;
    enqueueChatSyncPull(contextType, contextId, priority);
    n++;
  }
}
