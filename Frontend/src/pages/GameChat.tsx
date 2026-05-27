import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { chatApi, type ChatMessage } from '@/api/chat';
import toast from 'react-hot-toast';
import { formatChatMessageForForwardClipboard } from '@/utils/chatForwardClipboard';
import { ChatType } from '@/types';
import { MessageList, type MessageListHandle } from '@/components/MessageList';
import { ChatParticipantsModal } from '@/components/ChatParticipantsModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { useAuthStore } from '@/store/authStore';
import { useNavigationStore } from '@/store/navigationStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { normalizeChatType } from '@/utils/chatType';
import { chatSyncTailKey } from '@/utils/chatSyncScope';
import { deleteChatThreadMemory } from '@/services/chat/chatThreadMemoryCache';
import { GroupChannelSettings } from '@/components/chat/GroupChannelSettings';
import { ChatContextPanel } from '@/components/chat/contextPanels';
import { PinnedMessagesBar } from '@/components/chat/PinnedMessagesBar';
import { MarketItemPanel } from '@/components/marketplace';
import { PlayerCardBottomSheet } from '@/components/PlayerCardBottomSheet';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import { cancelAllForContext } from '@/services/chatSendService';
import { AnimatePresence, motion } from 'framer-motion';
import type { LocationState, GameChatProps } from './GameChat/types';
import { getContextTypeFromRoute } from './GameChat/types';
import { GameChatHeader } from './GameChat/GameChatHeader';
import { GameChatTabs } from './GameChat/GameChatTabs';
import { GameChatFooter } from './GameChat/GameChatFooter';
import { GameChatAccessDenied } from './GameChat/GameChatAccessDenied';
import { useGameChatPinned } from './GameChat/useGameChatPinned';
import { useGameChatContext } from './GameChat/useGameChatContext';
import { useGameChatMessages } from './GameChat/useGameChatMessages';
import { logReloadMessagesFirstPage } from '@/services/chat/chatOpenTrace';
import { useGameChatActions } from './GameChat/useGameChatActions';
import { useGameChatOptimistic } from './GameChat/useGameChatOptimistic';
import { useGameChatSocket } from './GameChat/useGameChatSocket';
import { useGameChatDisplay } from './GameChat/useGameChatDisplay';
import { useGameChatReactions } from './GameChat/useGameChatReactions';
import { useGameChatMutationRetry } from './GameChat/useGameChatMutationRetry';
import { useGameChatDerived } from './GameChat/useGameChatDerived';
import { useGameChatPanels } from './GameChat/useGameChatPanels';
import { useGameChatInitialLoad } from './GameChat/useGameChatInitialLoad';
import { useGameChatFooterVariant } from './GameChat/useGameChatFooterVariant';
import { recordChatThreadOpened } from '@/services/chat/chatThreadOpenStats';
import { reconcileThreadIndexOutboxForContext } from '@/services/chat/chatThreadIndex';
import type { ChatContextType } from '@/api/chat';
import { ChatAutoTranslateContext } from '@/contexts/ChatAutoTranslateContext';
import { useGameChatAutoTranslate } from './GameChat/useGameChatAutoTranslate';
import { useGameChatTranslationLive } from './GameChat/useGameChatTranslationLive';
import { useGameChatChannelActivity } from './GameChat/useGameChatChannelActivity';
import { markContextReadOnUserActivity } from '@/services/chat/unreadCoordinator';
import { buildGameChatMarkReadParams } from '@/services/chat/gameChatMarkReadParams';
import { parseGameSport } from '@/utils/gameSport';
import { SportLevelProvider } from '@/contexts/SportLevelContext';

