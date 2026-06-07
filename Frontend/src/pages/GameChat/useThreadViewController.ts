import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { chatApi, type ChatMessage } from '@/api/chat';
import toast from 'react-hot-toast';
import { formatChatMessageForForwardClipboard } from '@/utils/chatForwardClipboard';
import { ChatType } from '@/types';
import { type MessageListHandle } from '@/components/MessageList';
import { useAuthStore } from '@/store/authStore';
import { useNavigationStore } from '@/store/navigationStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { normalizeChatType } from '@/utils/chatType';
import { chatSyncTailKey } from '@/utils/chatSyncScope';
import { cancelAllForContext } from '@/services/chatSendService';
import type { LocationState, GameChatProps } from './types';
import { getContextTypeFromRoute } from './types';
import { useGameChatPinned } from './useGameChatPinned';
import { useGameChatContext } from './useGameChatContext';
import { useGameChatSession } from './useGameChatSession';
import { useThreadSessionEffects } from './useThreadSessionEffects';
import { useGameChatActions } from './useGameChatActions';
import { useGameChatDisplay } from './useGameChatDisplay';
import { useGameChatReactions } from './useGameChatReactions';
import { useGameChatMutationRetry } from './useGameChatMutationRetry';
import { useGameChatDerived } from './useGameChatDerived';
import { useGameChatPanels } from './useGameChatPanels';
import { useGameChatFooterVariant } from './useGameChatFooterVariant';
import { recordChatThreadOpened } from '@/services/chat/chatThreadOpenStats';
import { reconcileThreadIndexOutboxForContext } from '@/services/chat/chatThreadIndex';
import type { ChatContextType } from '@/api/chat';
import { useGameChatAutoTranslate } from './useGameChatAutoTranslate';
import { useGameChatTranslationLive } from './useGameChatTranslationLive';
import { useGameChatChannelActivity } from './useGameChatChannelActivity';
import { markContextReadOnUserActivity } from '@/services/chat/unreadCoordinator';
import { buildGameChatMarkReadParams } from '@/services/chat/gameChatMarkReadParams';
import type { SendQueuedParams } from '@/components/chat/useMessageInputSubmit';
import type { ThreadViewValue } from './ThreadViewContext';
import type { TranslationModalAutoTranslateProps } from '@/components/chat/TranslationLanguageModal';

