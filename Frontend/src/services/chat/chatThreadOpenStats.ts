import type { ChatContextType, ChatType } from '@/api/chat';
import { chatCursorKey, chatLocalDb } from './chatLocalDb';

export async function recordChatThreadOpened(
  contextType: ChatContextType,
  contextId: string,
  gameChatType?: ChatType
): Promise<void> {
  const key = chatCursorKey(contextType, contextId);
  const row = await chatLocalDb.chatThreads.get(key);
  const now = Date.now();
  const base = row ?? { key, serverMaxSeq: 0, updatedAt: now };
  await chatLocalDb.chatThreads.put({
    ...base,
    key,
    serverMaxSeq: base.serverMaxSeq ?? 0,
    updatedAt: now,
    lastOpenedAt: now,
    openCount: (base.openCount ?? 0) + 1,
    ...(contextType === 'GAME' && gameChatType ? { lastGameChatType: gameChatType } : {}),
  });
}
