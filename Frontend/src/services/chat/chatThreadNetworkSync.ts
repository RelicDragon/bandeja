import type { ChatContextType, ChatMessage } from '@/api/chat';
import { chatApi } from '@/api/chat';
import type { ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { bridgeGetLastMessageId } from '@/services/chat/chatLocalApplyStoreBridge';
import { hydrateLastMessageIdFromDexieIfMissing } from '@/services/chat/messageContextHead';
import { applyThreadEvent } from '@/services/chat/chatLocalApplyThreadEvent';

export async function pullMissedAndPersistToDexie(opts: {
  contextType: ChatContextType;
  contextId: string;
  gameChatType?: ChatType;
}): Promise<ChatMessage[]> {
  const { contextType, contextId, gameChatType } = opts;
  await hydrateLastMessageIdFromDexieIfMissing(
    contextType,
    contextId,
    contextType === 'GAME' ? gameChatType : undefined
  );
  const normalized = contextType === 'GAME' ? normalizeChatType(gameChatType ?? 'PUBLIC') : undefined;
  const lastId = bridgeGetLastMessageId(
    contextType,
    contextId,
    contextType === 'GAME' ? gameChatType : undefined
  );
  const missed = await chatApi.getMissedMessages(
    contextType,
    contextId,
    lastId ?? undefined,
    normalized
  );
  if (missed.length > 0) {
    await applyThreadEvent({ kind: 'httpMessages', messages: missed });
  }
  return missed;
}
