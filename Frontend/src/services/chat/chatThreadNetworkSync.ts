import type { ChatContextType, ChatMessage } from '@/api/chat';
import { chatApi } from '@/api/chat';
import type { ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { bridgeGetLastMessageId } from '@/services/chat/chatLocalApplyStoreBridge';
import { hydrateLastMessageIdFromDexieIfMissing } from '@/services/chat/messageContextHead';
import { applyThreadEvent } from '@/services/chat/chatLocalApplyThreadEvent';
import {
  archiveGameChatLocal,
  isGameChatArchivedHttpError,
  isGameChatChannelDeniedHttpError,
  purgeGameChatLocal,
  shouldPurgeGameChatOnHttpError,
} from '@/services/chat/purgeGameChatLocal';

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

  try {
    const result = await chatApi.getMissedMessages(
      contextType,
      contextId,
      lastId ?? undefined,
      normalized
    );
    if (result.messages.length > 0) {
      await applyThreadEvent({ kind: 'httpMessages', messages: result.messages });
    }
    return result.messages;
  } catch (error) {
    if (contextType === 'GAME') {
      if (isGameChatArchivedHttpError(error)) {
        await archiveGameChatLocal(contextId);
        return [];
      }
      // Match the chatType actually requested (undefined → PUBLIC).
      const deniedType = normalized;
      if (shouldPurgeGameChatOnHttpError(error, deniedType)) {
        await purgeGameChatLocal(contextId);
        return [];
      }
      if (isGameChatChannelDeniedHttpError(error, deniedType)) {
        return [];
      }
    }
    throw error;
  }
}
