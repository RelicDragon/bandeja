import type { ChatContextType } from '@/api/chat';
import { chatApi } from '@/api/chat';
import type { ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { chatLocalDb } from '@/services/chat/chatLocalDb';
import { persistChatMessagesFromApi } from '@/services/chat/chatLocalApply';
import { syncLastMessageIdsToStoreFromLocalHeadsForContext } from '@/services/chat/messageContextHead';

const TAIL_LIMIT = 80;

async function persistOneTailPage(
  contextType: ChatContextType,
  contextId: string,
  gameChatType?: ChatType
): Promise<void> {
  if (contextType === 'USER') {
    const page = await chatApi.getUserChatMessages(contextId, 1, TAIL_LIMIT);
    if (page.length === 0) return;
    await persistChatMessagesFromApi(page);
    return;
  }
  if (contextType === 'GROUP') {
    const page = await chatApi.getGroupChannelMessages(contextId, 1, TAIL_LIMIT);
    if (page.length === 0) return;
    await persistChatMessagesFromApi(page);
    return;
  }
  if (contextType === 'BUG') {
    const page = await chatApi.getBugMessages(contextId, 1, TAIL_LIMIT);
    if (page.length === 0) return;
    await persistChatMessagesFromApi(page);
    return;
  }
  if (contextType === 'GAME') {
    const ct = normalizeChatType(gameChatType ?? 'PUBLIC');
    const page = await chatApi.getMessages(contextType, contextId, 1, TAIL_LIMIT, ct);
    if (page.length === 0) return;
    await persistChatMessagesFromApi(page);
  }
}

export async function persistLatestTailPagesAfterStaleCursor(
  contextType: ChatContextType,
  contextId: string
): Promise<void> {
  if (contextType === 'GAME') {
    const prefix = `GAME:${contextId}:`;
    const heads = await chatLocalDb.messageContextHead.filter((h) => h.key.startsWith(prefix)).toArray();
    const types = [...new Set(heads.map((h) => h.key.slice(prefix.length) as ChatType))];
    const toFetch = types.length > 0 ? types : (['PUBLIC'] as ChatType[]);
    for (const gt of toFetch) {
      await persistOneTailPage('GAME', contextId, gt).catch(() => {});
    }
  } else if (contextType === 'USER' || contextType === 'GROUP' || contextType === 'BUG') {
    await persistOneTailPage(contextType, contextId).catch(() => {});
  }
  await syncLastMessageIdsToStoreFromLocalHeadsForContext(contextType, contextId);
}
