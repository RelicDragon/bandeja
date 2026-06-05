import type { RefObject } from 'react';
import type { ChatContextType, ChatMessage, ChatMessageWithStatus } from '@/api/chat';
import type { ChatType } from '@/types';
import type { Game } from '@/types';
import type { UserChat as UserChatType } from '@/api/chat';
import { useGameChatInitialLoad, type UseGameChatInitialLoadParams } from './useGameChatInitialLoad';
import { useGameChatSocket, type UseGameChatSocketParams } from './useGameChatSocket';
import type { BootstrapOutboxContext } from './useGameChatMessages';

export type UseThreadSessionEffectsParams = {
  id: string | undefined;
  user: UseGameChatInitialLoadParams['user'];
  contextType: ChatContextType;
  initialChatType: ChatType | undefined;
  currentChatType: ChatType;
  effectiveChatType: ChatType;
  game: Game | null;
  groupChannelId?: string;
  loadContext: UseGameChatInitialLoadParams['loadContext'];
  bootstrapThread: (gameChatType?: ChatType, outbox?: BootstrapOutboxContext) => Promise<boolean>;
  userChat: UserChatType | null;
  handleMarkFailed: (tempId: string) => void;
  handleReplaceOptimistic: (tempId: string, message: ChatMessage) => void;
  handleNewMessageRef: React.MutableRefObject<((message: ChatMessage) => string | void) | undefined>;
  loadingIdRef: React.MutableRefObject<string | undefined>;
  hasLoadedRef: React.MutableRefObject<boolean>;
  isLoadingRef: React.MutableRefObject<boolean>;
  messagesRef: React.MutableRefObject<ChatMessageWithStatus[]>;
  openPaintCommittedRef: React.MutableRefObject<boolean>;
  freshOpenSignal?: number;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>;
  setCurrentChatType: (t: ChatType) => void;
  setIsBlockedByUser: (v: boolean) => void;
  setIsMuted: (v: boolean) => void;
  setTranslateToLanguageForChat: (v: string | null) => void;
  setIsInitialLoad: (v: boolean) => void;
  setIsLoadingMessages: (v: boolean) => void;
  setIsLoadingContext: (v: boolean) => void;
  currentIdRef: RefObject<string | undefined>;
  userId: string | undefined;
  chatContainerRef: RefObject<HTMLDivElement | null>;
  handleNewMessage: (message: ChatMessage) => string | void;
  handleMessageReaction: UseGameChatSocketParams['handleMessageReaction'];
  handleReadReceipt: UseGameChatSocketParams['handleReadReceipt'];
  handleMessageDeleted: UseGameChatSocketParams['handleMessageDeleted'];
  fetchPinnedMessages: () => void;
  handleMessageUpdated: UseGameChatSocketParams['handleMessageUpdated'];
  reloadMessagesFirstPage: () => void | Promise<void>;
  pinAfterSocketMergeIfAllowed?: () => void;
};

/** ThreadSession-owned socket tail + bootstrap/outbox hydrate after optimistic handlers exist. */
export function useThreadSessionEffects(params: UseThreadSessionEffectsParams): void {
  useGameChatInitialLoad({
    id: params.id,
    user: params.user,
    contextType: params.contextType,
    initialChatType: params.initialChatType,
    currentChatType: params.currentChatType,
    game: params.game,
    groupChannelId: params.groupChannelId,
    loadContext: params.loadContext,
    bootstrapThread: params.bootstrapThread,
    userChat: params.userChat,
    handleMarkFailed: params.handleMarkFailed,
    handleReplaceOptimistic: params.handleReplaceOptimistic,
    handleNewMessageRef: params.handleNewMessageRef,
    loadingIdRef: params.loadingIdRef,
    hasLoadedRef: params.hasLoadedRef,
    isLoadingRef: params.isLoadingRef,
    messagesRef: params.messagesRef,
    openPaintCommittedRef: params.openPaintCommittedRef,
    freshOpenSignal: params.freshOpenSignal,
    setMessages: params.setMessages,
    setCurrentChatType: params.setCurrentChatType,
    setIsBlockedByUser: params.setIsBlockedByUser,
    setIsMuted: params.setIsMuted,
    setTranslateToLanguageForChat: params.setTranslateToLanguageForChat,
    setIsInitialLoad: params.setIsInitialLoad,
    setIsLoadingMessages: params.setIsLoadingMessages,
    setIsLoadingContext: params.setIsLoadingContext,
  });

  useGameChatSocket({
    id: params.id,
    contextType: params.contextType,
    effectiveChatType: params.effectiveChatType,
    currentIdRef: params.currentIdRef,
    userId: params.userId,
    setMessages: params.setMessages,
    messagesRef: params.messagesRef,
    chatContainerRef: params.chatContainerRef,
    handleNewMessage: params.handleNewMessage,
    handleMessageReaction: params.handleMessageReaction,
    handleReadReceipt: params.handleReadReceipt,
    handleMessageDeleted: params.handleMessageDeleted,
    fetchPinnedMessages: params.fetchPinnedMessages,
    handleMessageUpdated: params.handleMessageUpdated,
    reloadMessagesFirstPage: params.reloadMessagesFirstPage,
    onAfterSocketBatch: params.pinAfterSocketMergeIfAllowed,
  });
}
