import type { ChatContextType, ChatMessage } from '@/api/chat';
import type { ChatType } from '@/types';
import { useChatSyncStore } from '@/store/chatSyncStore';

/** Sole seam for chatSyncStore tail / missed / list-bump mutations from Local Apply. */
export function bridgeGetLastMessageId(
  contextType: ChatContextType,
  contextId: string,
  gameChatType?: ChatType
): string | null {
  return useChatSyncStore.getState().getLastMessageId(contextType, contextId, gameChatType);
}

export function bridgeSetLastMessageId(
  contextType: ChatContextType,
  contextId: string,
  messageId: string | null,
  gameChatType?: ChatType
): void {
  useChatSyncStore.getState().setLastMessageId(contextType, contextId, messageId, gameChatType);
}

export function bridgeAddMissedMessages(
  contextType: ChatContextType,
  contextId: string,
  messages: ChatMessage[],
  gameChatType?: ChatType
): void {
  useChatSyncStore.getState().addMissedMessages(contextType, contextId, messages, gameChatType);
}

export function bridgeTakeMissedMessages(
  contextType: ChatContextType,
  contextId: string,
  gameChatType?: ChatType
): ChatMessage[] {
  return useChatSyncStore.getState().getAndClearMissed(contextType, contextId, gameChatType);
}

export function bridgeBumpChatListDexie(): void {
  useChatSyncStore.getState().bumpChatListDexieBump();
}

export function bridgeClearChatSyncTailState(contextType: ChatContextType, contextId: string): void {
  useChatSyncStore.getState().clearChatSyncTailState(contextType, contextId);
}
