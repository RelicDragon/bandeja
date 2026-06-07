import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { ChatContextType, ChatMessageWithStatus } from '@/api/chat';
import type { ChatType } from '@/types';
import { chatSyncTailKey } from '@/utils/chatSyncScope';
import { reconcileAfterPaint } from '@/services/chat/threadOpen';

export type ChatOpenReconcileParams = {
  contextType: ChatContextType;
  contextId: string;
  gameChatType: ChatType;
  currentIdRef: RefObject<string | undefined>;
  messagesRef: RefObject<ChatMessageWithStatus[]>;
  setMessages: Dispatch<SetStateAction<ChatMessageWithStatus[]>>;
  threadKey?: string;
  paintGeneration?: number;
};

export { takeAllGameTabMissedMessages } from '@/services/chat/chatOpenMissedFlush';

/** @deprecated Prefer `reconcileAfterPaint` from `threadOpen`. */
export async function reconcileChatThreadOpen(params: ChatOpenReconcileParams): Promise<void> {
  const threadKey =
    params.threadKey ??
    chatSyncTailKey(
      params.contextType,
      params.contextId,
      params.contextType === 'GAME' ? params.gameChatType : undefined
    );
  await reconcileAfterPaint({
    threadKey,
    paintGeneration: params.paintGeneration,
    contextType: params.contextType,
    contextId: params.contextId,
    gameChatType: params.gameChatType,
    currentIdRef: params.currentIdRef,
    messagesRef: params.messagesRef,
    setMessages: params.setMessages,
  });
}
