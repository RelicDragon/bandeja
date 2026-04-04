import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { chatLocalDb } from './chatLocalDb';

function parseHeadKey(key: string): { contextType: ChatContextType; contextId: string; gameChatType?: ChatType } | null {
  const parts = key.split(':');
  if (parts.length === 2) {
    const ct = parts[0] as ChatContextType;
    if (ct === 'GAME') return null;
    if (ct !== 'USER' && ct !== 'BUG' && ct !== 'GROUP') return null;
    return { contextType: ct, contextId: parts[1]! };
  }
  if (parts.length === 3 && parts[0] === 'GAME') {
    return {
      contextType: 'GAME',
      contextId: parts[1]!,
      gameChatType: parts[2] as ChatType,
    };
  }
  return null;
}

export async function hydrateAllChatSyncTailsFromDexie(): Promise<void> {
  const rows = await chatLocalDb.messageContextHead.toArray();
  const store = useChatSyncStore.getState();
  for (const row of rows) {
    const parsed = parseHeadKey(row.key);
    if (!parsed || !row.latestMessageId) continue;
    store.setLastMessageId(parsed.contextType, parsed.contextId, row.latestMessageId, parsed.gameChatType);
  }
}
