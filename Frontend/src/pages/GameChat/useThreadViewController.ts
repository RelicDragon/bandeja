import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ChatType } from '@/types';
import { type MessageListHandle } from '@/components/MessageList';
import { useAuthStore } from '@/store/authStore';
import { useShellNavStore } from '@/store/shellNavStore';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { normalizeChatType } from '@/utils/chatType';
import { chatSyncTailKey } from '@/utils/chatSyncScope';
import { cancelAllForContext } from '@/services/chatSendService';
import type { LocationState, GameChatProps } from './types';
import { getContextTypeFromRoute } from './types';
import { useGameChatContext } from './useGameChatContext';
import { useChatThreadController } from '@/services/chat/chatThreadController/useChatThreadController';
import { useThreadViewChrome } from './useThreadViewChrome';
import { recordChatThreadOpened } from '@/services/chat/chatThreadOpenStats';
import { markThreadArchivedInMemory } from '@/services/chat/chatThreadLifecycle';
import type { SendQueuedParams } from '@/components/chat/useMessageInputSubmit';
import type { ThreadViewValue } from './ThreadViewContext';
import { createChatNearBottomStore } from './chatNearBottomStore';
import { useThreadMarkReadOnNearBottom } from './useThreadMarkReadOnNearBottom';

export function useThreadViewController({
  isEmbedded = false,
  chatId: propChatId,
  chatType: propChatType,
}: GameChatProps): Omit<ThreadViewValue, 'effectiveFooterVariant'> {
  const { id: paramId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const setChatsFilter = useShellNavStore((s) => s.setChatsFilter);

  const id = propChatId ?? paramId;
  const locationState = location.state as LocationState | null;
  const contextType = getContextTypeFromRoute(location.pathname, locationState, isEmbedded, propChatType);
  const initialChatType = locationState?.initialChatType
    ? normalizeChatType(locationState.initialChatType)
    : undefined;

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<MessageListHandle>(null);
  const previousIdRef = useRef<string | undefined>(id);
  const previousContextTypeRef = useRef(contextType);
  const currentIdRef = useRef<string | undefined>(id);
  currentIdRef.current = id;

  const [currentChatType, setCurrentChatType] = useState<ChatType>(initialChatType ?? 'PUBLIC');
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const [showDeclineInviteModal, setShowDeclineInviteModal] = useState(false);
  const [isLeavingChat, setIsLeavingChat] = useState(false);
  const [isJoiningAsGuest, setIsJoiningAsGuest] = useState(false);
  const [isBlockedByUser, setIsBlockedByUser] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isTogglingMute, setIsTogglingMute] = useState(false);
  const [translateToLanguageForChat, setTranslateToLanguageForChat] = useState<string | null>(null);
  const chatNearBottomStoreRef = useRef(createChatNearBottomStore());
  const syncLiveNearBottomRef = useRef<(near: boolean) => void>(() => {});
  const setChatNearBottom = useCallback((near: boolean) => {
    chatNearBottomStoreRef.current.set(near);
    syncLiveNearBottomRef.current(near);
  }, []);
  const subscribeChatNearBottom = useCallback(
    (listener: () => void) => chatNearBottomStoreRef.current.subscribe(listener),
    []
  );
  const getChatNearBottom = useCallback(() => chatNearBottomStoreRef.current.get(), []);

  const {
    game,
    gameMarkReadRef,
    setGame,
    bug,
    setBug,
    userChat,
    setUserChat,
    groupChannel,
    setGroupChannel,
    groupChannelParticipantsCount,
    setGroupChannelParticipantsCount,
    isLoadingContext,
    setIsLoadingContext,
    loadContext,
    isGameChatArchived,
    setIsGameChatArchived,
    isGameChatAccessDenied,
    setIsGameChatAccessDenied,
    archivedGameMeta,
    setArchivedGameMeta,
  } = useGameChatContext({
    id,
    contextType,
    isEmbedded,
    initialUserChat: locationState?.chat ?? null,
    initialGroupChannel: locationState?.groupChannel ?? null,
    currentUserId: user?.id,
    navigate,
    setChatsFilter,
    currentIdRef,
  });

  const effectiveChatType = useMemo(
    () => (contextType === 'GAME' ? normalizeChatType(currentChatType) : 'PUBLIC') as ChatType,
    [contextType, currentChatType]
  );

  useEffect(() => {
    if (!id) return;
    void recordChatThreadOpened(
      contextType,
      id,
      contextType === 'GAME' ? effectiveChatType : undefined
    );
  }, [id, contextType, effectiveChatType]);

  const threadScrollKey = useMemo(() => {
    if (!id) return null;
    return chatSyncTailKey(
      contextType,
      id,
      contextType === 'GAME' ? effectiveChatType : undefined
    );
  }, [id, contextType, effectiveChatType]);

  const thread = useChatThreadController({
    id,
    contextType,
    currentChatType,
    effectiveChatType,
    chatContainerRef,
    messageListRef,
    currentIdRef,
    freshOpenSignal: locationState?.forceReload ?? 0,
    openAnchorMessageId: locationState?.anchorMessageId,
    user,
    setUserChat,
    userChat,
    isEmbedded,
    initialChatType,
    game,
    gameMarkReadRef,
    groupChannel,
    groupChannelId: groupChannel?.id,
    loadContext,
    setCurrentChatType,
    setIsBlockedByUser,
    setIsMuted,
    setTranslateToLanguageForChat,
    isLoadingContext,
    setIsLoadingContext,
    setIsGameChatAccessDenied,
    isBlockedByUser,
    isJoiningAsGuest,
    isGameChatArchived,
    isGameChatAccessDenied,
  });

  syncLiveNearBottomRef.current = thread.syncLiveNearBottom;

  const { setPage, setHasMoreMessages, setReplyTo, setEditingMessage } = thread;

  useThreadMarkReadOnNearBottom(subscribeChatNearBottom, getChatNearBottom, thread.markReadWhileViewing);

  const chrome = useThreadViewChrome({
    id,
    contextType,
    currentChatType,
    game,
    bug,
    userChat,
    groupChannel,
    groupChannelParticipantsCount,
    user,
    navigate,
    setChatsFilter,
    loadContext,
    setGame,
    setGroupChannel,
    derived: thread.derived,
    isGameChatArchived,
    archivedGameMeta,
    setMessages: thread.setMessages,
    messagesRef: thread.messagesRef,
    setPage: thread.setPage,
    setHasMoreMessages: thread.setHasMoreMessages,
    setIsSwitchingChatType: thread.setIsSwitchingChatType,
    teardownForChatTypeSwitch: thread.teardownForChatTypeSwitch,
    commitChatTypeSwitchPaint: thread.commitChatTypeSwitchPaint,
    finishChatTypeSwitch: thread.finishChatTypeSwitch,
    handleMarkFailed: thread.handleMarkFailed,
    handleNewMessageRef: thread.handleNewMessageRef,
    scrollToBottom: thread.scrollToBottom,
    currentIdRef,
    isLeavingChat,
    setIsLeavingChat,
    showLeaveConfirmation,
    setShowLeaveConfirmation,
    showDeclineInviteModal,
    setShowDeclineInviteModal,
    isJoiningAsGuest,
    setIsJoiningAsGuest,
    isMuted,
    setIsMuted,
    isTogglingMute,
    setIsTogglingMute,
    setCurrentChatType,
    markRead: thread.markRead,
  });

  const scrollToBottomSmooth = useCallback(() => {
    messageListRef.current?.scrollToBottomSmooth();
  }, []);

  const { handleTranslateToLanguageChange: applyTranslationPref } = chrome;

  const handleTranslateToLanguageChange = useCallback(
    async (value: string | null) => {
      await applyTranslationPref(value);
      setTranslateToLanguageForChat(value);
    },
    [applyTranslationPref]
  );

  const lastGameCancelled = useSocketEventsStore((s) => s.lastGameCancelled);
  const clearLastGameCancelled = useSocketEventsStore((s) => s.clearLastGameCancelled);

  useEffect(() => {
    if (!lastGameCancelled || lastGameCancelled.gameId !== id || contextType !== 'GAME') return;
    markThreadArchivedInMemory('GAME', id);
    setIsGameChatArchived(true);
    setArchivedGameMeta({
      cancelledAt: lastGameCancelled.cancelledAt,
      cancelledByUser: lastGameCancelled.cancelledByUser ?? null,
      chatArchived: true,
    });
    setGame((prev) =>
      prev
        ? { ...prev, status: 'ARCHIVED' }
        : prev
    );
    clearLastGameCancelled();
  }, [lastGameCancelled, id, contextType, setIsGameChatArchived, setArchivedGameMeta, setGame, clearLastGameCancelled]);

  useLayoutEffect(() => {
    if (id === previousIdRef.current && contextType === previousContextTypeRef.current) return;
    const prevId = previousIdRef.current;
    const prevContext = previousContextTypeRef.current;
    if (prevId) cancelAllForContext(prevContext, prevId);
    setGame(null);
    setBug(null);
    setUserChat(null);
    setGroupChannel(null);
    setGroupChannelParticipantsCount(0);
    setPage(1);
    setHasMoreMessages(true);
    setIsLoadingContext(true);
    setIsGameChatArchived(false);
    setIsGameChatAccessDenied(false);
    setArchivedGameMeta(null);
    setIsBlockedByUser(false);
    setIsMuted(false);
    setReplyTo(null);
    setEditingMessage(null);
    setCurrentChatType(initialChatType || 'PUBLIC');
    previousIdRef.current = id;
    previousContextTypeRef.current = contextType;
  }, [
    id,
    contextType,
    initialChatType,
    setGame,
    setBug,
    setUserChat,
    setGroupChannel,
    setGroupChannelParticipantsCount,
    setIsLoadingContext,
    setIsGameChatArchived,
    setIsGameChatAccessDenied,
    setArchivedGameMeta,
    setPage,
    setHasMoreMessages,
    setReplyTo,
    setEditingMessage,
  ]);

  const hasOpenContextStub = useMemo(
    () =>
      (contextType === 'USER' && userChat != null) ||
      (contextType === 'GROUP' && groupChannel != null) ||
      (contextType === 'GAME' && game != null),
    [contextType, userChat, groupChannel, game]
  );

  const showLoadingHeader = useMemo(() => {
    if (!isEmbedded || !isLoadingContext) return false;
    return !hasOpenContextStub && thread.messages.length === 0;
  }, [isEmbedded, isLoadingContext, hasOpenContextStub, thread.messages.length]);

  return {
    id,
    contextType,
    effectiveChatType,
    currentChatType,
    isEmbedded,
    isGameChatArchived,
    isGameChatAccessDenied,
    archivedGameMeta,
    game,
    bug,
    userChat,
    groupChannel,
    setGroupChannel,
    groupChannelParticipantsCount,
    setGroupChannelParticipantsCount,
    isLoadingContext,
    loadContext,
    messages: thread.messages,
    hasMoreMessages: thread.hasMoreMessages,
    isLoadingMessages: thread.isLoadingMessages,
    isInitialLoad: thread.isInitialLoad,
    isThreadOpenSettling: thread.isThreadOpenSettling,
    isLoadingMore: thread.isLoadingMore,
    isSwitchingChatType: thread.isSwitchingChatType,
    loadMessages: thread.loadMessages,
    loadMoreMessages: thread.loadMoreMessages,
    messageListRef,
    initialScroll: thread.initialScroll,
    openPaintGeneration: thread.openPaintGeneration,
    threadScrollKey,
    highlightAnchorMessageId: locationState?.anchorMessageId,
    handleAddOptimisticMessage: thread.handleAddOptimisticMessage,
    handleSendQueued: thread.handleSendQueued as (params: SendQueuedParams) => void,
    handleSendFailed: thread.handleSendFailed,
    handleReplaceOptimisticWithServerMessage: thread.handleReplaceOptimisticWithServerMessage,
    handleResendQueued: thread.handleResendQueued,
    handleRemoveFromQueue: thread.handleRemoveFromQueue,
    replyTo: thread.replyTo,
    editingMessage: thread.editingMessage,
    handleCancelReply: thread.handleCancelReply,
    handleCancelEdit: thread.handleCancelEdit,
    handleMessageUpdated: thread.handleMessageUpdated,
    handleEditMessage: thread.handleEditMessage,
    handleAddReaction: thread.handleAddReaction,
    handleRemoveReaction: thread.handleRemoveReaction,
    handleDeleteMessage: thread.handleDeleteMessage,
    handleReplyMessage: thread.handleReplyMessage,
    handlePollUpdated: thread.handlePollUpdated,
    handleForwardMessage: chrome.handleForwardMessage,
    handleChatRequestRespond: thread.handleChatRequestRespond,
    setChatNearBottom,
    subscribeChatNearBottom,
    getChatNearBottom,
    scrollToBottomSmooth,
    handleScrollToMessage: thread.handleScrollToMessage,
    scrollToMessageId: thread.scrollToMessageId,
    pinnedMessages: thread.pinnedMessages,
    pinnedMessagesOrdered: thread.pinnedMessagesOrdered,
    pinnedBarTopIndex: thread.pinnedBarTopIndex,
    loadingScrollTargetId: thread.loadingScrollTargetId,
    scrollTargetMessageId: thread.scrollTargetMessageId,
    handleScrollTargetReached: thread.handleScrollTargetReached,
    handlePinnedBarClick: thread.handlePinnedBarClick,
    handlePinMessage: thread.handlePinMessage,
    handleUnpinMessage: thread.handleUnpinMessage,
    derived: thread.derived,
    footerVariant: thread.footerVariant,
    isBlockedByUser,
    isJoiningAsGuest: chrome.isJoiningAsGuest,
    translateToLanguageForChat,
    autoTranslateForModal: thread.autoTranslateForModal,
    handleJoinAsGuest: chrome.handleJoinAsGuest,
    handleMessageSent: chrome.handleMessageSent,
    setUserChat,
    handleTranslateToLanguageChange,
    handleGroupChannelUpdate: chrome.handleGroupChannelUpdate,
    lastOwnMessage: thread.derived.lastOwnMessage,
    hasMessages: thread.messages.length > 0,
    isChannel: thread.derived.isChannel,
    title: chrome.title,
    titleContent: chrome.titleContent,
    titleMetaRow: chrome.titleMetaRow,
    subtitle: chrome.subtitle,
    icon: chrome.icon,
    panels: chrome.panels,
    failedMutationCount: chrome.failedMutationCount,
    retryMutations: chrome.retryMutations,
    autoTranslateLanguageCodes: thread.autoTranslate.autoTranslateConfig?.languageCodes ?? [],
    handleToggleMute: chrome.handleToggleMute,
    handleLeaveClick: chrome.handleLeaveClick,
    handleLeaveChat: chrome.handleLeaveChat,
    handleDeclineInviteFromChat: chrome.handleDeclineInviteFromChat,
    handleJoinChannel: chrome.handleJoinChannel,
    handleChatTypeChange: chrome.handleChatTypeChange,
    leaveModalLabels: chrome.leaveModalLabels,
    isMuted: chrome.isMuted,
    isTogglingMute: chrome.isTogglingMute,
    isLeavingChat,
    showLeaveConfirmation: chrome.showLeaveConfirmation,
    setShowLeaveConfirmation: chrome.setShowLeaveConfirmation,
    showDeclineInviteModal: chrome.showDeclineInviteModal,
    setShowDeclineInviteModal: chrome.setShowDeclineInviteModal,
    forwardingMessage: chrome.forwardingMessage,
    setForwardingMessage: chrome.setForwardingMessage,
    forwardContextType: chrome.forwardContextType,
    forwardContextId: chrome.forwardContextId,
    chatContainerRef,
    showLoadingHeader,
    navigate,
  };
}