export const GameChat: React.FC<GameChatProps> = ({ isEmbedded = false, chatId: propChatId, chatType: propChatType }) => {
  const { t } = useTranslation();
  const { id: paramId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const { setBottomTabsVisible, setChatsFilter } = useNavigationStore();

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
    invalidateThreadOpen,
    scrollToBottom,
    loadMessages,
    loadMoreMessages,
    loadMessagesBeforeMessageId,
    bootstrapThread,
  } = useGameChatMessages({
    id,
    contextType,
    currentChatType,
    effectiveChatType,
    chatContainerRef,
    messageListRef,
    currentIdRef,
    freshOpenSignal: locationState?.forceReload ?? 0,
    openAnchorMessageId: locationState?.anchorMessageId,
  });

  const reloadMessagesFirstPage = useCallback(async () => {
    if (!id) return;
    logReloadMessagesFirstPage(contextType, id);
    await loadMessages(false, contextType === 'GAME' ? effectiveChatType : undefined);
  }, [id, contextType, effectiveChatType, loadMessages]);

  const scrollToBottomSmooth = useCallback(() => {
    messageListRef.current?.scrollToBottomSmooth();
  }, []);

  const { channelActivity, channelActivityResolved, noteUserMessage } = useGameChatChannelActivity(
    contextType === 'GAME' ? game : null,
    user?.id
  );

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
  const { handleTitleClick: handlePanelTitleClick } = panels;

  const {
    handleAddOptimisticMessage,
    handleMarkFailed,
    handleSendQueued,
    handleResendQueued,
    handleRemoveFromQueue,
    handleSendFailed,
    handleReplaceOptimisticWithServerMessage,
    handleNewMessage: handleNewMessageBase,
    handleNewMessageRef,
  } = useGameChatOptimistic({
    id,
    contextType,
    currentChatType,
    user,
    setMessages,
    messagesRef,
    scrollToBottom,
    setUserChat,
  });

  const handleNewMessage = useCallback(
    (message: import('@/api/chat').ChatMessage) => {
      if (contextType === 'GAME') noteUserMessage(message);
      return handleNewMessageBase(message);
    },
    [contextType, noteUserMessage, handleNewMessageBase]
  );

  useEffect(() => {
    handleNewMessageRef.current = handleNewMessage;
  }, [handleNewMessage, handleNewMessageRef]);

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
    setIsLoadingMessages,
    setIsInitialLoad,
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

  useGameChatSocket({
    id,
    contextType,
    effectiveChatType,
    currentIdRef,
    userId: user?.id,
    setMessages,
    messagesRef,
    chatContainerRef,
    handleNewMessage,
    handleMessageReaction,
    handleReadReceipt,
    handleMessageDeleted,
    fetchPinnedMessages,
    handleMessageUpdated,
    reloadMessagesFirstPage,
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

  const autoTranslateForModal = useMemo(() => {
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

  useEffect(() => {
    if (!isEmbedded) {
      setBottomTabsVisible(false);
      return () => setBottomTabsVisible(true);
    }
  }, [setBottomTabsVisible, isEmbedded]);

  useBackButtonHandler(panels.handleBackButton);

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

  useGameChatInitialLoad({
    id,
    user,
    contextType,
    initialChatType,
    currentChatType,
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
  });

  /**
   * A1.3 reset on chatId change (stable ChatsTab shell): context + UI refs only.
   * Messages/virtualizer/scroll/socket: useGameChatMessages useLayoutEffect (L1 seed first).
   * Must not setMessages here — runs after L1 layout seed in the same commit.
   */
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

  useEffect(() => {
    if (locationState?.forceReload && threadScrollKey) {
      deleteChatThreadMemory(threadScrollKey);
    }
    if (locationState?.forceReload) {
      invalidateThreadOpen();
    }
  }, [locationState?.forceReload, threadScrollKey, invalidateThreadOpen]);

  const footerVariant = useGameChatFooterVariant({
    id,
    contextType,
    isBlockedByUser,
    userChat,
    userId: user?.id,
    messagesLength: messages.length,
    canAccessChat: !!derived.canAccessChat,
    canWriteChat: !!derived.canWriteChat,
    isChannelParticipantOnly: !!derived.isChannelParticipantOnly,
    game,
    bug,
    groupChannel,
    isInJoinQueue: !!derived.isInJoinQueue,
    isChannelParticipant: !!derived.isChannelParticipant,
    isPlayingParticipant: !!derived.isPlayingParticipant,
    isAdminOrOwner: !!derived.isAdminOrOwner,
    isChannel: !!derived.isChannel,
    isJoiningAsGuest,
    currentChatType,
    translateToLanguageForChat,
    setUserChat,
    setTranslateToLanguageForChat,
    autoTranslateForModal,
    loadContext,
    handleAddOptimisticMessage,
    handleSendQueued: handleSendQueued as (params: any) => void,
    handleSendFailed,
    handleReplaceOptimisticWithServerMessage,
    replyTo,
    handleCancelReply,
    editingMessage,
    handleCancelEdit,
    handleMessageUpdated,
    lastOwnMessage: derived.lastOwnMessage,
    handleEditMessage,
    handleScrollToMessage,
    handleJoinAsGuest,
    chatNearBottom,
    scrollToBottomSmooth,
    onMessageSent: handleMessageSent,
  });

  const isChatsSplitGameChat = useMemo(
    () =>
      isEmbedded &&
      contextType === 'GAME' &&
      !!id &&
      /^\/games\/[^/]+\/chat$/.test(location.pathname),
    [isEmbedded, contextType, id, location.pathname]
  );

  const isTitleClickable = useMemo(
    () =>
      !!(contextType === 'USER' && userChat && user?.id) ||
      contextType === 'GROUP' ||
      isChatsSplitGameChat,
    [contextType, userChat, user?.id, isChatsSplitGameChat]
  );

  const handleTitleClick = useCallback(() => {
    if (isChatsSplitGameChat && id) {
      navigate(`/games/${id}`);
      return;
    }
    handlePanelTitleClick();
  }, [isChatsSplitGameChat, id, navigate, handlePanelTitleClick]);

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
  const pinnedBarSkipAnimationRef = useRef(true);
  useEffect(() => {
    pinnedBarSkipAnimationRef.current = true;
  }, [threadScrollKey]);
  useEffect(() => {
    if (pinnedMessagesOrdered.length > 0 && pinnedBarSkipAnimationRef.current) {
      pinnedBarSkipAnimationRef.current = false;
    }
  }, [pinnedMessagesOrdered.length, threadScrollKey]);
  const pinnedBarAnimate = !pinnedBarSkipAnimationRef.current;

  if (!derived.canViewPublicChat) {
    return <GameChatAccessDenied id={id} navigate={navigate} />;
  }

  const chatLevelSport = contextType === 'GAME' && game ? parseGameSport(game.sport) : undefined;

  return (
    <SportLevelProvider sport={chatLevelSport}>
    <>
      <div
        ref={chatContainerRef}
        className={`chat-container relative bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden overflow-x-hidden ${isEmbedded ? 'chat-embedded h-full' : 'h-screen'} ${(panels.showParticipantsPage || panels.showItemPage) ? 'hidden' : ''}`}
      >
        <GameChatHeader
          isEmbedded={isEmbedded}
          showLoadingHeader={showLoadingHeader}
          contextType={contextType}
          isBugChat={derived.isBugChat}
          title={title}
          titleContent={titleContent}
          titleMetaRow={titleMetaRow}
          subtitle={baseSubtitle ?? null}
          icon={icon}
          onBack={panels.handleHeaderBack}
          showPanelBack={contextType === 'GROUP' && (panels.showParticipantsPage || panels.showItemPage || panels.isParticipantsPageAnimating || panels.isItemPageAnimating)}
          onPanelBack={panels.handlePanelBack}
          isTitleClickable={isTitleClickable}
          onTitleClick={handleTitleClick}
          showHeaderActions={derived.showHeaderActions}
          headerActions={derived.showHeaderActions ? {
            showMute: derived.showMute,
            showLeave: derived.showLeave,
            showParticipantsButton: contextType === 'GAME',
            isMuted,
            isTogglingMute,
            onToggleMute: handleToggleMute,
            onLeaveClick: () => setShowLeaveConfirmation(true),
            leaveTitle: derived.leaveTitle,
            game,
            onParticipantsClick: () => panels.setShowParticipantsModal(true),
          } : null}
        />

        {!showLoadingHeader && failedMutationCount > 0 && (
          <button
            type="button"
            onClick={() => retryMutations()}
            className="w-full text-center text-sm py-2 px-3 bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 border-b border-amber-200 dark:border-amber-800"
          >
            {t('chat.mutationsSyncFailed', { defaultValue: 'Some actions did not sync. Tap to retry.' })}
          </button>
        )}

        {!showLoadingHeader && contextType === 'GAME' && ((derived.isParticipant && derived.isPlayingParticipant) || derived.isAdminOrOwner || (game?.status && game.status !== 'ANNOUNCED')) && (
          <GameChatTabs
            availableChatTypes={derived.availableChatTypes}
            currentChatType={currentChatType}
            isSwitchingChatType={isSwitchingChatType}
            onChatTypeChange={handleChatTypeChange}
          />
        )}

        <AnimatePresence>
          {!showLoadingHeader && pinnedMessagesOrdered.length > 0 && !panels.showParticipantsPage && !panels.showItemPage && (
            <motion.div
              key="pinned-bar"
              initial={pinnedBarAnimate ? { opacity: 0, maxHeight: 0 } : false}
              animate={{ opacity: 1, maxHeight: pinnedBarAnimate ? 80 : undefined }}
              exit={pinnedBarAnimate ? { opacity: 0, maxHeight: 0 } : undefined}
              transition={pinnedBarAnimate ? { duration: 0.25, ease: 'easeInOut' } : { duration: 0 }}
              className="overflow-hidden"
            >
              <PinnedMessagesBar
                pinnedMessages={[pinnedMessagesOrdered[0]]}
                currentIndex={pinnedBarTopIndex + 1}
                totalCount={pinnedMessages.length}
                loadingScrollTargetId={loadingScrollTargetId}
                onItemClick={handlePinnedBarClick}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <main
          className="flex-1 flex flex-col min-h-0 overflow-hidden overflow-x-hidden relative transition-opacity duration-150"
        >
          <AnimatePresence>
            {!showLoadingHeader && pinnedMessagesOrdered.length > 0 && !panels.showParticipantsPage && !panels.showItemPage && (
              <motion.div key="pinned-shadow" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="absolute top-0 left-0 right-0 z-[1] pointer-events-none">
                <div className="h-4 w-full dark:hidden" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.1), transparent)' }} />
                <div className="h-4 w-full hidden dark:block" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.3), transparent)' }} />
              </motion.div>
            )}
          </AnimatePresence>

          {!showLoadingHeader && !panels.showParticipantsPage && !panels.showItemPage && (
            <ChatContextPanel
              contextType={contextType as 'GAME' | 'USER' | 'GROUP'}
              bug={bug}
              marketItem={groupChannel?.marketItem}
              groupChannel={groupChannel}
              canEditBug={derived.canEditBug}
              onUpdate={() => id && loadContext({ force: true }).then(() => loadMessages())}
              onJoinChannel={handleJoinChannel}
            />
          )}

          {contextType === 'GROUP' && derived.isItemChat && (panels.showItemPage || panels.isItemPageAnimating) && groupChannel?.marketItem && (
            <div
              className={`absolute inset-0 h-full transition-all duration-300 ease-in-out bg-gray-50 dark:bg-gray-900 ${
                panels.showItemPage && !panels.isItemPageAnimating ? 'opacity-100 translate-x-0 z-10' : 'opacity-0 translate-x-full z-0 pointer-events-none'
              }`}
              onTransitionEnd={() => panels.isItemPageAnimating && !panels.showItemPage && panels.setIsItemPageAnimating(false)}
            >
              <MarketItemPanel
                item={groupChannel.marketItem}
                onClose={panels.closeItemPage}
                onItemUpdate={() => id && loadContext({ force: true }).then(() => loadMessages())}
              />
            </div>
          )}

          {contextType === 'GROUP' && !derived.isItemChat && (panels.showParticipantsPage || panels.isParticipantsPageAnimating) && groupChannel && (
            <div
              className={`absolute inset-0 h-full transition-all duration-300 ease-in-out bg-gray-50 dark:bg-gray-900 ${
                panels.showParticipantsPage && !panels.isParticipantsPageAnimating ? 'opacity-100 translate-x-0 z-10' : 'opacity-0 translate-x-full z-0 pointer-events-none'
              }`}
              onTransitionEnd={() => panels.isParticipantsPageAnimating && !panels.showParticipantsPage && panels.setIsParticipantsPageAnimating(false)}
            >
              <GroupChannelSettings
                groupChannel={groupChannel}
                onParticipantsCountChange={setGroupChannelParticipantsCount}
                onUpdate={async () => {
                  if (id) {
                    const updated = await chatApi.getGroupChannelById(id);
                    setGroupChannel(updated.data);
                    setGroupChannelParticipantsCount(updated.data.participantsCount || 0);
                  }
                }}
              />
            </div>
          )}

          <div
            className={`flex-1 flex flex-col min-h-0 transition-all duration-300 ease-in-out ${
              panels.showParticipantsPage || panels.showItemPage || panels.isParticipantsPageAnimating || panels.isItemPageAnimating ? 'opacity-0 -translate-x-full' : 'opacity-100 translate-x-0'
            }`}
          >
            <ChatAutoTranslateContext.Provider
              value={autoTranslate.autoTranslateConfig?.languageCodes ?? []}
            >
            <MessageList
              ref={messageListRef}
              messages={messages}
              onChatScrollNearBottomChange={setChatNearBottom}
              onAddReaction={handleAddReaction}
              onRemoveReaction={handleRemoveReaction}
              onDeleteMessage={handleDeleteMessage}
              onReplyMessage={handleReplyMessage}
              onEditMessage={handleEditMessage}
              onPollUpdated={handlePollUpdated}
              onResendQueued={handleResendQueued}
              onRemoveFromQueue={handleRemoveFromQueue}
              isLoading={isLoadingMore}
              isLoadingMessages={isLoadingMessages && !isEmbedded}
              isSwitchingChatType={isSwitchingChatType}
              onScrollToMessage={handleScrollToMessage}
              hasMoreMessages={hasMoreMessages}
              onLoadMore={loadMoreMessages}
              isInitialLoad={isInitialLoad && !isEmbedded}
              isLoadingMore={isLoadingMore}
              isChannel={derived.isChannel}
              userChatUser1Id={contextType === 'USER' && userChat ? userChat.user1Id : undefined}
              userChatUser2Id={contextType === 'USER' && userChat ? userChat.user2Id : undefined}
              onChatRequestRespond={handleChatRequestRespond}
              hasContextPanel={!showLoadingHeader && !panels.showParticipantsPage && !panels.showItemPage}
              pinnedMessageIds={pinnedMessages.map(m => m.id)}
              onPin={derived.canWriteChat ? handlePinMessage : undefined}
              onUnpin={derived.canWriteChat ? handleUnpinMessage : undefined}
              showReply={!derived.isChannel || (derived.canWriteChat ?? false)}
              onForwardMessage={handleForwardMessage}
              threadScrollKey={threadScrollKey}
              initialScroll={initialScroll}
              openPaintGeneration={openPaintGeneration}
              threadLayoutSettling={isThreadOpenSettling || isSwitchingChatType || initialScroll === undefined}
            />
            </ChatAutoTranslateContext.Provider>
          </div>
        </main>

        {((!isInitialLoad || isEmbedded || (isEmbedded && messages.length > 0)) ||
          footerVariant?.type === 'contextLoading') &&
          footerVariant != null &&
          !(contextType === 'GROUP' &&
            (panels.showParticipantsPage ||
              panels.showItemPage ||
              panels.isParticipantsPageAnimating ||
              panels.isItemPageAnimating)) && (
          <GameChatFooter visible variant={footerVariant} />
        )}

        {contextType === 'GAME' && panels.showParticipantsModal && game && (
          <ChatParticipantsModal game={game} onClose={() => panels.setShowParticipantsModal(false)} currentChatType={currentChatType} />
        )}

        {contextType === 'USER' && (
          <PlayerCardBottomSheet
            playerId={panels.showPlayerCard && userChat && user?.id ? (userChat.user1Id === user.id ? userChat.user2Id : userChat.user1Id) ?? null : null}
            onClose={() => panels.setShowPlayerCard(false)}
          />
        )}

        {(contextType === 'GAME' || derived.isBugChat || contextType === 'GROUP') && (
          <ConfirmationModal
            isOpen={showLeaveConfirmation}
            title={contextType === 'GAME' ? leaveModalLabels.title : t('chat.leave')}
            message={contextType === 'GAME' ? leaveModalLabels.message : t('chat.leaveConfirmation')}
            confirmText={contextType === 'GAME' ? leaveModalLabels.confirmText : t('chat.leave')}
            cancelText={t('common.cancel')}
            confirmVariant="danger"
            onConfirm={handleLeaveChat}
            onClose={() => setShowLeaveConfirmation(false)}
          />
        )}
      </div>
    </>
    </SportLevelProvider>
  );
};