export function useThreadViewController({
  isEmbedded = false,
  chatId: propChatId,
  chatType: propChatType,
}: GameChatProps): ThreadViewValue {
  const { t } = useTranslation();
  const { id: paramId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const { setChatsFilter } = useNavigationStore();

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

  const [currentChatType, setCurrentChatType] = useState<ChatType>(initialChatType ?? 'PUBLIC');

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

  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const [isLeavingChat, setIsLeavingChat] = useState(false);
  const [isJoiningAsGuest, setIsJoiningAsGuest] = useState(false);
  const [isBlockedByUser, setIsBlockedByUser] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isTogglingMute, setIsTogglingMute] = useState(false);
  const [translateToLanguageForChat, setTranslateToLanguageForChat] = useState<string | null>(null);
  const [chatNearBottom, setChatNearBottom] = useState(true);

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

  useEffect(() => {
    const ct = contextType as ChatContextType;
    const cid = id;
    return () => {
      if (!cid) return;
      if (ct !== 'USER' && ct !== 'GROUP' && ct !== 'GAME' && ct !== 'BUG') return;
      void reconcileThreadIndexOutboxForContext(ct, cid);
    };
  }, [id, contextType]);

  const threadScrollKey = useMemo(() => {
    if (!id) return null;
    return chatSyncTailKey(
      contextType,
      id,
      contextType === 'GAME' ? effectiveChatType : undefined
    );
  }, [id, contextType, effectiveChatType]);

  const { channelActivity, channelActivityResolved, noteUserMessage } = useGameChatChannelActivity(
    contextType === 'GAME' ? game : null,
    user?.id
  );

  const {
    messages,
    setMessages,
    messagesRef,
    setPage,
    hasMoreMessages,
    setHasMoreMessages,
    isLoadingMessages,
    setIsLoadingMessages,
    isInitialLoad,
    setIsInitialLoad,
    isThreadOpenSettling,
    isLoadingMore,
    isSwitchingChatType,
    setIsSwitchingChatType,
    loadingIdRef,
    hasLoadedRef,
    isLoadingRef,
    initialScroll,
    openPaintGeneration,
    openPaintCommittedRef,
    scrollToBottom,
    loadMessages,
    loadMoreMessages,
    loadMessagesBeforeMessageId,
    teardownForChatTypeSwitch,
    commitChatTypeSwitchPaint,
    pinAfterSocketMergeIfAllowed,
    handleAddOptimisticMessage,
    handleMarkFailed,
    handleSendQueued,
    handleResendQueued,
    handleRemoveFromQueue,
    handleSendFailed,
    handleReplaceOptimisticWithServerMessage,
    handleNewMessage,
    handleNewMessageRef,
    reloadMessagesFirstPage,
    bootstrapThread,
  } = useGameChatSession({
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
    onInboundMessage: contextType === 'GAME' ? noteUserMessage : undefined,
  });

  const scrollToBottomSmooth = useCallback(() => {
    messageListRef.current?.scrollToBottomSmooth();
  }, []);

  const derived = useGameChatDerived({
    game,
    groupChannel,
    user,
    contextType,
    currentChatType,
    messages,
    channelActivity: contextType === 'GAME' ? channelActivity : undefined,
  });

  useEffect(() => {
    if (contextType !== 'GAME' || !channelActivityResolved) return;
    if (!derived.availableChatTypes.includes(currentChatType)) {
      setCurrentChatType('PUBLIC');
    }
  }, [contextType, channelActivityResolved, derived.availableChatTypes, currentChatType]);

  useEffect(() => {
    if (contextType !== 'GAME') return;
    if (effectiveChatType === 'PRIVATE' || effectiveChatType === 'ADMINS') {
      const hasUser = messages.some((m) => m.senderId != null);
      if (hasUser) {
        noteUserMessage({
          senderId: user?.id ?? 'probe',
          chatType: effectiveChatType,
        } as ChatMessage);
      }
    }
  }, [contextType, effectiveChatType, messages, noteUserMessage, user?.id]);

  const autoTranslate = useGameChatAutoTranslate({
    id,
    contextType,
    effectiveChatType,
    userId: user?.id,
    userIsAdmin: user?.isAdmin,
    groupChannel,
    game,
    userChat,
    bugSenderId: groupChannel?.bug?.senderId,
  });

  useGameChatTranslationLive({
    id,
    contextType,
    effectiveChatType,
    userLanguage: user?.language,
    setMessages,
    messagesRef,
    onAutoTranslateConfigFromSocket: autoTranslate.setAutoTranslateFromSocket,
  });

  const panels = useGameChatPanels({
    contextType,
    userChat,
    userId: user?.id,
    isItemChat: derived.isItemChat,
    navigate,
  });

  const {
    replyTo,
    editingMessage,
    setReplyTo,
    setEditingMessage,
    handleAddReaction,
    handleRemoveReaction,
    handlePollUpdated,
    handleDeleteMessage,
    handleReplyMessage,
    handleCancelReply,
    handleEditMessage,
    handleCancelEdit,
    handleMessageUpdated,
    handleMessageReaction,
    handleReadReceipt,
    handleMessageDeleted,
    handleChatRequestRespond,
  } = useGameChatReactions({ id, contextType, user, setMessages, messagesRef, setUserChat });

  const handleForwardMessage = useCallback(
    async (m: ChatMessage) => {
      const text = formatChatMessageForForwardClipboard(m);
      if (!text.trim()) return;
      try {
        if (typeof navigator.share === 'function') {
          try {
            await navigator.share({ text });
            return;
          } catch (shareErr: unknown) {
            if ((shareErr as { name?: string })?.name === 'AbortError') return;
          }
        }
        await navigator.clipboard.writeText(text);
        toast.success(t('chat.forwardCopied', { defaultValue: 'Copied — paste in another chat' }));
      } catch {
        toast.error(t('chat.forwardFailed', { defaultValue: 'Could not forward' }));
      }
    },
    [t]
  );

  const { failedMutationCount, retryMutations } = useGameChatMutationRetry(contextType, id);

  const {
    pinnedMessages,
    pinnedMessagesOrdered,
    pinnedBarTopIndex,
    loadingScrollTargetId,
    fetchPinnedMessages,
    handleScrollToMessage,
    handlePinnedBarClick,
    handlePinMessage,
    handleUnpinMessage,
  } = useGameChatPinned({
    id,
    contextType,
    effectiveChatType,
    canAccessChat: !!derived.canAccessChat,
    chatContainerRef,
    messageListRef,
    loadMessagesBeforeMessageId,
    messagesRef,
  });

  const {
    leaveModalLabels,
    handleJoinAsGuest,
    handleLeaveChat,
    handleToggleMute,
    handleJoinChannel,
    handleChatTypeChange,
  } = useGameChatActions({
    currentIdRef,
    id,
    contextType,
    loadContext,
    navigate,
    setChatsFilter,
    setGame,
    setGroupChannel,
    groupChannel,
    userParticipant: derived.userParticipant,
    currentChatType,
    setCurrentChatType,
    setPage,
    setHasMoreMessages,
    setMessages,
    messagesRef,
    setIsSwitchingChatType,
    teardownForChatTypeSwitch,
    commitChatTypeSwitchPaint,
    handleMarkFailed,
    handleNewMessageRef,
    scrollToBottom,
    user,
    isLeavingChat,
    setIsLeavingChat,
    setShowLeaveConfirmation,
    setIsJoiningAsGuest,
    setIsMuted,
    setIsTogglingMute,
    isMuted,
  });

  const displaySettings = user ? resolveDisplaySettings(user) : resolveDisplaySettings(null);
  const { title, titleContent, titleMetaRow, subtitle: baseSubtitle, icon } = useGameChatDisplay({
    contextType,
    game,
    bug,
    userChat,
    groupChannel,
    groupChannelParticipantsCount,
    isBugChat: derived.isBugChat,
    isItemChat: derived.isItemChat,
    userId: user?.id,
    displaySettings,
    onOpenItemPage: panels.onOpenItemPage,
    onOpenParticipantsPage: panels.onOpenParticipantsPage,
  });

  const autoTranslateForModal = useMemo((): TranslationModalAutoTranslateProps | null => {
    if (!id) return null;
    return {
      languageCodes: autoTranslate.autoTranslateConfig?.languageCodes ?? [],
      maxSlots: autoTranslate.autoTranslateConfig?.maxSlots ?? autoTranslate.effectiveMaxSlots,
      canEdit: autoTranslate.canEditAutoTranslate,
      onChange: autoTranslate.applyAutoTranslateLanguageCodes,
    };
  }, [
    id,
    autoTranslate.autoTranslateConfig?.languageCodes,
    autoTranslate.autoTranslateConfig?.maxSlots,
    autoTranslate.effectiveMaxSlots,
    autoTranslate.canEditAutoTranslate,
    autoTranslate.applyAutoTranslateLanguageCodes,
  ]);

  const handleMessageSent = useCallback(() => {
    const params = buildGameChatMarkReadParams({
      id,
      contextType,
      game,
      userId: user?.id,
      gameChatType: effectiveChatType,
      groupChannelId: groupChannel?.id,
    });
    if (params) markContextReadOnUserActivity(params);
  }, [id, contextType, game, user?.id, effectiveChatType, groupChannel?.id]);

  const handleTranslateToLanguageChange = useCallback(
    async (value: string | null) => {
      if (!id) return;
      await chatApi.setChatTranslationPreference(contextType, id, value);
      setTranslateToLanguageForChat(value);
    },
    [id, contextType]
  );

  const handleGroupChannelUpdate = useMemo(
    () => (contextType === 'GROUP' ? () => { void loadContext({ force: true }); } : undefined),
    [contextType, loadContext]
  );

  useThreadSessionEffects({
    id,
    user,
    contextType,
    initialChatType,
    currentChatType,
    effectiveChatType,
    game,
    groupChannelId: groupChannel?.id,
    loadContext,
    bootstrapThread,
    userChat,
    handleMarkFailed,
    handleReplaceOptimistic: handleReplaceOptimisticWithServerMessage,
    handleNewMessageRef,
    loadingIdRef,
    hasLoadedRef,
    isLoadingRef,
    messagesRef,
    openPaintCommittedRef,
    freshOpenSignal: locationState?.forceReload ?? 0,
    setMessages,
    setCurrentChatType,
    setIsBlockedByUser,
    setIsMuted,
    setTranslateToLanguageForChat,
    setIsInitialLoad,
    setIsLoadingMessages,
    setIsLoadingContext,
    currentIdRef,
    userId: user?.id,
    chatContainerRef,
    handleNewMessage,
    handleMessageReaction,
    handleReadReceipt,
    handleMessageDeleted,
    fetchPinnedMessages,
    handleMessageUpdated,
    reloadMessagesFirstPage,
    pinAfterSocketMergeIfAllowed,
  });

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

  const footerVariant = useGameChatFooterVariant({
    id,
    contextType,
    isBlockedByUser,
    userChat,
    userId: user?.id,
    canAccessChat: !!derived.canAccessChat,
    canWriteChat: !!derived.canWriteChat,
    isChannelParticipantOnly: !!derived.isChannelParticipantOnly,
    game,
    groupChannel,
    isInJoinQueue: !!derived.isInJoinQueue,
    isChannelParticipant: !!derived.isChannelParticipant,
    isChannel: !!derived.isChannel,
    isJoiningAsGuest,
  });

  const hasOpenContextStub = useMemo(
    () =>
      (contextType === 'USER' && userChat != null) ||
      (contextType === 'GROUP' && groupChannel != null) ||
      (contextType === 'GAME' && game != null),
    [contextType, userChat, groupChannel, game]
  );

  const showLoadingHeader = useMemo(() => {
    if (!isEmbedded || !isLoadingContext) return false;
    return !hasOpenContextStub && messages.length === 0;
  }, [isEmbedded, isLoadingContext, hasOpenContextStub, messages.length]);

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
    messages,
    hasMoreMessages,
    isLoadingMessages,
    isInitialLoad,
    isThreadOpenSettling,
    isLoadingMore,
    isSwitchingChatType,
    loadMessages,
    loadMoreMessages,
    messageListRef,
    initialScroll,
    openPaintGeneration,
    threadScrollKey,
    handleAddOptimisticMessage,
    handleSendQueued: handleSendQueued as (params: SendQueuedParams) => void,
    handleSendFailed,
    handleReplaceOptimisticWithServerMessage,
    handleResendQueued,
    handleRemoveFromQueue,
    replyTo,
    editingMessage,
    handleCancelReply,
    handleCancelEdit,
    handleMessageUpdated,
    handleEditMessage,
    handleAddReaction,
    handleRemoveReaction,
    handleDeleteMessage,
    handleReplyMessage,
    handlePollUpdated,
    handleForwardMessage,
    handleChatRequestRespond,
    chatNearBottom,
    setChatNearBottom,
    scrollToBottomSmooth,
    handleScrollToMessage,
    pinnedMessages,
    pinnedMessagesOrdered,
    pinnedBarTopIndex,
    loadingScrollTargetId,
    handlePinnedBarClick,
    handlePinMessage,
    handleUnpinMessage,
    derived,
    footerVariant,
    isBlockedByUser,
    isJoiningAsGuest,
    translateToLanguageForChat,
    autoTranslateForModal,
    handleJoinAsGuest,
    handleMessageSent,
    setUserChat,
    handleTranslateToLanguageChange,
    handleGroupChannelUpdate,
    lastOwnMessage: derived.lastOwnMessage,
    hasMessages: messages.length > 0,
    isChannel: derived.isChannel,
    title,
    titleContent,
    titleMetaRow,
    subtitle: baseSubtitle ?? null,
    icon,
    panels,
    failedMutationCount,
    retryMutations,
    autoTranslateLanguageCodes: autoTranslate.autoTranslateConfig?.languageCodes ?? [],
    handleToggleMute,
    handleLeaveChat,
    handleJoinChannel,
    handleChatTypeChange,
    leaveModalLabels,
    isMuted,
    isTogglingMute,
    showLeaveConfirmation,
    setShowLeaveConfirmation,
    chatContainerRef,
    showLoadingHeader,
    navigate,
  };
}
