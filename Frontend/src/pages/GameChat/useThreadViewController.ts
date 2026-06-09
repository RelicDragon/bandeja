import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { ChatType } from '@/types';
import { type MessageListHandle } from '@/components/MessageList';
import { useAuthStore } from '@/store/authStore';
import { useShellNavStore } from '@/store/shellNavStore';
import { normalizeChatType } from '@/utils/chatType';
import { chatSyncTailKey } from '@/utils/chatSyncScope';
import { cancelAllForContext } from '@/services/chatSendService';
import type { LocationState, GameChatProps } from './types';
import { getContextTypeFromRoute } from './types';
import { useGameChatContext } from './useGameChatContext';
import { useChatThreadController } from '@/services/chat/chatThreadController/useChatThreadController';
import { useThreadViewChrome } from './useThreadViewChrome';
import { recordChatThreadOpened } from '@/services/chat/chatThreadOpenStats';
import type { SendQueuedParams } from '@/components/chat/useMessageInputSubmit';
import type { ThreadViewValue } from './ThreadViewContext';
import { createChatNearBottomStore } from './chatNearBottomStore';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const contextType = getContextTypeFromRoute(location.pathname, locationState, isEmbedded, propChatType);
  const initialChatType = locationState?.initialChatType
    ? normalizeChatType(locationState.initialChatType)
    : undefined;

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<MessageListHandle>(null);
  const previousIdRef = useRef<string | undefined>(id);
  const currentIdRef = useRef<string | undefined>(id);
  currentIdRef.current = id;
  const socketHandlersRef = useRef<import('@/services/chat/chatThreadController/useChatThreadController').ChatThreadSocketHandlers | null>(null);

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
  const setChatNearBottom = useCallback((near: boolean) => {
    chatNearBottomStoreRef.current.set(near);
  }, []);
  const subscribeChatNearBottom = useCallback(
    (listener: () => void) => chatNearBottomStoreRef.current.subscribe(listener),
    []
  );
  const getChatNearBottom = useCallback(() => chatNearBottomStoreRef.current.get(), []);

  const {
    game,
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

  useEffect(() => {
    if (contextType !== 'GAME' || !id) return;
    const q = searchParams.get('chatType');
    if (!q || q.toUpperCase() !== 'PHOTOS') return;
    if (isEmbedded) {
      navigate(`/games/${id}`, { replace: true });
      return;
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('chatType');
        return next;
      },
      { replace: true }
    );
    setCurrentChatType('PUBLIC');
  }, [contextType, id, isEmbedded, navigate, searchParams, setSearchParams]);

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
    groupChannel,
    groupChannelId: groupChannel?.id,
    loadContext,
    setCurrentChatType,
    setIsBlockedByUser,
    setIsMuted,
    setTranslateToLanguageForChat,
    setIsLoadingContext,
    isBlockedByUser,
    isJoiningAsGuest,
    socketHandlersRef,
  });

  const { setPage, setHasMoreMessages, setReplyTo, setEditingMessage } = thread;

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
    setMessages: thread.setMessages,
    messagesRef: thread.messagesRef,
    setPage: thread.setPage,
    setHasMoreMessages: thread.setHasMoreMessages,
    setIsSwitchingChatType: thread.setIsSwitchingChatType,
    teardownForChatTypeSwitch: thread.teardownForChatTypeSwitch,
    commitChatTypeSwitchPaint: thread.commitChatTypeSwitchPaint,
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

  useLayoutEffect(() => {
    if (id === previousIdRef.current) return;
    const prevId = previousIdRef.current;
    if (prevId) cancelAllForContext(contextType, prevId);
    setGame(null);
    setBug(null);
    setUserChat(null);
    setGroupChannel(null);
    setGroupChannelParticipantsCount(0);
    setPage(1);
    setHasMoreMessages(true);
    setIsLoadingContext(true);
    setIsBlockedByUser(false);
    setIsMuted(false);
    setReplyTo(null);
    setEditingMessage(null);
    setCurrentChatType(initialChatType || 'PUBLIC');
    previousIdRef.current = id;
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
    pinnedMessages: thread.pinnedMessages,
    pinnedMessagesOrdered: thread.pinnedMessagesOrdered,
    pinnedBarTopIndex: thread.pinnedBarTopIndex,
    loadingScrollTargetId: thread.loadingScrollTargetId,
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
    chatContainerRef,
    showLoadingHeader,
    navigate,
  };
}
